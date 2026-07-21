import { create } from 'zustand';

import * as api from './api';
import { buildGroups, groupIndexOfItem } from './grouping';
import type {
  AppConfig,
  Bbox,
  BiomassItem,
  DownloadedInfo,
  MosaicGroup,
  Theme,
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
  theme: Theme;
  toolMode: ToolMode;
  aoi: GeoJSON.Geometry | null;
  aoiHash: string | null;
  flyToBbox: Bbox | null;

  // --- data ---
  config: AppConfig | null;
  items: BiomassItem[];
  groups: MosaicGroup[];
  activeGroupIndex: number;
  selectedIds: string[];
  downloaded: Record<string, DownloadedInfo>;

  // --- filters ---
  collections: string[];
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
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setToolMode: (m: ToolMode) => void;
  setAoi: (g: GeoJSON.Geometry | null) => void;
  clearAoi: () => void;
  flyTo: (b: Bbox) => void;
  clearFly: () => void;
  setActiveGroupIndex: (i: number) => void;
  focusItem: (id: string) => void;
  toggleSelected: (id: string) => void;
  selectAllInActiveGroup: () => void;
  clearSelection: () => void;
  toggleCollection: (id: string) => void;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setPlaying: (v: boolean) => void;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
  runSearch: () => Promise<void>;
  runDownload: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'tech',
  toolMode: 'none',
  aoi: null,
  aoiHash: null,
  flyToBbox: null,

  config: null,
  items: [],
  groups: [],
  activeGroupIndex: 0,
  selectedIds: [],
  downloaded: {},

  collections: ['BiomassLevel2a'], // L2A is the default
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

  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'tech' ? 'normal' : 'tech' })),
  setToolMode: (toolMode) => set({ toolMode }),
  setAoi: (aoi) => set({ aoi }),
  clearAoi: () => set({ aoi: null, aoiHash: null }),
  flyTo: (flyToBbox) => set({ flyToBbox }),
  clearFly: () => set({ flyToBbox: null }),
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
  toggleCollection: (id) =>
    set((s) => {
      if (s.collections.includes(id)) {
        const next = s.collections.filter((c) => c !== id);
        return { collections: next.length ? next : s.collections }; // keep >= 1
      }
      return { collections: [...s.collections, id] };
    }),
  setDateFrom: (dateFrom) => set({ dateFrom }),
  setDateTo: (dateTo) => set({ dateTo }),
  setPlaying: (playing) => set({ playing }),
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),

  runSearch: async () => {
    const { aoi, dateFrom, dateTo, collections } = get();
    if (!aoi) {
      set({ error: 'Draw or search an area of interest first.' });
      return;
    }
    set({ searching: true, error: null, notice: null, playing: false });
    try {
      const res = await api.searchItems({
        aoi,
        datetime: buildDatetime(dateFrom, dateTo),
        collections,
      });
      const groups = buildGroups(res.items);
      set({
        items: res.items,
        groups,
        aoiHash: res.aoi_hash,
        activeGroupIndex: 0,
        selectedIds: [],
        downloaded: {},
        notice:
          res.count === 0
            ? 'No BIOMASS scenes found for this area / date range / product levels.'
            : `${res.count} scene(s) in ${groups.length} mosaic group(s).`,
      });
    } catch (e) {
      set({ error: `Search failed: ${(e as Error).message}`, items: [], groups: [] });
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
      set({
        downloaded,
        activeGroupIndex,
        error: errors.length ? `Some downloads failed — ${errors.join(' | ')}` : null,
        notice: res.ok_count > 0 ? `Mosaicked ${res.ok_count} full-resolution crop(s).` : null,
      });
    } catch (e) {
      set({ error: `Download failed: ${(e as Error).message}` });
    } finally {
      set({ downloading: false });
    }
  },
}));
