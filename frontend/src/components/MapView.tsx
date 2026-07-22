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

import { bufferPointToPolygon, pointInFootprint, polygonBbox } from '../geoUtils';
import { ensureBaseLayers, setAoiData, syncMosaic } from '../mapLayers';
import { baseMapStyle } from '../mapStyles';
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
  const toolMode = useAppStore((s) => s.toolMode);
  const aoi = useAppStore((s) => s.aoi);
  const groups = useAppStore((s) => s.groups);
  const activeGroupIndex = useAppStore((s) => s.activeGroupIndex);
  const selectedIds = useAppStore((s) => s.selectedIds);
  const downloaded = useAppStore((s) => s.downloaded);
  const flyToBbox = useAppStore((s) => s.flyToBbox);
  const appliedRender = useAppStore((s) => s.appliedRender);
  const focusMode = useAppStore((s) => s.focusMode);
  const showDownloaded = useAppStore((s) => s.showDownloaded);

  // --- create the map once ---
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: baseMapStyle(),
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
        // Zoom the map into the freshly drawn area.
        const bb = polygonBbox(geom);
        if (bb) store.flyTo(bb);
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
      const items = st.focusMode
        ? st.groups.flatMap((g) => g.items).filter((it) => st.downloaded[it.id])
        : st.groups[st.activeGroupIndex]?.items ?? [];
      syncMosaic(map, {
        items,
        downloaded: st.downloaded,
        selectedIds: st.selectedIds,
        render: st.appliedRender,
        focusMode: st.focusMode,
        showDownloaded: st.showDownloaded,
      });
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
      const items = focusMode
        ? groups.flatMap((g) => g.items).filter((it) => downloaded[it.id])
        : groups[activeGroupIndex]?.items ?? [];
      syncMosaic(map, {
        items,
        downloaded,
        selectedIds,
        render: appliedRender,
        focusMode,
        showDownloaded,
      });
    }
  }, [groups, activeGroupIndex, selectedIds, downloaded, appliedRender, focusMode, showDownloaded]);

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
      { padding: 80, duration: 900, maxZoom: 14 },
    );
    useAppStore.getState().clearFly();
  }, [flyToBbox]);

  return <div ref={containerRef} className="map" />;
}
