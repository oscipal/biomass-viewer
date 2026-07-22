import { useEffect, useRef, useState } from 'react';

import { geocode } from '../api';
import { bboxToPolygon } from '../geoUtils';
import { useAppStore } from '../store';
import type { Bbox, GeocodeResult } from '../types';

export default function SearchBox() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // Set true right before a programmatic setQ (e.g. after picking a result) so
  // the debounced-search effect skips that one change and doesn't re-open the
  // suggestion list for the text we just filled in.
  const suppress = useRef(false);

  const setAoi = useAppStore((s) => s.setAoi);
  const flyTo = useAppStore((s) => s.flyTo);

  useEffect(() => {
    if (suppress.current) {
      suppress.current = false;
      return;
    }
    if (q.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await geocode(q.trim());
        setResults(r);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(timer.current);
  }, [q]);

  const choose = (r: GeocodeResult) => {
    const bbox: Bbox = r.bbox ?? [r.lon - 0.1, r.lat - 0.1, r.lon + 0.1, r.lat + 0.1];
    setAoi(bboxToPolygon(bbox));
    flyTo(bbox);
    suppress.current = true;
    setQ(r.display_name);
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="searchbox">
      <input
        type="text"
        value={q}
        placeholder="Search a place (Nominatim)…"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length > 0) {
            e.preventDefault();
            choose(results[0]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        // Delay so a click on a suggestion registers before the list closes.
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        aria-label="Place search"
      />
      {loading && <span className="searchbox-spinner" aria-hidden="true" />}
      {open && results.length > 0 && (
        <ul className="searchbox-results">
          {results.map((r, i) => (
            <li key={`${r.display_name}-${i}`}>
              <button type="button" onClick={() => choose(r)} title={r.display_name}>
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
