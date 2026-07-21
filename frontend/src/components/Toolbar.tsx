import type { ReactNode } from 'react';

import { useAppStore } from '../store';
import type { ToolMode } from '../types';

const TOOLS: { mode: ToolMode; label: string; hint: string; icon: ReactNode }[] = [
  {
    mode: 'point',
    label: 'Point',
    hint: 'Click the map to drop a point (auto-buffered to a small box)',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor" />
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    mode: 'rectangle',
    label: 'Rectangle',
    hint: 'Click-drag to draw a bounding box',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    mode: 'polygon',
    label: 'Polygon',
    hint: 'Click to add vertices, double-click to finish',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <polygon points="5,8 12,4 20,10 16,19 7,17" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

export default function Toolbar() {
  const toolMode = useAppStore((s) => s.toolMode);
  const setToolMode = useAppStore((s) => s.setToolMode);
  const aoi = useAppStore((s) => s.aoi);
  const clearAoi = useAppStore((s) => s.clearAoi);

  return (
    <div className="toolbar" role="group" aria-label="Area of interest tools">
      {TOOLS.map((t) => (
        <button
          key={t.mode}
          type="button"
          className={`tool-btn${toolMode === t.mode ? ' active' : ''}`}
          title={t.hint}
          aria-pressed={toolMode === t.mode}
          onClick={() => setToolMode(toolMode === t.mode ? 'none' : t.mode)}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="tool-btn ghost"
        title="Clear the current area of interest"
        disabled={!aoi}
        onClick={() => {
          clearAoi();
          setToolMode('none');
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span>Clear</span>
      </button>
    </div>
  );
}
