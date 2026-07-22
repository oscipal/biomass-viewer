// Single hand-authored MapLibre style: satellite/aerial imagery basemap.
// Esri "World Imagery" XYZ tiles (no API key required). The dark HUD panels
// are drawn as HTML overlays on top of this imagery.

import type { StyleSpecification } from 'maplibre-gl';

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const satelliteStyle: StyleSpecification = {
  version: 8,
  name: 'biomass-satellite',
  sources: {
    satellite: {
      type: 'raster',
      tiles: [ESRI_IMAGERY],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#04070a' } },
    { id: 'satellite', type: 'raster', source: 'satellite' },
  ],
};

export function baseMapStyle(): StyleSpecification {
  // Return a deep copy so MapLibre never mutates our source-of-truth object.
  return structuredClone(satelliteStyle);
}
