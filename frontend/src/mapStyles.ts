// Two hand-authored MapLibre style JSONs (not CSS filters), one per theme.
//
//  - tech:   pure-black world, thin glowing country outlines (HUD look). Uses
//            the free MapLibre demo vector tiles (no API key).
//  - normal: classic light OSM raster basemap.

import type { StyleSpecification } from 'maplibre-gl';
import type { Theme } from './types';

const DEMOTILES = 'https://demotiles.maplibre.org/tiles/tiles.json';

const techStyle: StyleSpecification = {
  version: 8,
  name: 'biomass-tech',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    maplibre: { type: 'vector', url: DEMOTILES },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#000000' } },
    // Landmasses stay essentially black (a hair above pure black for depth).
    {
      id: 'countries-fill',
      type: 'fill',
      source: 'maplibre',
      'source-layer': 'countries',
      paint: { 'fill-color': '#05080b', 'fill-opacity': 1 },
    },
    // Soft outer glow.
    {
      id: 'countries-glow',
      type: 'line',
      source: 'maplibre',
      'source-layer': 'countries',
      paint: {
        'line-color': '#19e0ff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.4, 6, 3.5],
        'line-blur': 3,
        'line-opacity': 0.25,
      },
    },
    // Crisp thin outline.
    {
      id: 'countries-outline',
      type: 'line',
      source: 'maplibre',
      'source-layer': 'countries',
      paint: {
        'line-color': '#bdeaff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 6, 1.1],
        'line-opacity': 0.7,
      },
    },
  ],
};

const normalStyle: StyleSpecification = {
  version: 8,
  name: 'biomass-normal',
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#dfe4e8' } },
    { id: 'osm', type: 'raster', source: 'osm' },
  ],
};

export function styleFor(theme: Theme): StyleSpecification {
  // Return a deep copy so MapLibre never mutates our source-of-truth objects.
  return structuredClone(theme === 'tech' ? techStyle : normalStyle);
}
