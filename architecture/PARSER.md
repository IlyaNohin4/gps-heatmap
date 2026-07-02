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
            avg_elevation = sum(p.get('elevation', 0) for p in cluster) / len(cluster) if cluster[0].get('elevation') else None
            
            result.append({
                'lat': avg_lat,
                'lon': avg_lon,
                'elevation': avg_elevation,
                'time': cluster[0]['time']  # время первой точки
            })
            i = j
        else:
            result.append(points[i])
            i += 1
    
    return result
```

### 2. Speed Outlier Removal (`_remove_speed_outliers`)

Удалить точки где скорость > 200 км/ч (физический лимит)

```python
def _remove_speed_outliers(points: List[Dict], max_speed_kmh: float = 200) -> List[Dict]:
    """
    Remove points with impossible speed (> max_speed_kmh).
    GPS jumps and sensor errors create speed spikes.
    """
    if len(points) < 2:
        return points
    
    # Calculate speeds between consecutive points
    outlier_indices = set()
    
    for i in range(len(points) - 1):
        dist = haversine(
            points[i]['lat'], points[i]['lon'],
            points[i+1]['lat'], points[i+1]['lon']
        )
        time_diff = (points[i+1]['time'] - points[i]['time']).total_seconds()
        
        if time_diff > 0:
            speed_kmh = (dist / 1000) / (time_diff / 3600)
            
            # Mark both endpoints if speed is impossible
            if speed_kmh > max_speed_kmh:
                outlier_indices.add(i)
                outlier_indices.add(i + 1)
    
    # Keep only non-outlier points
    return [p for i, p in enumerate(points) if i not in outlier_indices]
```

### 3. Kalman Filter for GPS (`KalmanFilterGPS`)

Сглаживание GPS шума и дрифта с помощью фильтра Калмана.

**Принцип:** объединяет предсказание движения и GPS измерение в оптимальную оценку.

```python
class KalmanFilterGPS:
    """
    1D Kalman filter for lat/lon separately.
    
    State: x = [position, velocity]
    Process: position_next = position + velocity * dt
    Measurement: GPS reading
    """
    
    def __init__(self, process_variance=0.01, measurement_variance=0.1):
        """
        Args:
            process_variance (Q): погрешность модели движения (default: 0.01)
            measurement_variance (R): погрешность GPS в градусах (default: 0.1)
                Note: 0.1 градус ≈ 11 км, so use smaller values like 0.00001 (≈1м)
        """
        self.Q = process_variance
        self.R = measurement_variance
        
        # State estimate
        self.x = 0.0  # position
        self.v = 0.0  # velocity (deg/sec)
        
        # Estimation error
        self.P = 1.0
        
    def update(self, z: float, dt: float) -> float:
        """
        Update filter with new measurement.
        
        Args:
            z: GPS measurement (latitude or longitude in degrees)
            dt: time delta since last update (seconds)
        
        Returns:
            Filtered position estimate
        """
        # Predict
        self.x = self.x + self.v * dt
        self.P = self.P + self.Q
        
        # Update
        K = self.P / (self.P + self.R)  # Kalman gain
        self.x = self.x + K * (z - self.x)
        self.v = self.v + K * (z - self.x) / (dt + 1e-6)
        self.P = (1 - K) * self.P
        
        return self.x


def apply_kalman_filter(points: List[Dict], 
                       process_variance=0.01, 
                       measurement_variance=0.00001) -> List[Dict]:
    """
    Apply Kalman filter to lat/lon separately.
    
    Smooths GPS drift and noise while preserving trajectory.
    """
    if len(points) < 2:
        return points
    
    # Create separate filters for lat and lon
    kf_lat = KalmanFilterGPS(process_variance, measurement_variance)
    kf_lon = KalmanFilterGPS(process_variance, measurement_variance)
    
    # Initialize with first point
    kf_lat.x = points[0]['lat']
    kf_lon.x = points[0]['lon']
    
    result = []
    prev_time = points[0]['time']
    
    for point in points:
        dt = (point['time'] - prev_time).total_seconds()
        dt = max(dt, 0.1)  # Avoid division by zero
        
        # Filter lat/lon independently
        filtered_lat = kf_lat.update(point['lat'], dt)
        filtered_lon = kf_lon.update(point['lon'], dt)
        
        result.append({
            'lat': filtered_lat,
            'lon': filtered_lon,
            'elevation': point.get('elevation'),
            'time': point['time']
        })
        
        prev_time = point['time']
    
    return result
