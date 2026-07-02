# POI Import Feature — Full Plan

**Status:** Planning  
**Last Updated:** 2026-07-02

---

## 🎯 Overview

Replace Overpass API POI with **user-uploaded KML/KMZ files**. Users can import Google Maps collections, manage them, and view on map.

**Key Features:**
- ✅ Upload KML/KMZ files via RightIsland
- ✅ Auto-parse coordinates, names, descriptions
- ✅ Save to database per user
- ✅ Display as map markers with categories
- ✅ Filter/toggle categories
- ✅ Delete individual POI

---

## 📐 Architecture

### Data Flow

```
User uploads KML/KMZ
         ↓
POST /api/poi/upload (file_bytes)
         ↓
Backend: Parse KML/KMZ
         ├─ If .kmz → unzip → extract doc.kml
         └─ If .kml → parse directly
         ↓
Extract: name, lat, lon, description
         ↓
Auto-detect category (from name/tags)
         ↓
Save to `poi` table (per user_id)
         ↓
Return: categories + count
         ↓
Frontend: Display in RightIsland popover
         ↓
Show POI on map (POILayer)
```

---

## 💾 DATABASE

### New Table: `poi`

```sql
CREATE TABLE poi (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  lat FLOAT NOT NULL,
  lon FLOAT NOT NULL,
  category VARCHAR(100),           -- auto-detected: food, water, repair, bike, etc.
  description TEXT,                -- from KML description tag
  source VARCHAR(50),              -- 'uploaded' | 'google_maps'
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX (user_id),
  INDEX (category),
  CONSTRAINT valid_coords CHECK (lat >= -90 AND lat <= 90 AND lon >= -180 AND lon <= 180)
);
```

### Migration
- **File:** `backend/alembic/versions/0005_add_poi_table.py`
- Create table + indexes
- Reversible downgrade

---

## 🔧 BACKEND

### 1. Model: `app/models/poi.py` (NEW)

```python
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from app.core.database import Base
from datetime import datetime, timezone

class POI(Base):
    __tablename__ = "poi"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    category = Column(String(100), index=True)
    description = Column(Text)
    source = Column(String(50), default='uploaded')
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

### 2. Parser: `app/services/poi_parser.py` (NEW)

```python
import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO
from typing import List, Dict, Tuple

class POIParser:
    """Parse KML/KMZ files and extract POI data"""
    
    CATEGORY_KEYWORDS = {
        'food': ['cafe', 'restaurant', 'bar', 'pizza', 'burger', 'coffee'],
        'water': ['water', 'fountain', 'well', 'spring'],
        'repair': ['repair', 'workshop', 'mechanic', 'service'],
        'bike': ['bike', 'bicycle', 'cycling', 'rental'],
        'medical': ['hospital', 'clinic', 'doctor', 'pharmacy'],
    }
    
    @staticmethod
    def parse(file_bytes: bytes) -> Tuple[List[Dict], str]:
        """
        Parse KML or KMZ file
        Returns: (list of POI dicts, error message if any)
        """
        try:
            kml_content = POIParser._extract_kml(file_bytes)
            poi_list = POIParser._parse_kml_xml(kml_content)
            return poi_list, None
        except Exception as e:
            return [], str(e)
    
    @staticmethod
    def _extract_kml(file_bytes: bytes) -> bytes:
        """Extract KML from KMZ (ZIP) or return raw if KML"""
        if file_bytes[:2] == b'PK':  # ZIP magic bytes
            with zipfile.ZipFile(BytesIO(file_bytes)) as z:
                # Find .kml file (usually doc.kml)
                kml_files = [f for f in z.namelist() if f.endswith('.kml')]
                if not kml_files:
                    raise ValueError("No KML file found in KMZ")
                return z.read(kml_files[0])
        return file_bytes
    
    @staticmethod
    def _parse_kml_xml(kml_content: bytes) -> List[Dict]:
        """Parse KML XML and extract POI"""
        root = ET.fromstring(kml_content)
        
        # KML namespace
        ns = {'kml': 'http://www.opengis.net/kml/2.2'}
        poi_list = []
        
        # Find all Placemarks
        for placemark in root.findall('.//kml:Placemark', ns):
            try:
                name_elem = placemark.find('kml:name', ns)
                desc_elem = placemark.find('kml:description', ns)
                point_elem = placemark.find('.//kml:Point/kml:coordinates', ns)
                
                if point_elem is None or point_elem.text is None:
                    continue
                
                # Parse coordinates: "lon,lat" or "lon,lat,elevation"
                coords = point_elem.text.strip().split(',')
                if len(coords) < 2:
                    continue
                
                lon, lat = float(coords[0]), float(coords[1])
                
                # Extract name and description
                name = name_elem.text if name_elem is not None else "POI"
                desc = desc_elem.text if desc_elem is not None else ""
                
                # Auto-detect category
                category = POIParser._detect_category(name, desc)
                
                poi_list.append({
                    'name': name,
                    'lat': lat,
                    'lon': lon,
                    'category': category,
                    'description': desc,
                    'source': 'uploaded'
                })
            except Exception:
                continue  # Skip invalid placemarks
        
        return poi_list
    
    @staticmethod
    def _detect_category(name: str, description: str) -> str:
        """Auto-detect POI category from name/description"""
        text = (name + ' ' + description).lower()
        
        for category, keywords in POIParser.CATEGORY_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                return category
        
        return 'other'
