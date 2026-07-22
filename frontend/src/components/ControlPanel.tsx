import { PRODUCTS } from '../products';
import { useAppStore } from '../store';
import SearchBox from './SearchBox';
import Toolbar from './Toolbar';

function ProductSelector() {
  const product = useAppStore((s) => s.product);
  const setProduct = useAppStore((s) => s.setProduct);
  return (
    <div className="level-select" role="group" aria-label="Product">
      {PRODUCTS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`level-btn${product === p.id ? ' active' : ''}`}
          title={p.hint}
          aria-pressed={product === p.id}
          onClick={() => setProduct(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export default function ControlPanel() {
  const aoi = useAppStore((s) => s.aoi);
  const dateFrom = useAppStore((s) => s.dateFrom);
  const dateTo = useAppStore((s) => s.dateTo);
  const setDateFrom = useAppStore((s) => s.setDateFrom);
  const setDateTo = useAppStore((s) => s.setDateTo);
  const searching = useAppStore((s) => s.searching);
  const runSearch = useAppStore((s) => s.runSearch);
  const count = useAppStore((s) => s.items.length);

  return (
    <div className="panel control-panel">
      <div className="brand">
        <span className="brand-mark" />
        <div>
          <h1>BIOMASS VIEWER</h1>
          <p>ESA BIOMASS · P-band SAR · AGB</p>
        </div>
      </div>

      <label className="field-label">Area of interest</label>
      <SearchBox />
      <Toolbar />

      <label className="field-label">Product</label>
      <ProductSelector />

      <label className="field-label">Acquisition date</label>
      <div className="date-row">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="From date"
        />
        <span>→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="To date"
        />
      </div>

      <button
        type="button"
        className="primary-btn"
        disabled={!aoi || searching}
        onClick={() => runSearch()}
      >
        {searching ? 'Searching…' : 'Search scenes'}
      </button>

      {count > 0 && <p className="result-count">{count} scene(s) found</p>}
      {!aoi && <p className="hint-text">Pick a tool or search a place to define an AOI.</p>}
    </div>
  );
}
