# GPS Track Parser — Детали реализации

## Supported Formats

- GPX (via gpxpy)
- KML (via fastkml + lxml)
- TCX (via lxml)
- FIT (via fitparse)
- GeoJSON (native JSON)

---

## Format Detection (Magic Bytes)

**Определение формата по содержимому, не расширению:**

```python
def detect_format(data: bytes) -> str:
    # FIT: байты 8-11 == '.FIT'
    if len(data) > 11 and data[8:12] == b'.FIT':
        return 'fit'
    
    # GeoJSON: начинается с '{' + содержит '"type"'
    try:
        if data.startswith(b'{'):
            obj = json.loads(data.decode('utf-8'))
            if 'type' in obj:
                return 'geojson'
    except:
        pass
    
    # XML-based: ищем в первых 500 байтах
    text = data.decode('utf-8', errors='ignore')[:500]
    if '<gpx' in text:
        return 'gpx'
    if '<kml' in text:
        return 'kml'
    if '<TrainingCenterDatabase' in text:
        return 'tcx'
    
    raise ValueError(f"Unknown format")
```

---

## GPX Parser with Sanitization

**Problem:** OsmAnd GPX файлы содержат невалидные namespace в `<extensions>` блоках, что ломает стандартный ET парсер.

**Solution:** lxml с `recover=True` для очистки extensions перед передачей в gpxpy.

```python
def _sanitize_gpx(data: bytes) -> bytes:
    """Remove malformed <extensions> blocks from GPX."""
    parser = _lxml_etree.XMLParser(recover=True, remove_comments=True)
    tree = _lxml_etree.fromstring(data, parser=parser)
    
    for elem in tree.iter():
        for child in list(elem):
            tag = child.tag
            if callable(tag):  # comments и PI
                continue
            if isinstance(tag, str) and "extensions" in tag:
                elem.remove(child)
    
    return _lxml_etree.tostring(tree, xml_declaration=True, encoding="UTF-8")
```

---

## Normalization Algorithms

**Применяется после парсинга, результат → `normalized_points`. Скорость считается только из normalized.**

### 1. GPS Drift Collapse (`_collapse_drift`)

Точки, которые:
- Находятся < 3м друг от друга
- И разделены > 10с

→ Заменить кластер одной точкой (центроид)

```python
def _collapse_drift(points: List[Dict], distance_threshold: float = 3.0, time_threshold: int = 10):
    """
    Cluster stationary points (GPS drift during pause) into a single point.
    
    Args:
        distance_threshold: meters, points closer than this are considered clustered
        time_threshold: seconds, minimum time between points in cluster
    
    Returns:
        List of points with clusters replaced by centroid
    """
    if not points:
        return []
    
    result = []
    i = 0
    
    while i < len(points):
        cluster = [points[i]]
        j = i + 1
        
        # Gather nearby points
        while j < len(points):
            dist = haversine(
                points[i]['lat'], points[i]['lon'],
                points[j]['lat'], points[j]['lon']
            )
            time_diff = (points[j]['time'] - points[i]['time']).total_seconds()
            
            if dist < distance_threshold and time_diff >= time_threshold:
                cluster.append(points[j])
                j += 1
            else:
                break
        
        if len(cluster) > 1:
            # Replace cluster with centroid
            avg_lat = sum(p['lat'] for p in cluster) / len(cluster)
            avg_lon = sum(p['lon'] for p in cluster) / len(cluster)
            avg_ele = sum(p.get('ele', 0) for p in cluster) / len(cluster) if cluster[0].get('ele') else None
            
            result.append({
                'lat': avg_lat,
                'lon': avg_lon,
                'ele': avg_ele,
                'time': cluster[0]['time']  # время первой точки
            })
            i = j
        else:
            result.append(points[i])
            i += 1
    
    return result
```

### 2. Speed Outlier Removal (`_remove_speed_outliers`)

Удалить точки где скорость > μ + 3σ (статистический выброс)

```python
def _remove_speed_outliers(points: List[Dict]) -> List[Dict]:
    """
    Remove points with anomalous speed (> mean + 3*stdev).
    GPS jumps and sensor errors create speed spikes.
    """
    if len(points) < 3:
        return points
    
    # Calculate speeds between consecutive points
    speeds = []
    for i in range(len(points) - 1):
        dist = haversine(
            points[i]['lat'], points[i]['lon'],
            points[i+1]['lat'], points[i+1]['lon']
        )
        time_diff = (points[i+1]['time'] - points[i]['time']).total_seconds()
        
        if time_diff > 0:
            speed_kmh = (dist / 1000) / (time_diff / 3600)
            speeds.append(speed_kmh)
    
    if len(speeds) < 2:
        return points
    
    mean_speed = statistics.mean(speeds)
    stdev_speed = statistics.stdev(speeds)
    threshold = mean_speed + 3 * stdev_speed
    
    # Mark outliers
    outliers = set()
    for i, speed in enumerate(speeds):
        if speed > threshold:
            outliers.add(i)
            outliers.add(i + 1)  # Mark both endpoints
    
    # Keep only non-outlier points
    return [p for i, p in enumerate(points) if i not in outliers]
```

