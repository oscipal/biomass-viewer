import { useAppStore } from '../store';

export default function DownloadBar() {
  const selectedIds = useAppStore((s) => s.selectedIds);
  const downloading = useAppStore((s) => s.downloading);
  const runDownload = useAppStore((s) => s.runDownload);
  const clearSelection = useAppStore((s) => s.clearSelection);

  if (selectedIds.length === 0) return null;

  return (
    <div className="panel download-bar">
      <span className="download-count">
        {selectedIds.length} scene{selectedIds.length > 1 ? 's' : ''} selected
      </span>
      <button
        type="button"
        className="primary-btn"
        disabled={downloading}
        onClick={() => runDownload()}
      >
        {downloading ? 'Downloading…' : 'Confirm download (full resolution)'}
      </button>
      <button
        type="button"
        className="ghost-btn"
        disabled={downloading}
        onClick={() => clearSelection()}
      >
        Clear
      </button>
    </div>
  );
}
