import { DECOMPS, productById, type PolMode } from '../products';
import { useAppStore } from '../store';

const COLORMAPS = [
  'viridis',
  'plasma',
  'inferno',
  'magma',
  'cividis',
  'turbo',
  'greens',
  'ylgn',
  'rdylgn',
  'spectral',
  'terrain',
  'gist_earth',
  'greys',
];

const POL_MODES: { id: PolMode; label: string; hint: string }[] = [
  { id: 'single', label: 'Single-pol', hint: 'One polarization channel + colormap' },
  { id: 'rgb', label: 'Intensity RGB', hint: 'R=HH, G=cross-pol, B=VV composite' },
  { id: 'pauli', label: 'Pseudo-Pauli', hint: 'R=|HH−VV|, G=cross-pol, B=|HH+VV|' },
  { id: 'decomp', label: 'Decomposition', hint: 'Needs the complex SCS product (coming next)' },
];

export default function ViewerControls() {
  const product = useAppStore((s) => s.product);
  const colormap = useAppStore((s) => s.colormap);
  const vmin = useAppStore((s) => s.vmin);
  const vmax = useAppStore((s) => s.vmax);
  const setColormap = useAppStore((s) => s.setColormap);
  const setVmin = useAppStore((s) => s.setVmin);
  const setVmax = useAppStore((s) => s.setVmax);
  const polMode = useAppStore((s) => s.polMode);
  const polBand = useAppStore((s) => s.polBand);
  const setPolMode = useAppStore((s) => s.setPolMode);
  const setPolBand = useAppStore((s) => s.setPolBand);
  const applyRender = useAppStore((s) => s.applyRender);
  const exitFocus = useAppStore((s) => s.exitFocus);
  const clearAll = useAppStore((s) => s.clearAll);
  const addCurrentToLayers = useAppStore((s) => s.addCurrentToLayers);
  const count = useAppStore((s) => Object.keys(s.downloaded).length);
  const showDownloaded = useAppStore((s) => s.showDownloaded);
  const toggleDownloaded = useAppStore((s) => s.toggleDownloaded);
  const decompMethod = useAppStore((s) => s.decompMethod);
  const setDecompMethod = useAppStore((s) => s.setDecompMethod);
  const runDecompose = useAppStore((s) => s.runDecompose);
  const downloading = useAppStore((s) => s.downloading);

  const def = productById(product);
  const isComplex = !!def.complex;
  const isPol = def.pols.length > 0;
  const showColormap = !isComplex && (!isPol || polMode === 'single');

  return (
    <div className="panel viewer-controls">
      <div className="vc-head">
        <span className="vc-title">FULL-RESOLUTION VIEW · {def.label}</span>
        <div className="results-head-right">
          <span className="vc-sub">
            {count} image{count === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className={`link-btn${showDownloaded ? '' : ' off'}`}
            title="Show or hide the downloaded image on the map"
            aria-pressed={showDownloaded}
            onClick={() => toggleDownloaded()}
          >
            {showDownloaded ? '● Hide image' : '○ Show image'}
          </button>
        </div>
      </div>

      {isComplex && (
        <div className="vc-polmodes" role="group" aria-label="Decomposition">
          {DECOMPS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`level-btn${decompMethod === d.id ? ' active' : ''}`}
              title={d.hint}
              aria-pressed={decompMethod === d.id}
              onClick={() => setDecompMethod(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {isPol && (
        <div className="vc-polmodes" role="group" aria-label="Polarization view">
          {POL_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`level-btn${polMode === m.id ? ' active' : ''}`}
              title={m.hint}
              aria-pressed={polMode === m.id}
              onClick={() => setPolMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="vc-render">
        {isPol && polMode === 'single' && (
          <label className="vc-field">
            <span>Pol</span>
            <select value={polBand} onChange={(e) => setPolBand(e.target.value)}>
              {def.pols.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
        {showColormap && (
          <label className="vc-field">
            <span>Colormap</span>
            <select value={colormap} onChange={(e) => setColormap(e.target.value)}>
              {COLORMAPS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="vc-field vc-num">
          <span>vmin</span>
          <input type="number" value={vmin} placeholder="auto" onChange={(e) => setVmin(e.target.value)} />
        </label>
        <label className="vc-field vc-num">
          <span>vmax</span>
          <input type="number" value={vmax} placeholder="auto" onChange={(e) => setVmax(e.target.value)} />
        </label>
        <button
          type="button"
          className="link-btn"
          title="Reset the stretch to the automatic 2–98% percentile"
          onClick={() => {
            setVmin('');
            setVmax('');
          }}
        >
          auto
        </button>
        {isComplex ? (
          <button
            type="button"
            className="primary-btn vc-apply"
            disabled={downloading}
            title="Recompute the decomposition (~1–2 min per scene)"
            onClick={() => runDecompose(decompMethod)}
          >
            {downloading ? 'Computing…' : 'Compute'}
          </button>
        ) : (
          <button type="button" className="primary-btn vc-apply" onClick={() => applyRender()}>
            Apply
          </button>
        )}
      </div>

      <div className="vc-actions">
        <button
          type="button"
          className="ghost-btn"
          title="Pin this image into the layer manager"
          onClick={() => addCurrentToLayers()}
        >
          ＋ Add to layers
        </button>
        <button type="button" className="ghost-btn" onClick={() => exitFocus()}>
          ‹ Choose a different image
        </button>
        <button type="button" className="ghost-btn danger" onClick={() => clearAll()}>
          Clear all
        </button>
      </div>
    </div>
  );
}
