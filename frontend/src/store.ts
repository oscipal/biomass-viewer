import { create } from 'zustand';

import * as api from './api';
import { polygonBbox, quicklookCoords, unionBbox } from './geoUtils';
import { buildGroups, groupIndexOfItem } from './grouping';
import type { LayerOverlay, MapLayer } from './layers';
import { buildTileUrl } from './mapLayers';
import { computeRender, productById } from './products';
import type { AppliedRender, DecompMethod, PolMode, Product } from './products';
import type {
  AppConfig,
  Bbox,
  BiomassItem,
  DownloadedInfo,
  MosaicGroup,
  ToolMode,
} from './types';

function describeView(
  product: Product,
  focusMode: boolean,
  downloaded: Record<string, DownloadedInfo>,
  polBand: string,
  applied: AppliedRender,
): string {
  if (!focusMode) return `${product} · quicklook`;
  const assets = Object.values(downloaded).map((d) => d.asset);
  if (assets.some((a) => a === 'stitch')) return `${product} · stitched`;
  const dec = assets.find((a) => a && a.startsWith('decomp_'));
  if (dec) return `${product} · ${dec.replace('decomp_', '')} decomp`;
  if (applied.expression) return `${product} · pseudo-Pauli`;
  if (applied.indexes && applied.indexes.includes(',')) return `${product} · intensity RGB`;
  return `${product} · ${polBand}`;
}

function buildDatetime(from: string, to: string): string | undefined {
  const start = from ? `${from}T00:00:00Z` : '..';
  const end = to ? `${to}T23:59:59Z` : '..';
  if (start === '..' && end === '..') return undefined;
  return `${start}/${end}`;
}

interface AppState {
  // --- map / selection ---
  toolMode: ToolMode;
  aoi: GeoJSON.Geometry | null;
  lastAoi: GeoJSON.Geometry | null; // most recent AOI, for "use last"
  aoiHash: string | null;
  flyToBbox: Bbox | null;
  // Global BIOMASS coverage (all scene footprints for the current product) —
  // viewable before choosing an ROI.
  showCoverage: boolean;
  coverageFC: GeoJSON.FeatureCollection | null;
  coverageProduct: Product | null;
  coverageLoading: boolean;

  // --- ui layout ---
  panelCollapsed: boolean; // left control panel slid off to the left
  focusMode: boolean; // viewing a downloaded full-res image (mosaics/timeline hidden)
  showDownloaded: boolean; // toggle visibility of the downloaded full-res overlay(s)

  // --- layer manager ---
  layers: MapLayer[]; // pinned images (top of list = top of map)
  layerManagerOpen: boolean;

  // --- render params for downloaded COG tiles (pending UI selection) ---
  colormap: string;
  vmin: string; // empty string = auto (backend 2–98 percentile)
  vmax: string;
  polMode: PolMode; // single | rgb | pauli | decomp
  polBand: string; // active single-pol (HH/HV/VH/VV)
  decompMethod: DecompMethod; // SCS decomposition (pauli | freeman)
  appliedRender: AppliedRender; // committed on "Apply" — what the tiles actually use

  // --- data ---
  config: AppConfig | null;
  items: BiomassItem[];
  groups: MosaicGroup[];
  activeGroupIndex: number;
  selectedIds: string[];
  downloaded: Record<string, DownloadedInfo>;

  // --- filters ---
  product: Product;
  dateFrom: string;
  dateTo: string;

  // --- ui ---
  searching: boolean;
  downloading: boolean;
  playing: boolean;
  error: string | null;
  notice: string | null;