```

### 3. API: `app/api/poi.py` (NEW)

```python
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.poi import POI
from app.services.poi_parser import POIParser

router = APIRouter(prefix="/api/poi", tags=["poi"])

MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_poi(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload KML or KMZ file with POI"""
    
    # Read file
    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 5 MB limit")
    
    # Parse
    poi_list, error = POIParser.parse(content)
    if error:
        raise HTTPException(status_code=400, detail=f"Parse error: {error}")
    
    if not poi_list:
        raise HTTPException(status_code=400, detail="No POI found in file")
    
    # Save to DB
    count = 0
    for poi_data in poi_list:
        poi = POI(
            user_id=current_user.id,
            name=poi_data['name'],
            lat=poi_data['lat'],
            lon=poi_data['lon'],
            category=poi_data['category'],
            description=poi_data['description'],
            source=poi_data['source'],
        )
        db.add(poi)
        count += 1
    
    db.commit()
    
    # Return stats
    categories = db.query(POI.category, func.count(POI.id))\
        .filter(POI.user_id == current_user.id)\
        .group_by(POI.category)\
        .all()
    
    return {
        'imported': count,
        'categories': [{'name': c[0], 'count': c[1]} for c in categories]
    }

@router.get("")
def list_poi(
    category: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's POI, optionally filtered by category"""
    q = db.query(POI).filter(POI.user_id == current_user.id)
    
    if category:
        q = q.filter(POI.category == category)
    
    return q.all()

@router.get("/categories")
def get_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get unique POI categories for current user"""
    categories = db.query(POI.category, func.count(POI.id))\
        .filter(POI.user_id == current_user.id)\
        .group_by(POI.category)\
        .all()
    
    return [{'name': c[0], 'count': c[1]} for c in categories]

@router.delete("/{poi_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_poi(
    poi_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete single POI"""
    poi = db.query(POI).filter(POI.id == poi_id, POI.user_id == current_user.id).first()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")
    
    db.delete(poi)
    db.commit()
```

### 4. Routes: Add to `app/main.py`

```python
from app.api import poi

app.include_router(poi.router)
```

---

## 🎨 FRONTEND

### 1. Update RightIsland POI Popover

**File:** `frontend/src/components/islands/RightIsland.jsx`

Replace POI section (lines 212-241) with:

```jsx
{/* POI Import popover */}
{poiOpen && (
  <POIImportPanel 
    onClose={() => togglePanel('right:poi')}
  />
)}
```

### 2. New Component: `frontend/src/components/poi/POIImportPanel.jsx` (NEW)

```jsx
import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, Trash2, Loader } from 'lucide-react';
import { toast } from 'react-toastify';
import useMapStore from '../../store/mapStore.js';

