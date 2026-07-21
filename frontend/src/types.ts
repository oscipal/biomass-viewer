// Shared types for the biomass-viewer frontend.

export type Theme = 'tech' | 'normal';

// Mutually-exclusive AOI selection tools.
export type ToolMode = 'none' | 'point' | 'rectangle' | 'polygon';

export type Bbox = [number, number, number, number]; // [minx, miny, maxx, maxy]

export interface StacAsset {
  href: string;
  type?: string | null;
  title?: string | null;
  roles?: string[];
}

export interface BiomassItem {
  id: string;
  collection?: string | null;
  datetime?: string | null;
  bbox?: Bbox | null;
  geometry?: GeoJSON.Geometry | null;
  assets: Record<string, StacAsset>;
  quicklook_key?: string | null;
  cog_key?: string | null;
  properties?: Record<string, unknown>;
}

export interface SearchResponse {
  count: number;
  items: BiomassItem[];
  aoi: GeoJSON.Geometry;
  aoi_hash: string;
}

export interface DownloadResult {
  item_id: string;
  status: 'ok' | 'error';
  aoi_hash?: string;
  asset?: string;
  bounds?: Bbox;
  tile_url?: string;
  cached?: boolean;
  error?: string;
  code?: number;
}

export interface DownloadResponse {
  aoi_hash: string;
  ok_count: number;
  results: DownloadResult[];
}

export interface GeocodeResult {
  display_name: string;
  lat: number;
  lon: number;
  bbox: Bbox | null;
  type?: string;
}

export interface TokenStatus {
  configured: boolean;
  kind: 'offline' | 'access' | null;
}

export interface AppConfig {
  catalog: string;
  collections: string[];
  token: TokenStatus;
  point_buffer_deg: number;
  default_colormap: string;
  max_search_items: number;
}

// A set of adjacent frames from one acquisition (same product type + date)
// that are displayed together as a single mosaicked timestep.
export interface MosaicGroup {
  key: string;
  label: string;
  productType: string;
  date: string;
  items: BiomassItem[];
}

// Info stored per item once its AOI-crop has been downloaded.
export interface DownloadedInfo {
  tileUrl: string; // MapLibre tile template ({z}/{x}/{y})
  aoiHash: string;
  bounds: Bbox;
  asset: string;
}