  // --- actions ---
  loadConfig: () => Promise<void>;
  setToolMode: (m: ToolMode) => void;
  setAoi: (g: GeoJSON.Geometry | null) => void;
  clearAoi: () => void;
  useLastAoi: () => void;
  toggleCoverage: () => void;
  loadCoverage: () => Promise<void>;
  flyTo: (b: Bbox) => void;
  clearFly: () => void;
  togglePanel: () => void;
  setPanelCollapsed: (v: boolean) => void;
  exitFocus: () => void;
  clearAll: () => void;
  toggleLayerManager: () => void;
  addCurrentToLayers: () => void;
  removeLayer: (id: string) => void;
  toggleLayerVisible: (id: string) => void;
  setLayerOpacity: (id: string, v: number) => void;
  moveLayer: (id: string, dir: 'up' | 'down') => void;
  selectLayer: (id: string) => void;
  toggleDownloaded: () => void;
  zoomToView: () => void;
  setColormap: (v: string) => void;
  setVmin: (v: string) => void;
  setVmax: (v: string) => void;
  setProduct: (p: Product) => void;
  setPolMode: (m: PolMode) => void;
  setPolBand: (b: string) => void;
  setDecompMethod: (m: DecompMethod) => void;
  applyRender: () => void;
  runDecompose: (method: DecompMethod) => Promise<void>;
  setActiveGroupIndex: (i: number) => void;
  focusItem: (id: string) => void;
  toggleSelected: (id: string) => void;
  selectAllInActiveGroup: () => void;
  clearSelection: () => void;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setPlaying: (v: boolean) => void;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
  runSearch: () => Promise<void>;
  runDownload: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  toolMode: 'none',
  aoi: null,
  lastAoi: null,
  aoiHash: null,
  flyToBbox: null,
  showCoverage: false,
  coverageFC: null,
  coverageProduct: null,
  coverageLoading: false,

  panelCollapsed: false,
  focusMode: false,
  showDownloaded: true,

  layers: [],
  layerManagerOpen: false,

  colormap: 'viridis',
  vmin: '',
  vmax: '',
  polMode: 'single',
  polBand: 'HH',
  decompMethod: 'pauli',
  appliedRender: { indexes: '1', colormap: 'viridis' },

  config: null,
  items: [],
  groups: [],
  activeGroupIndex: 0,
  selectedIds: [],
  downloaded: {},

  product: 'GN', // default product
  dateFrom: '',
  dateTo: '',

  searching: false,
  downloading: false,
  playing: false,
  error: null,
  notice: null,

  loadConfig: async () => {
    try {
      const config = await api.fetchConfig();
      set({ config });
      if (!config.token.configured) {
        set({
          notice:
            'No MAAP token configured — scene search works, but previews and downloads need a token in backend/.env.',
        });
      }
    } catch (e) {
      set({ error: `Backend not reachable: ${(e as Error).message}` });
    }
  },

  // Activating a draw tool slides the control panel away so it can't block the
  // map while you draw; finishing a draw re-opens it (see MapView).
  setToolMode: (toolMode) =>
    set(toolMode === 'none' ? { toolMode } : { toolMode, panelCollapsed: true }),
  setAoi: (aoi) => set((s) => ({ aoi, lastAoi: aoi ?? s.lastAoi })),
  clearAoi: () => set({ aoi: null, aoiHash: null }),
  useLastAoi: () => {
    const g = get().lastAoi;
    if (!g) return;
    const bb = polygonBbox(g);
    set({ aoi: g, toolMode: 'none', ...(bb ? { flyToBbox: bb } : {}) });
  },
  toggleCoverage: () => {
    const show = !get().showCoverage;
    set({ showCoverage: show });
    if (show) get().loadCoverage();
  },
  loadCoverage: async () => {
    const product = get().product;
    if (get().coverageProduct === product && get().coverageFC) return; // cached
    set({ coverageLoading: true });
    try {
      const fc = await api.fetchCoverage(productById(product).collection);
      set({ coverageFC: fc, coverageProduct: product });
    } catch (e) {
      set({ error: `Coverage load failed: ${(e as Error).message}`, showCoverage: false });
    } finally {
      set({ coverageLoading: false });
    }
  },
  flyTo: (flyToBbox) => set({ flyToBbox }),
  clearFly: () => set({ flyToBbox: null }),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
  setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
  exitFocus: () => set({ focusMode: false }),
  clearAll: () =>
    set({
      aoi: null,
      aoiHash: null,
      items: [],
      groups: [],
      activeGroupIndex: 0,
      selectedIds: [],
      downloaded: {},
      focusMode: false,
      showDownloaded: true,
      panelCollapsed: false,
      playing: false,
      error: null,
      notice: null,
    }),

