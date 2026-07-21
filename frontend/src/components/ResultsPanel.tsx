import { assetUrl } from '../api';
import { useAppStore } from '../store';
import type { BiomassItem, MosaicGroup } from '../types';

function timeOf(dt?: string | null): string {
  if (!dt) return '';
  const d = new Date(dt);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(11, 19) + 'Z';
}

function Row({ item }: { item: BiomassItem }) {
  const selectedIds = useAppStore((s) => s.selectedIds);
  const toggleSelected = useAppStore((s) => s.toggleSelected);
  const downloaded = useAppStore((s) => s.downloaded);

  const selected = selectedIds.includes(item.id);
  const isDownloaded = Boolean(downloaded[item.id]);
  const downloadable = Boolean(item.cog_key);

  return (
    <li
      className={`result-row${selected ? ' selected' : ''}${downloadable ? '' : ' disabled'}`}
      onClick={() => downloadable && toggleSelected(item.id)}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={!downloadable}
        title={downloadable ? 'Select for download' : 'Preview only — no COG asset to download'}
        onClick={(e) => e.stopPropagation()}
        onChange={() => toggleSelected(item.id)}
        aria-label={`Select ${item.id} for download`}
      />
      {item.quicklook_key ? (
        <img
          className="result-thumb"
          src={assetUrl(item, item.quicklook_key)}
          alt=""
          loading="lazy"
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
      ) : (
        <span className="result-thumb placeholder" />
      )}
      <div className="result-meta">
        <span className="result-date">{timeOf(item.datetime)}</span>
        <span className="result-id" title={item.id}>
          {item.id}
        </span>
      </div>
      {isDownloaded && <span className="badge">HI-RES</span>}
      {!downloadable && <span className="badge preview">PREVIEW</span>}
    </li>
  );
}

function GroupBlock({ group, index }: { group: MosaicGroup; index: number }) {
  const activeGroupIndex = useAppStore((s) => s.activeGroupIndex);
  const setActiveGroupIndex = useAppStore((s) => s.setActiveGroupIndex);
  const active = index === activeGroupIndex;

  return (
    <div className={`result-group${active ? ' active' : ''}`}>
      <button
        type="button"
        className="result-group-head"
        onClick={() => setActiveGroupIndex(index)}
      >
        <span className="rg-caret">{active ? '▾' : '▸'}</span>
        <span className="rg-label">{group.label}</span>
        <span className="rg-count">{group.items.length}</span>
      </button>
      {active && (
        <ul className="rg-items">
          {group.items.map((it) => (
            <Row key={it.id} item={it} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ResultsPanel() {
  const groups = useAppStore((s) => s.groups);
  if (groups.length === 0) return null;

  return (
    <div className="panel results-panel">
      <div className="results-head">
        <h2>Mosaics</h2>
        <span>{groups.length}</span>
      </div>
      <div className="results-list">
        {groups.map((g, i) => (
          <GroupBlock key={g.key} group={g} index={i} />
        ))}
      </div>
    </div>
  );
}
