// Imperative helpers that keep the map's custom sources/layers in sync with app
// state. All are idempotent so they can be safely re-run after map.setStyle()
// (which wipes every custom source/layer).

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

import { assetUrl } from './api';
import {
  asFeatureCollection,
  bboxToImageCoords,
  bboxToPolygon,
} from './geoUtils';
import type { AppliedRender } from './products';
import type { BiomassItem, DownloadedInfo } from './types';

const AOI_SRC = 'aoi-src';
const SEL_SRC = 'mosaicsel-src'; // highlighted (selected-for-download) footprints

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const MAX_MOSAIC_LAYERS = 40;

// Dynamic per-frame overlay ids created by syncMosaic (variable count).
let dynLayerIds: string[] = [];
let dynSourceIds: string[] = [];

// Bumped on each syncMosaic so slow async quicklook processing can tell whether
// it has been superseded before it touches the map.
let syncGen = 0;
// Cache of processed (black-nodata → transparent) quicklook data URLs, per item.
const qlDataUrlCache = new Map<string, string>();

// Near-black luminance threshold below which a pixel is treated as nodata and
// made fully transparent.
const NODATA_THRESHOLD = 16;

// Redraw a quicklook JPEG into a canvas, turning its near-black nodata padding
// transparent so only the acquisition swath shows over the basemap. Runs on the
// same-origin proxied image, so the canvas is not tainted.
function keyBlackToTransparent(img: HTMLImageElement): string {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let p = 0; p < px.length; p += 4) {
    if (px[p] <= NODATA_THRESHOLD && px[p + 1] <= NODATA_THRESHOLD && px[p + 2] <= NODATA_THRESHOLD) {
      px[p + 3] = 0;
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

function placeQuicklook(
  map: MapLibreMap,
  srcId: string,
  lyrId: string,
  url: string,
  coords: [[number, number], [number, number], [number, number], [number, number]],
): void {
  if (map.getSource(srcId)) return;
  map.addSource(srcId, { type: 'image', url, coordinates: coords });
  map.addLayer(
    { id: lyrId, type: 'raster', source: srcId, paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 } },
    beforeAoi(map),
  );
  dynSourceIds.push(srcId);
  dynLayerIds.push(lyrId);
}

export function ensureBaseLayers(map: MapLibreMap): void {
  if (!map.getSource(AOI_SRC)) {
    map.addSource(AOI_SRC, { type: 'geojson', data: EMPTY_FC });
    map.addLayer({
      id: 'aoi-fill',
      type: 'fill',
      source: AOI_SRC,
      paint: { 'fill-color': '#19e0ff', 'fill-opacity': 0.06 },
    });
    map.addLayer({
      id: 'aoi-line',
      type: 'line',
      source: AOI_SRC,
      paint: { 'line-color': '#19e0ff', 'line-width': 1.6, 'line-dasharray': [3, 2] },
    });
  }
  if (!map.getSource(SEL_SRC)) {
    map.addSource(SEL_SRC, { type: 'geojson', data: EMPTY_FC });
    map.addLayer({
      id: 'mosaicsel-line',
      type: 'line',
      source: SEL_SRC,
      paint: { 'line-color': '#ffd166', 'line-width': 3, 'line-blur': 1, 'line-opacity': 0.95 },
    });
  }
}

function setData(map: MapLibreMap, srcId: string, data: GeoJSON.GeoJSON): void {
  const src = map.getSource(srcId) as GeoJSONSource | undefined;
  if (src) src.setData(data);
}

export function setAoiData(map: MapLibreMap, geom: GeoJSON.Geometry | null): void {
  setData(map, AOI_SRC, asFeatureCollection(geom));
}

function clearDynamicMosaic(map: MapLibreMap): void {
  for (const id of dynLayerIds) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of dynSourceIds) if (map.getSource(id)) map.removeSource(id);
  dynLayerIds = [];
  dynSourceIds = [];
}

const beforeAoi = (map: MapLibreMap): string | undefined =>
  map.getLayer('aoi-fill') ? 'aoi-fill' : undefined;

function footprintOf(item: BiomassItem): GeoJSON.Geometry | null {
  if (item.geometry) return item.geometry;
  return item.bbox ? bboxToPolygon(item.bbox) : null;
}