  toggleLayerManager: () => set((s) => ({ layerManagerOpen: !s.layerManagerOpen })),
  addCurrentToLayers: () => {
    const s = get();
    const overlays: LayerOverlay[] = [];
    if (s.focusMode && Object.keys(s.downloaded).length > 0) {
      for (const info of Object.values(s.downloaded)) {
        overlays.push({ kind: 'raster', tileUrl: buildTileUrl(info, s.appliedRender), bounds: info.bounds });
      }
    } else {
      const group = s.groups[s.activeGroupIndex];
      const items = s.selectedIds.length
        ? s.items.filter((it) => s.selectedIds.includes(it.id))
        : group?.items ?? [];
      for (const it of items) {
        const coords = quicklookCoords(it.id, it.geometry, it.bbox);
        if (coords && it.quicklook_key) overlays.push({ kind: 'image', url: api.assetUrl(it), coords });
      }
    }
    if (overlays.length === 0) {
      set({ error: 'Nothing to add — search a scene or download an image first.' });
      return;
    }
    const name = describeView(s.product, s.focusMode, s.downloaded, s.polBand, s.appliedRender);
    const layer: MapLayer = {
      id: `L${Date.now().toString(36)}`,
      name,
      visible: true,
      opacity: 1,
      overlays,
      restore: {
        focusMode: s.focusMode,
        downloaded: { ...s.downloaded },
        appliedRender: { ...s.appliedRender },
        activeGroupIndex: s.activeGroupIndex,
        selectedIds: [...s.selectedIds],
        aoi: s.aoi,
      },
    };
    set({ layers: [layer, ...s.layers], layerManagerOpen: true, notice: `Added "${name}" to layers.` });
  },
  removeLayer: (id) => set((s) => ({ layers: s.layers.filter((l) => l.id !== id) })),
  toggleLayerVisible: (id) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) })),
  setLayerOpacity: (id, opacity) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)) })),
  moveLayer: (id, dir) =>
    set((s) => {
      const arr = [...s.layers];
      const i = arr.findIndex((l) => l.id === id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= arr.length) return {};
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { layers: arr };
    }),
  selectLayer: (id) =>
    set((s) => {
      const l = s.layers.find((x) => x.id === id);
      if (!l) return {};
      const r = l.restore;
      return {
        focusMode: r.focusMode,
        downloaded: r.downloaded,
        appliedRender: r.appliedRender,
        activeGroupIndex: r.activeGroupIndex,
        selectedIds: r.selectedIds,
        aoi: r.aoi,
        showDownloaded: true,
      };
    }),
  toggleDownloaded: () => set((s) => ({ showDownloaded: !s.showDownloaded })),
  // Smart zoom: to the downloaded image(s) when focused, else the selected
  // scenes, else the active mosaic group, else the whole AOI.
  zoomToView: () => {
    const { items, selectedIds, groups, activeGroupIndex, aoi, focusMode, downloaded } = get();
    let boxes: (Bbox | null | undefined)[] = [];
    if (focusMode) {
      boxes = Object.values(downloaded).map((d) => d.bounds);
    } else {
      boxes = items.filter((it) => selectedIds.includes(it.id)).map((it) => it.bbox);
      if (boxes.length === 0) boxes = groups[activeGroupIndex]?.items.map((it) => it.bbox) ?? [];
    }
    let bb = unionBbox(boxes);
    if (!bb && aoi) bb = polygonBbox(aoi);
    if (bb) set({ flyToBbox: bb });
  },
  setColormap: (colormap) => set({ colormap }),
  setVmin: (vmin) => set({ vmin }),
  setVmax: (vmax) => set({ vmax }),
  setActiveGroupIndex: (activeGroupIndex) => set({ activeGroupIndex }),
  focusItem: (id) => {
    const idx = groupIndexOfItem(get().groups, id);
    if (idx >= 0) set({ activeGroupIndex: idx });
  },
  toggleSelected: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    })),
  selectAllInActiveGroup: () =>
    set((s) => {
      const group = s.groups[s.activeGroupIndex];
      if (!group) return {};
      const ids = group.items.filter((it) => it.cog_key).map((it) => it.id);
      const merged = new Set([...s.selectedIds, ...ids]);
      return { selectedIds: [...merged] };
    }),
  clearSelection: () => set({ selectedIds: [] }),
  setProduct: (product) => {
    const def = productById(product);
    set({ product, polMode: 'single', polBand: def.pols[0] ?? 'HH', coverageFC: null, coverageProduct: null });
    if (get().showCoverage) get().loadCoverage();
  },
  setPolMode: (polMode) => set({ polMode }),
  setPolBand: (polBand) => set({ polBand }),
  setDecompMethod: (decompMethod) => set({ decompMethod }),
  applyRender: () => {
    const { product, polMode, polBand, colormap, vmin, vmax } = get();
    const r = computeRender(product, polMode, polBand, colormap, vmin, vmax);
    if (!r) {
      set({ notice: 'True decompositions need the complex SCS product — that path is coming next.' });
      return;
    }
    set({ appliedRender: r });
  },
  setDateFrom: (dateFrom) => set({ dateFrom }),
  setDateTo: (dateTo) => set({ dateTo }),
  setPlaying: (playing) => set({ playing }),
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),

  runSearch: async () => {
    const { aoi, dateFrom, dateTo, product } = get();
    if (!aoi) {
      set({ error: 'Draw or search an area of interest first.' });
      return;
    }
    const def = productById(product);
    // Collapse the control panel to the left as soon as a search starts.
    set({ searching: true, error: null, notice: null, playing: false, panelCollapsed: true, focusMode: false });
    try {
      const res = await api.searchItems({
        aoi,
        datetime: buildDatetime(dateFrom, dateTo),
        collections: [def.collection],
      });
      // Show only the chosen product; SCS additionally needs the complex
      // (abs + phase) TIFFs to be decomposable.
      const filtered = res.items.filter(
        (it) =>
          def.match.test(it.id) &&
          (!def.complex ||
            (it.assets['enclosure_i_abs_tiff'] && it.assets['enclosure_i_phase_tiff'])),
      );
      const groups = buildGroups(filtered);
      set({
        items: filtered,
        groups,
        aoiHash: res.aoi_hash,
        activeGroupIndex: 0,
        selectedIds: [],
        downloaded: {},
        notice:
          filtered.length === 0
            ? `No ${def.label} scenes found for this area / date range.`
            : `${filtered.length} ${def.label} scene(s) in ${groups.length} group(s).`,
      });
    } catch (e) {
      // Re-open the panel on failure so the user can adjust inputs and retry.
      set({ error: `Search failed: ${(e as Error).message}`, items: [], groups: [], panelCollapsed: false });
    } finally {
      set({ searching: false });
    }
  },

  runDownload: async () => {
    const { selectedIds, aoi } = get();
    if (!aoi || selectedIds.length === 0) return;
    set({ downloading: true, error: null, notice: null });
    // The render to apply to the fresh download (current polarization view).
    const renderNow = () => {
      const s = get();
      return computeRender(s.product, s.polMode, s.polBand, s.colormap, s.vmin, s.vmax) ?? s.appliedRender;
    };
    try {
      // Two or more adjacent scenes → stitch into a single mosaicked image.
      if (selectedIds.length > 1) {
        const res = await api.stitchItems(selectedIds, aoi);
        const r = res.result;
        if (r.status === 'ok' && r.aoi_hash && r.bounds) {
          set({
            downloaded: {
              [r.item_id]: {
                tileUrl: api.tileTemplate(r.item_id, r.aoi_hash),
                aoiHash: r.aoi_hash,
                bounds: r.bounds,
                asset: 'stitch',
              },
            },
            selectedIds: [],
            focusMode: true,
            showDownloaded: true,
            appliedRender: renderNow(),
            notice: `Stitched ${selectedIds.length} scenes into one image.`,
          });
        } else {
          set({ error: `Stitch failed: ${r.error ?? 'unknown error'}` });
        }
        return;
      }

      // Single scene → normal AOI crop.
      const res = await api.downloadItems(selectedIds, aoi);
      const downloaded = { ...get().downloaded };
      const errors: string[] = [];
      for (const r of res.results) {
        if (r.status === 'ok' && r.tile_url && r.bounds && r.aoi_hash) {
          downloaded[r.item_id] = {
            tileUrl: api.tileTemplate(r.item_id, r.aoi_hash),
            aoiHash: r.aoi_hash,
            bounds: r.bounds,
            asset: '',
          };
        } else if (r.error) {
          errors.push(`${r.item_id.slice(0, 24)}…: ${r.error}`);
        }
      }
      const firstOk = res.results.find((r) => r.status === 'ok');
      const activeGroupIndex = firstOk
        ? Math.max(0, groupIndexOfItem(get().groups, firstOk.item_id))
        : get().activeGroupIndex;
      const ok = res.ok_count > 0;
      set({
        downloaded,
        activeGroupIndex,
        selectedIds: ok ? [] : get().selectedIds,
        focusMode: ok ? true : get().focusMode,
        showDownloaded: ok ? true : get().showDownloaded,
        appliedRender: ok ? renderNow() : get().appliedRender,
        error: errors.length ? `Some downloads failed — ${errors.join(' | ')}` : null,
        notice: ok ? `Downloaded ${res.ok_count} full-resolution crop(s).` : null,
      });
    } catch (e) {
      set({ error: `Download failed: ${(e as Error).message}` });
    } finally {
      set({ downloading: false });
    }
  },

  runDecompose: async (method) => {
    const { selectedIds, aoi, downloaded, vmin, vmax } = get();
    // Selected scenes, or (re-compute) the ones already in view.
    const ids = selectedIds.length ? selectedIds : Object.keys(downloaded);
    if (!aoi || ids.length === 0) return;
    set({ downloading: true, error: null, notice: null });
    try {
      const res = await api.decompose(ids, aoi, method);
      const dl = { ...get().downloaded };
      const errors: string[] = [];
      for (const r of res.results) {
        if (r.status === 'ok' && r.aoi_hash && r.bounds) {
          dl[r.item_id] = {
            tileUrl: api.tileTemplate(r.item_id, r.aoi_hash),
            aoiHash: r.aoi_hash,
            bounds: r.bounds,
            asset: `decomp_${method}`,
          };
        } else if (r.error) {
          errors.push(`${r.item_id.slice(0, 22)}…: ${r.error}`);
        }
      }
      const ok = res.ok_count > 0;
      const firstOk = res.results.find((r) => r.status === 'ok');
      const activeGroupIndex = firstOk
        ? Math.max(0, groupIndexOfItem(get().groups, firstOk.item_id))
        : get().activeGroupIndex;
      const rescale = vmin !== '' && vmax !== '' ? `${vmin},${vmax}` : undefined;
      set({
        downloaded: dl,
        activeGroupIndex,
        selectedIds: ok ? [] : get().selectedIds,
        focusMode: ok ? true : get().focusMode,
        showDownloaded: ok ? true : get().showDownloaded,
        decompMethod: method,
        appliedRender: ok ? { indexes: '1,2,3', rescale } : get().appliedRender,
        error: errors.length ? `Some decompositions failed — ${errors.join(' | ')}` : null,
        notice: ok ? `Computed ${method} decomposition for ${res.ok_count} scene(s).` : null,
      });
    } catch (e) {
      set({ error: `Decomposition failed: ${(e as Error).message}` });
    } finally {
      set({ downloading: false });
    }
  },
}));
