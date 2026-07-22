import { DECOMPS, type DecompMethod } from '../products';
import { useAppStore } from '../store';

export default function DownloadBar() {
  const selectedIds = useAppStore((s) => s.selectedIds);
  const downloading = useAppStore((s) => s.downloading);
  const runDownload = useAppStore((s) => s.runDownload);
  const runDecompose = useAppStore((s) => s.runDecompose);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const product = useAppStore((s) => s.product);
  const decompMethod = useAppStore((s) => s.decompMethod);
  const setDecompMethod = useAppStore((s) => s.setDecompMethod);

  if (selectedIds.length === 0) return null;
  const isSCS = product === 'SCS';

  return (
    <div className="panel download-bar">
      <span className="download-count">
        {selectedIds.length} scene{selectedIds.length > 1 ? 's' : ''} selected
      </span>
      {isSCS ? (
        <>
          <select
            className="db-select"
            value={decompMethod}
            title="Polarimetric decomposition"
            onChange={(e) => setDecompMethod(e.target.value as DecompMethod)}
          >
            {DECOMPS.map((d) => (
              <option key={d.id} value={d.id} title={d.hint}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="primary-btn"
            disabled={downloading}
            title="Warp the complex data, decompose, and cache (takes ~1–2 min per scene)"
            onClick={() => runDecompose(decompMethod)}
          >
            {downloading ? 'Computing…' : 'Compute decomposition'}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="primary-btn"
          disabled={downloading}
          onClick={() => runDownload()}
        >
          {downloading ? 'Downloading…' : 'Confirm download (full resolution)'}
        </button>
      )}
      <button type="button" className="ghost-btn" disabled={downloading} onClick={() => clearSelection()}>
        Clear
      </button>
    </div>
  );
}