function footprintsFC(items: BiomassItem[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const it of items) {
    const g = footprintOf(it);
    if (g) features.push({ type: 'Feature', properties: { id: it.id }, geometry: g });
  }
  return { type: 'FeatureCollection', features };
}

function addQuicklook(map: MapLibreMap, item: BiomassItem, i: number, gen: number): void {
  // BIOMASS quicklook JPEGs are north-up images covering the item's bounding
  // box, with the tilted acquisition swath (and black nodata padding) drawn
  // inside. So they must be placed on the axis-aligned bbox — warping them onto
  // the rotated footprint quad would mis-register the swath.
  if (!item.bbox) return;
  const coords = bboxToImageCoords(item.bbox);
  const srcId = `m-img-src-${i}`;
  const lyrId = `m-img-lyr-${i}`;

  const cached = qlDataUrlCache.get(item.id);
  if (cached) {
    placeQuicklook(map, srcId, lyrId, cached, coords);
    return;
  }
  // Load the quicklook, key out the black nodata, then overlay it — but only if
  // this syncMosaic pass is still the current one.
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const dataUrl = keyBlackToTransparent(img);
    qlDataUrlCache.set(item.id, dataUrl);
    if (gen !== syncGen) return; // a newer sync superseded this group
    try {
      placeQuicklook(map, srcId, lyrId, dataUrl, coords);
    } catch {
      /* map/style went away while loading */
    }
  };
  img.onerror = () => {
    /* unreadable quicklook — skip this frame */
  };
  img.src = assetUrl(item);
}

function tileUrlWithRender(base: string, render: AppliedRender): string {
  const params = new URLSearchParams();
  if (render.indexes) params.set('indexes', render.indexes);
  if (render.expression) params.set('expression', render.expression);
  if (render.colormap) params.set('colormap', render.colormap);
  if (render.rescale) params.set('rescale', render.rescale);
  const extra = params.toString();
  return extra ? `${base}&${extra}` : base;
}

function addTiles(map: MapLibreMap, info: DownloadedInfo, i: number, render: AppliedRender): void {
  const srcId = `m-tiles-src-${i}`;
  const lyrId = `m-tiles-lyr-${i}`;
  const url = tileUrlWithRender(info.tileUrl, render);
  map.addSource(srcId, { type: 'raster', tiles: [url], tileSize: 256, bounds: info.bounds });
  map.addLayer(
    { id: lyrId, type: 'raster', source: srcId, paint: { 'raster-fade-duration': 0 } },
    beforeAoi(map),
  );
  dynSourceIds.push(srcId);
  dynLayerIds.push(lyrId);
}

export interface MosaicState {
  items: BiomassItem[]; // items of the active mosaic group
  downloaded: Record<string, DownloadedInfo>;
  selectedIds: string[];
  render: AppliedRender;
  focusMode: boolean; // full-res tiles are only drawn while focused on a download
  showDownloaded: boolean; // when false, downloaded full-res overlays are hidden
}

/** Reconcile the whole active group: simultaneously show one overlay per
 *  adjacent frame covering the AOI (quicklook, or pyramidal tiles once
 *  downloaded), plus a highlight around frames selected for download. */
export function syncMosaic(map: MapLibreMap, s: MosaicState): void {
  const gen = ++syncGen;
  clearDynamicMosaic(map);
  const items = s.items.slice(0, MAX_MOSAIC_LAYERS);
  if (items.length === 0) {
    setData(map, SEL_SRC, EMPTY_FC);
    return;
  }
  items.forEach((it, i) => {
    const dl = s.downloaded[it.id];
    if (s.focusMode && dl) {
      // Focused on a download: show full-res tiles, unless hidden via the
      // visibility toggle (then render nothing — the basemap shows through).
      if (s.showDownloaded) addTiles(map, dl, i, s.render);
    } else if (it.quicklook_key) {
      // Browsing (or a non-downloaded frame): always the quicklook.
      addQuicklook(map, it, i, gen);
    }
  });
  setData(map, SEL_SRC, footprintsFC(items.filter((it) => s.selectedIds.includes(it.id))));
}
