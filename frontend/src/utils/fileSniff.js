/** .kml is accepted by both the Tracks and POI upload paths, so extension
 * alone can't tell them apart — sniff the actual content: a <LineString> or
 * <gx:Track> means route/path data (track), Placemark-only <Point> content
 * means waypoints (POI). Returns 'track' | 'poi' | 'unknown' (content doesn't
 * clearly indicate either — let the caller fall back to its default). */
export async function sniffKmlKind(file) {
  const text = await file.slice(0, 200 * 1024).text();
  const hasLine = /<(gx:)?(LineString|Track)\b/i.test(text);
  const hasPoint = /<Point\b/i.test(text);
  if (hasLine) return 'track';
  if (hasPoint) return 'poi';
  return 'unknown';
}

export function isKml(filename) {
  return /\.kml$/i.test(filename);
}
