import { create } from 'zustand';

import * as api from './api';
import { polygonBbox, unionBbox } from './geoUtils';
import { buildGroups, groupIndexOfItem } from './grouping';
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
  aoiHash: string | null;
  flyToBbox: Bbox | null;

  // --- ui layout ---
  panelCollapsed: boolean; // left control panel slid off to the left
  focusMode: boolean; // viewing a downloaded full-res image (mosaics/timeline hidden)
  showDownloaded: boolean; // toggle visibility of the downloaded full-res overlay(s)

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
  flyTo: (b: Bbox) => void;
  clearFly: () => void;
  togglePanel: () => void;
  setPanelCollapsed: (v: boolean) => void;
  exitFocus: () => void;
  clearAll: () => void;
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
  aoiHash: null,
  flyToBbox: null,

  panelCollapsed: false,
  focusMode: false,
  showDownloaded: true,

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

  setToolMode: (toolMode) => set({ toolMode }),
  setAoi: (aoi) => set({ aoi }),
  clearAoi: () => set({ aoi: null, aoiHash: null }),
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
  setProduct: (product) =>
    set(() => {
      const def = productById(product);
      return { product, polMode: 'single', polBand: def.pols[0] ?? 'HH' };
    }),
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
    try {
      const res = await api.downloadItems(selectedIds, aoi);
      const downloaded = { ...get().downloaded };
      const errors: string[] = [];
      for (const r of res.results) {
        if (r.status === 'ok' && r.tile_url && r.bounds && r.aoi_hash) {
          downloaded[r.item_id] = {
            tileUrl: api.tileTemplate(r.item_id, r.aoi_hash),
            aoiHash: r.aoi_hash,
            bounds: r.bounds,
            asset: r.asset ?? '',
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
      // Render the fresh download with the currently selected view.
      const st = get();
      const applied =
        computeRender(st.product, st.polMode, st.polBand, st.colormap, st.vmin, st.vmax) ??
        st.appliedRender;
      set({
        downloaded,
        activeGroupIndex,
        // On success, clear the selection and switch to the focused full-res
        // view (mosaics + timeline hidden until the user chooses another image).
        selectedIds: ok ? [] : get().selectedIds,
        focusMode: ok ? true : get().focusMode,
        showDownloaded: ok ? true : get().showDownloaded,
        appliedRender: ok ? applied : st.appliedRender,
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
        appliedRender: ok
          ? { asset: `decomp_${method}`, indexes: '1,2,3', rescale }
          : get().appliedRender,
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
