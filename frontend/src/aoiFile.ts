// Parse an uploaded GeoJSON or KML file into a single AOI geometry.
// Minimal, dependency-free KML support (Polygon / Point / LineString).

function geomFromGeoJSON(obj: unknown): GeoJSON.Geometry | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as { type?: string; features?: unknown[]; geometry?: GeoJSON.Geometry };
  if (o.type === 'FeatureCollection') {
    for (const f of o.features ?? []) {
      const g = geomFromGeoJSON(f);
      if (g) return g;
    }
    return null;
  }
  if (o.type === 'Feature') return o.geometry ?? null;
  if (
    o.type === 'Polygon' ||
    o.type === 'MultiPolygon' ||
    o.type === 'Point' ||
    o.type === 'LineString'
  ) {
    return obj as GeoJSON.Geometry;
  }
  return null;
}

function parseCoords(text: string): number[][] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => {
      const [lon, lat] = t.split(',').map(Number);
      return [lon, lat];
    })
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

function firstTag(root: Document | Element, tag: string): Element | null {
  const els = root.getElementsByTagName(tag);
  return els.length ? els[0] : null;
}

function geomFromKML(text: string): GeoJSON.Geometry | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;

  const poly = firstTag(doc, 'Polygon');
  if (poly) {
    const c = firstTag(poly, 'coordinates'); // first = outer boundary
    if (c?.textContent) {
      let ring = parseCoords(c.textContent);
      if (ring.length >= 3) {
        const a = ring[0];
        const b = ring[ring.length - 1];
        if (a[0] !== b[0] || a[1] !== b[1]) ring = [...ring, a];
        return { type: 'Polygon', coordinates: [ring] };
      }
    }
  }
  const line = firstTag(doc, 'LineString');
  if (line) {
    const c = firstTag(line, 'coordinates');
    const pts = c?.textContent ? parseCoords(c.textContent) : [];
    if (pts.length >= 2) return { type: 'LineString', coordinates: pts };
  }
  const point = firstTag(doc, 'Point');
  if (point) {
    const c = firstTag(point, 'coordinates');
    const pts = c?.textContent ? parseCoords(c.textContent) : [];
    if (pts.length) return { type: 'Point', coordinates: pts[0] };
  }
  return null;
}

export function parseAoiFile(name: string, text: string): GeoJSON.Geometry | null {
  if (name.toLowerCase().endsWith('.kml')) return geomFromKML(text);
  try {
    return geomFromGeoJSON(JSON.parse(text));
  } catch {
    return geomFromKML(text); // maybe KML with a .txt/.xml name
  }
}