---

## Elevation Gain/Loss Calculation

**Алгоритм:**
1. Для каждой пары последовательных точек: `delta_ele = next.ele - prev.ele`
2. Если `delta_ele > 0` → `elevation_gain += delta_ele`
3. Если `delta_ele < 0` → `elevation_loss += abs(delta_ele)`

**Note:** GPS шум суммируется — нужно сглаживание перед расчетом (TODO в POLISH.md)

```python
def calculate_elevation_gain_loss(points: List[Dict]) -> Tuple[float, float]:
    """
    Calculate total elevation gain and loss.
    Points must have 'ele' field.
    """
    gain = 0.0
    loss = 0.0
    
    for i in range(len(points) - 1):
        ele_current = points[i].get('ele')
        ele_next = points[i + 1].get('ele')
        
        if ele_current is not None and ele_next is not None:
            delta = ele_next - ele_current
            
            if delta > 0:
                gain += delta
            else:
                loss += abs(delta)
    
    return gain, loss
```

---

## Parser Contract

**Каждый парсер (GPX, KML, TCX, FIT, GeoJSON) возвращает этот контракт:**

```python
ParseResult = {
    "raw_points": List[{
        "lat": float,
        "lon": float,
        "ele": float | None,  # elevation in meters
        "time": datetime | None
    }],
    
    "normalized_points": List[{
        "lat": float,
        "lon": float,
        "ele": float | None,
        "time": datetime | None
    }],
    
    "distance_km": float,           # haversine(normalized_points)
    "duration_sec": int | None,     # last.time - first.time
    "recorded_at": datetime | None, # first.time
    
    "speed_avg": float | None,      # km/h, from normalized
    "speed_max": float | None,      # km/h, from normalized
    "speed_min": float | None,      # km/h, from normalized, > 0 only
    
    "speed_segments": List[{
        "from_idx": int,            # index in normalized_points
        "to_idx": int,
        "speed_kmh": float
    }],
    
    "elevation_gain": float | None, # meters
    "elevation_loss": float | None, # meters
}
```

---

## Speed Segments

**Вычисляется для каждой пары консеквентных точек в normalized_points:**

```python
def calculate_speed_segments(points: List[Dict]) -> List[Dict]:
    """
    Create speed_segments: one segment per pair of consecutive points.
    """
    segments = []
    
    for i in range(len(points) - 1):
        dist = haversine(
            points[i]['lat'], points[i]['lon'],
            points[i+1]['lat'], points[i+1]['lon']
        )
        time_diff = (points[i+1]['time'] - points[i]['time']).total_seconds()
        
        if time_diff > 0:
            speed_kmh = (dist / 1000) / (time_diff / 3600)
            
            segments.append({
                'from_idx': i,
                'to_idx': i + 1,
                'speed_kmh': speed_kmh
            })
    
    return segments
```

**Используется для:**
- SpeedLayer на карте (градиент цветов)
- Расчёта `speed_avg`, `speed_max`, `speed_min`
- Analytics в графиках (BottomIsland)

---

## Processing Pipeline (Celery Task)

```python
async def process_track(file_data: bytes, file_name: str, user_id: int, track_id: int):
    """
    1. Determine format by magic bytes
    2. Parse track
    3. Normalize points
    4. Calculate elevation, speed
    5. Geocode regions (Nominatim + Redis cache)
    6. Save to DB
    7. Update task status
    """
    try:
        format = detect_format(file_data)
        result = parse(file_data, format)
        
        # Determine regions via Nominatim (3 points: start, end, middle)
        regions = await geocode_regions([
            result['normalized_points'][0],
            result['normalized_points'][len(result['normalized_points']) // 2],
            result['normalized_points'][-1]
        ])
        
        # Save to DB
        track.distance_km = result['distance_km']
        track.duration_sec = result['duration_sec']
        track.recorded_at = result['recorded_at']
        track.speed_avg = result['speed_avg']
        track.speed_max = result['speed_max']
        track.speed_min = result['speed_min']
        track.elevation_gain = result['elevation_gain']
        track.elevation_loss = result['elevation_loss']
        track.raw_points = result['raw_points']
        track.normalized_points = result['normalized_points']
        track.speed_segments = result['speed_segments']
        track.regions = regions
        track.geom = create_linestring(result['normalized_points'])
        
        db.commit()
        return {'state': 'SUCCESS', 'track_id': track_id}
        
    except Exception as e:
        return {'state': 'FAILURE', 'error': str(e)}
```

---

## Haversine Distance

```python
from math import radians, cos, sin, asin, sqrt

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on earth (in meters).
    """
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371 * 1000  # radius of earth in meters
    return c * r
```
