// Imperative helpers that keep the map's custom sources/layers in sync with app
// state. All are idempotent so they can be safely re-run after map.setStyle()
// (which wipes every custom source/layer).

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

import { assetUrl } from './api';
import {
  asFeatureCollection,
  bboxToPolygon,
  footprintCorners,
} from './geoUtils';
import type { BiomassItem, DownloadedInfo } from './types';

const AOI_SRC = 'aoi-src';
const SEAMS_SRC = 'seams-src'; // dotted footprint outlines ("stitches")
const SEL_SRC = 'mosaicsel-src'; // highlighted (selected-for-download) footprints

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const MAX_MOSAIC_LAYERS = 40;

// Dynamic per-frame overlay ids created by syncMosaic (variable count).
let dynLayerIds: string[] = [];
let dynSourceIds: string[] = [];

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
  if (!map.getSource(SEAMS_SRC)) {
    map.addSource(SEAMS_SRC, { type: 'geojson', data: EMPTY_FC });
    // The dotted "stitch" lines between adjacent mosaicked frames.
    map.addLayer({
      id: 'seams-line',
      type: 'line',
      source: SEAMS_SRC,
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.4,
        'line-dasharray': [2, 2],
        'line-opacity': 0.85,
      },
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

function addQuicklook(map: MapLibreMap, item: BiomassItem, i: number): void {
  const coords = footprintCorners(item.geometry, item.bbox);
  if (!coords) return;
  const srcId = `m-img-src-${i}`;
  const lyrId = `m-img-lyr-${i}`;
  map.addSource(srcId, { type: 'image', url: assetUrl(item), coordinates: coords });
  map.addLayer(
    { id: lyrId, type: 'raster', source: srcId, paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 } },
    beforeAoi(map),
  );
  dynSourceIds.push(srcId);
  dynLayerIds.push(lyrId);
}

function addTiles(map: MapLibreMap, info: DownloadedInfo, i: number): void {
  const srcId = `m-tiles-src-${i}`;
  const lyrId = `m-tiles-lyr-${i}`;
  map.addSource(srcId, { type: 'raster', tiles: [info.tileUrl], tileSize: 256, bounds: info.bounds });
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
}

/** Reconcile the whole active mosaic group: one overlay per frame (quicklook,
 *  or pyramidal tiles once downloaded), dotted seam outlines between frames,
 *  and a highlight around frames selected for download. */
export function syncMosaic(map: MapLibreMap, s: MosaicState): void {
  clearDynamicMosaic(map);
  const items = s.items.slice(0, MAX_MOSAIC_LAYERS);
  if (items.length === 0) {
    setData(map, SEAMS_SRC, EMPTY_FC);
    setData(map, SEL_SRC, EMPTY_FC);
    return;
  }
  items.forEach((it, i) => {
    const dl = s.downloaded[it.id];
    if (dl) addTiles(map, dl, i);
    else if (it.quicklook_key) addQuicklook(map, it, i);
  });
  setData(map, SEAMS_SRC, footprintsFC(items));
  setData(map, SEL_SRC, footprintsFC(items.filter((it) => s.selectedIds.includes(it.id))));
}
