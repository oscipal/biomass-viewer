// Thin client for the backend API. Uses same-origin relative URLs by default
// (the Vite dev server proxies /api to the backend). Override with VITE_API_BASE.

import type {
  AppConfig,
  BiomassItem,
  DownloadResponse,
  DownloadResult,
  GeocodeResult,
  SearchResponse,
} from './types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      /* non-JSON error body — keep status text */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function fetchConfig(): Promise<AppConfig> {
  return jsonOrThrow<AppConfig>(await fetch(`${BASE}/api/config`));
}

export interface SearchBody {
  aoi: GeoJSON.Geometry;
  datetime?: string;
  collections?: string[];
  limit?: number;
}

export async function searchItems(body: SearchBody): Promise<SearchResponse> {
  return jsonOrThrow<SearchResponse>(
    await fetch(`${BASE}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function downloadItems(
  itemIds: string[],
  aoi: GeoJSON.Geometry,
  asset?: string,
): Promise<DownloadResponse> {
  return jsonOrThrow<DownloadResponse>(
    await fetch(`${BASE}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_ids: itemIds, aoi, asset }),
    }),
  );
}

export async function decompose(
  itemIds: string[],
  aoi: GeoJSON.Geometry,
  method: string,
): Promise<DownloadResponse> {
  return jsonOrThrow<DownloadResponse>(
    await fetch(`${BASE}/api/decompose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_ids: itemIds, aoi, method }),
    }),
  );
}

export interface StitchResponse {
  aoi_hash: string;
  ok_count: number;
  count: number;
  result: DownloadResult;
}

export async function stitchItems(
  itemIds: string[],
  aoi: GeoJSON.Geometry,
): Promise<StitchResponse> {
  return jsonOrThrow<StitchResponse>(
    await fetch(`${BASE}/api/stitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_ids: itemIds, aoi }),
    }),
  );
}

export async function fetchCoverage(collection: string): Promise<GeoJSON.FeatureCollection> {
  return jsonOrThrow<GeoJSON.FeatureCollection>(
    await fetch(`${BASE}/api/coverage?collection=${encodeURIComponent(collection)}`),
  );
}

export async function geocode(q: string): Promise<GeocodeResult[]> {
  const data = await jsonOrThrow<{ results: GeocodeResult[] }>(
    await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(q)}`),
  );
  return data.results;
}

// URL for the token-injecting asset proxy (quicklooks / thumbnails).
export function assetUrl(item: BiomassItem, key?: string | null): string {
  const k = key ?? item.quicklook_key ?? undefined;
  const params = new URLSearchParams({ item: item.id, role: 'quicklook' });
  if (k) params.set('key', k);
  return `${BASE}/api/asset?${params.toString()}`;
}

// MapLibre raster tile template. {z}/{x}/{y} must stay unescaped.
export function tileTemplate(itemId: string, aoiHash?: string): string {
  const q = aoiHash ? `?aoi=${encodeURIComponent(aoiHash)}` : '';
  return `${BASE}/api/tiles/${encodeURIComponent(itemId)}/{z}/{x}/{y}.png${q}`;
}