export default function POIImportPanel({ onClose }) {
  const { t } = useTranslation();
  const { userPOI, uploadedPOICategories, setUserPOI, togglePOICategory, poiCategories, togglePOI, showPOI } = useMapStore();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.match(/\.(kml|kmz)$/i)) {
      toast.error(t('poi.invalid_format'));
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/poi/upload', {
        method: 'POST',
        body: formData,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      toast.success(t('poi.imported', { count: data.imported }));
      
      // Refresh POI list
      const poiData = await fetch('/api/poi', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      }).then(r => r.json());
      
      setUserPOI(poiData);
    } catch (err) {
      toast.error(t('poi.upload_failed'));
    } finally {
      setUploading(false);
      fileInputRef.current.value = '';
    }
  }
  
  return (
    <div className="island" style={{ position: 'absolute', right: 52, top: '50%', transform: 'translateY(-50%)', width: 240, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          {t('poi.title')}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <X size={14} />
        </button>
      </div>
      
      {/* Upload Button */}
      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '10px 12px', borderRadius: 8,
        background: uploading ? 'rgba(0,122,255,0.05)' : 'var(--bg)',
        border: '2px dashed var(--accent)',
        cursor: uploading ? 'not-allowed' : 'pointer',
        fontSize: 12, fontWeight: 600, color: 'var(--accent)',
        opacity: uploading ? 0.6 : 1,
      }}>
        {uploading ? <Loader size={14} className="spin" /> : <Upload size={14} />}
        {uploading ? t('poi.uploading') : t('poi.upload_kml_kmz')}
        <input
          ref={fileInputRef}
          type="file"
          accept=".kml,.kmz"
          onChange={handleFileSelect}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>
      
      {/* Categories List */}
      {uploadedPOICategories.length > 0 && (
        <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6 }}>
            {t('poi.categories')}
          </div>
          {uploadedPOICategories.map((cat) => {
            const active = poiCategories.includes(cat.name);
            return (
              <button
                key={cat.name}
                onClick={() => { togglePOICategory(cat.name); if (!showPOI) togglePOI(); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '7px 8px', borderRadius: 6,
                  background: active ? 'rgba(0,122,255,0.1)' : 'none',
                  border: 'none', cursor: 'pointer', fontSize: 12,
                  color: active ? 'var(--accent)' : 'var(--text)',
                }}
              >
                <span>{cat.name} ({cat.count})</span>
              </button>
            );
          })}
        </div>
      )}
      
      {uploadedPOICategories.length === 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>
          {t('poi.no_data')}
        </div>
      )}
      
      {/* Toggle visibility */}
      {uploadedPOICategories.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={showPOI} onChange={() => togglePOI()} style={{ accentColor: 'var(--accent)' }} />
          {showPOI ? t('map.on') : t('map.off')}
        </label>
      )}
    </div>
  );
}
```

### 3. Update mapStore

**File:** `frontend/src/store/mapStore.js`

Add state:
```javascript
userPOI: [], // [{ id, name, lat, lon, category, ... }]
uploadedPOICategories: [], // [{ name: 'food', count: 5 }, ...]
poiCategories: [], // selected categories

setUserPOI: (poi) => set({ userPOI: poi }),
setUploadedPOICategories: (cats) => set({ uploadedPOICategories: cats }),
togglePOICategory: (category) => set((s) => ({
  poiCategories: s.poiCategories.includes(category)
    ? s.poiCategories.filter(c => c !== category)
    : [...s.poiCategories, category]
})),
```

### 4. Update POILayer

**File:** `frontend/src/map/POILayer.jsx`

Replace Overpass logic with:
```javascript
// Use userPOI from store instead of Overpass API
const { userPOI, poiCategories } = useMapStore();

const visiblePOI = userPOI.filter(poi => 
  !poiCategories.length || poiCategories.includes(poi.category)
);
```

### 5. i18n Translations

**Add to language files:**
```json
"poi": {
  "title": "POI",
  "upload_kml_kmz": "Upload KML/KMZ",
  "uploading": "Uploading...",
  "categories": "Categories",
  "no_data": "No POI imported yet",
  "imported": "Imported {count} POI",
  "upload_failed": "Upload failed",
  "invalid_format": "Only .kml or .kmz files allowed"
}
```

---

## 📂 Files to Create/Modify

### NEW FILES:
- `backend/alembic/versions/0005_add_poi_table.py` (migration)
- `backend/app/models/poi.py` (POI model)
- `backend/app/services/poi_parser.py` (KML/KMZ parser)
- `backend/app/api/poi.py` (API endpoints)
- `frontend/src/components/poi/POIImportPanel.jsx` (UI component)
- `POI_IMPORT_PLAN.md` (this file)

### MODIFIED FILES:
- `backend/app/main.py` (add poi router)
- `frontend/src/store/mapStore.js` (add POI state)
- `frontend/src/components/islands/RightIsland.jsx` (replace POI popover)
- `frontend/src/map/POILayer.jsx` (use userPOI)
- `frontend/src/i18n/locales/*.json` (add translations)
- `POLISH.md` (remove Overpass task, add POI import)

### REMOVED FILES:
- Overpass API references in POILayer.jsx
- `POI_CATEGORIES` from MapLayers.js

---

## ⏱️ Time Estimate

| Component | Time |
|-----------|------|
| Migration + Model | 30m |
| KML/KMZ Parser | 1.5h |
| API endpoints | 1h |
| Frontend Component | 1.5h |
| Store + Layer updates | 1h |
| Testing | 1h |
| **TOTAL** | **6.5 hours** |

---

## ✅ Testing Checklist

- [ ] Upload .kml file → POI appears on map
- [ ] Upload .kmz file → POI appears on map
- [ ] Auto-category detection works
- [ ] Category filter/toggle works
- [ ] Show/hide POI toggle works
- [ ] Delete POI works
- [ ] Multiple uploads merge correctly
- [ ] Invalid files rejected with error
- [ ] File size limit enforced (5MB)

---

## 🔗 References

- [KML Reference](https://developers.google.com/kml/documentation)
- [Google Maps Export](https://support.google.com/mymaps/answer/3024836)
- [Python zipfile](https://docs.python.org/3/library/zipfile.html)
- [Python ElementTree](https://docs.python.org/3/library/xml.etree.elementtree.html)
