import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';

import { bufferPointToPolygon, pointInFootprint } from '../geoUtils';
import { ensureBaseLayers, setAoiData, syncMosaic } from '../mapLayers';
import { styleFor } from '../mapStyles';
import { useAppStore } from '../store';
import type { ToolMode } from '../types';

function applyToolMode(draw: TerraDraw, mode: ToolMode): void {
  draw.setMode(mode === 'none' ? 'static' : mode);
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const readyRef = useRef(false);

  // Reactive slices used to drive the imperative map updates.
  const theme = useAppStore((s) => s.theme);
  const toolMode = useAppStore((s) => s.toolMode);
  const aoi = useAppStore((s) => s.aoi);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIndex = useAppStore((s) => s.activeGroupIndex);
  const selectedIds = useAppStore((s) => s.selectedIds);
  const downloaded = useAppStore((s) => s.downloaded);
  const flyToBbox = useAppStore((s) => s.flyToBbox);

  // --- create the map once ---
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleFor(useAppStore.getState().theme),
      center: [10, 20],
      zoom: 1.6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    const initDraw = () => {
      if (drawRef.current) {
        try {
          drawRef.current.stop();
        } catch {
          /* already stopped */
        }
        drawRef.current = null;
      }
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPointMode(),
          new TerraDrawRectangleMode(),
          new TerraDrawPolygonMode(),
        ],
      });
      draw.start();
      draw.setMode('static');
      draw.on('finish', (id, context) => {
        if (context.action !== 'draw') return;
        const feat = draw.getSnapshotFeature(id);
        if (!feat) return;
        const store = useAppStore.getState();
        let geom = feat.geometry as GeoJSON.Geometry;
        if (geom.type === 'Point') {
          const [lon, lat] = (geom as GeoJSON.Point).coordinates;
          const buffer = store.config?.point_buffer_deg ?? 0.05;
          geom = bufferPointToPolygon(lon, lat, buffer);
        }
        store.setAoi(geom);
        draw.clear();
        draw.setMode('static');
        store.setToolMode('none');
      });
      drawRef.current = draw;
      applyToolMode(draw, useAppStore.getState().toolMode);
    };

    // Re-add every custom layer whenever a style (re)loads — including after a
    // theme switch, which wipes all custom sources/layers.
    const onStyleLoad = () => {
      ensureBaseLayers(map);
      const st = useAppStore.getState();
      setAoiData(map, st.aoi);
      const g = st.groups[st.activeGroupIndex];
      syncMosaic(map, { items: g ? g.items : [], downloaded: st.downloaded, selectedIds: st.selectedIds });
      initDraw();
      readyRef.current = true;
    };
    map.on('style.load', onStyleLoad);

    // Clicking the displayed imagery toggles that scene's download selection
    // (only when no drawing tool is active, so it never eats draw clicks).
    map.on('click', (e) => {
      const st = useAppStore.getState();
      if (st.toolMode !== 'none') return;
      const group = st.groups[st.activeGroupIndex];
      if (!group) return;
      const { lng, lat } = e.lngLat;
      // Toggle the frame under the cursor (skip preview-only, non-downloadable).
      const hit = group.items.find(
        (it) => Boolean(it.cog_key) && pointInFootprint(lng, lat, it.geometry, it.bbox),
      );
      if (hit) st.toggleSelected(hit.id);
    });

    return () => {
      readyRef.current = false;
      if (drawRef.current) {
        try {
          drawRef.current.stop();
        } catch {
          /* noop */
        }
        drawRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- theme -> setStyle (onStyleLoad re-adds everything) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    readyRef.current = false;
    map.setStyle(styleFor(theme));
  }, [theme]);

  // --- tool mode ---
  useEffect(() => {
    if (drawRef.current && readyRef.current) applyToolMode(drawRef.current, toolMode);
  }, [toolMode]);

  // --- AOI geometry ---
  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) setAoiData(map, aoi);
  }, [aoi]);

  // --- active overlay / selection highlight ---
  useEffect(() => {
    const map = mapRef.current;
    if (map && readyRef.current) {
      const g = groups[activeGroupIndex];
      syncMosaic(map, { items: g ? g.items : [], downloaded, selectedIds });
    }
  }, [groups, activeGroupIndex, selectedIds, downloaded]);

  // --- fly to a geocoded place ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToBbox) return;
    const [minx, miny, maxx, maxy] = flyToBbox;
    map.fitBounds(
      [
        [minx, miny],
        [maxx, maxy],
      ],
      { padding: 80, duration: 900, maxZoom: 12 },
    );
    useAppStore.getState().clearFly();
  }, [flyToBbox]);

  return <div ref={containerRef} className="map" />;
}
