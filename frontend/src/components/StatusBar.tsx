import { useEffect } from 'react';

import { useAppStore } from '../store';

export default function StatusBar() {
  const error = useAppStore((s) => s.error);
  const notice = useAppStore((s) => s.notice);
  const searching = useAppStore((s) => s.searching);
  const downloading = useAppStore((s) => s.downloading);
  const setError = useAppStore((s) => s.setError);
  const setNotice = useAppStore((s) => s.setNotice);

  // Info notices fade out on their own after a few seconds (errors persist
  // until dismissed).
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(id);
  }, [notice, setNotice]);

  const busy = searching
    ? 'Searching STAC catalog…'
    : downloading
      ? 'Processing on the server (crop / decomposition)…'
      : null;

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
        <div className="toast notice fade" key={notice}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
