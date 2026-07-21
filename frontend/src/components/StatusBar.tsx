import { useAppStore } from '../store';

export default function StatusBar() {
  const error = useAppStore((s) => s.error);
  const notice = useAppStore((s) => s.notice);
  const searching = useAppStore((s) => s.searching);
  const downloading = useAppStore((s) => s.downloading);
  const setError = useAppStore((s) => s.setError);
  const setNotice = useAppStore((s) => s.setNotice);

  const busy = searching ? 'Searching STAC catalog…' : downloading ? 'Cropping & caching COGs…' : null;

  return (
    <div className="status-stack">
      {busy && (
        <div className="toast busy">
          <span className="spinner" aria-hidden="true" />
          {busy}
        </div>
      )}
      {error && (
        <div className="toast error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {notice && (
        <div className="toast notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