```

**Параметры:**
- `process_variance` (Q): модель неопределённости движения
  - Меньше → фильтр доверяет предсказанию больше (менее гладко)
  - Больше → фильтр доверяет GPS больше (менее гладко)
  - Default: 0.01 работает для большинства треков
  
- `measurement_variance` (R): погрешность GPS
  - Обычно 5-10м = ~0.00005-0.0001 градусов на широте
  - Default: 0.00001 (≈1м на экваторе)

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
    Points must have 'elevation' field.
    """
    gain = 0.0
    loss = 0.0
    
    for i in range(len(points) - 1):
        ele_current = points[i].get('elevation')
        ele_next = points[i + 1].get('elevation')
        
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
    "points": List[{
        "lat": float,
        "lon": float,
        "elevation": float | None,  # elevation in meters
        "time": datetime | None
    }],
    
    "distance_km": float,           # haversine(points)
    "duration_sec": int | None,     # last.time - first.time
    "recorded_at": datetime | None, # first.time
    
    "speed_avg": float | None,      # km/h
    "speed_max": float | None,      # km/h
    "speed_min": float | None,      # km/h, > 0 only
    
    "speed_segments": List[{
        "from": [lat, lon],         # coordinate array
        "to": [lat, lon],           # coordinate array
        "speed_kmh": float
    }],
    
    "elevation_gain": float | None, # meters
    "elevation_loss": float | None, # meters
}
```

**Note:** Celery task `process_track()` renames `points` → `raw_points`/`normalized_points` after normalization before saving to DB.

---

## Speed Segments

**Вычисляется для каждой пары консеквентных точек:**

```python
def calculate_speed_segments(points: List[Dict]) -> List[Dict]:
    """
    Create speed_segments: one segment per pair of consecutive points.
    Uses coordinate arrays (from/to) not indices.
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
                'from': [points[i]['lat'], points[i]['lon']],
                'to': [points[i+1]['lat'], points[i+1]['lon']],
                'speed_kmh': speed_kmh
            })
    
    return segments
```

**Используется для:**
- SpeedLayer на карте (градиент цветов, рисует линии от/до координат)
- Расчёта `speed_avg`, `speed_max`, `speed_min`
- Analytics в графиках (BottomIsland)

---

## Processing Pipeline (Celery Task)

```python
async def process_track(file_data: bytes, file_name: str, user_id: int, track_id: int):
    """
    1. Determine format by magic bytes
    2. Parse track (returns 'points' key)
    3. Normalize points:
       a. Collapse GPS drift (cluster nearby stationary points)
       b. Remove speed outliers (speed > 200 km/h)
       c. Apply Kalman filter (smooth remaining noise)
    4. Recalculate metrics (distance, elevation, speed) from normalized_points
    5. Geocode regions (Nominatim + Redis cache)
    6. Save to DB (raw_points and normalized_points)
    7. Update task status
    """
    try:
        format = detect_format(file_data)
        result = parse(file_data, format)  # returns 'points' key
        
        # Separate raw and normalized points
        raw_points = result['points']
        
        # Normalize step by step
        normalized_points = _collapse_drift(raw_points)
        normalized_points = _remove_speed_outliers(normalized_points)
        normalized_points = apply_kalman_filter(normalized_points)
        
        # Recalculate metrics from normalized points
        metrics = recalculate_metrics(normalized_points)
        
        # Determine regions via Nominatim (3 points: start, end, middle)
        regions = await geocode_regions([
            normalized_points[0],
            normalized_points[len(normalized_points) // 2],
            normalized_points[-1]
        ])
        
        # Save to DB
        track.distance_km = metrics['distance_km']
        track.duration_sec = metrics['duration_sec']
        track.recorded_at = metrics['recorded_at']
        track.speed_avg = metrics['speed_avg']
        track.speed_max = metrics['speed_max']
        track.speed_min = metrics['speed_min']
        track.elevation_gain = metrics['elevation_gain']
        track.elevation_loss = metrics['elevation_loss']
        track.raw_points = raw_points          # Original GPS data
        track.normalized_points = normalized_points  # After filtering + Kalman
        track.speed_segments = metrics['speed_segments']
        track.regions = regions
        track.geom = create_linestring(normalized_points)
        
        db.commit()
        return {'state': 'SUCCESS', 'track_id': track_id}
        
    except Exception as e:
        return {'state': 'FAILURE', 'error': str(e)}
```

**Порядок нормализации важен:**
1. Collapse drift первым — избавляемся от явного шума
2. Удалить outliers — убираем невозможные скорости (247 км/ч)
3. Kalman фильтр последним — сглаживает остаток шума

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
