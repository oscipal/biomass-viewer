"""Small GeoJSON helpers shared by the routes."""

from __future__ import annotations

from typing import Any

from .config import get_settings


def normalize_aoi(aoi: dict[str, Any]) -> dict[str, Any]:
    """Return a plain GeoJSON geometry from geometry / Feature / FeatureCollection.

    A Point is expanded into a small square Polygon using POINT_BUFFER_DEG so
    that it has a usable (non-zero-area) bbox.
    """
    if not isinstance(aoi, dict) or "type" not in aoi:
        raise ValueError("AOI must be a GeoJSON object with a 'type'.")

    kind = aoi["type"]
    if kind == "FeatureCollection":
        feats = aoi.get("features") or []
        if not feats:
            raise ValueError("Empty FeatureCollection.")
        return normalize_aoi(feats[0])
    if kind == "Feature":
        geom = aoi.get("geometry")
        if not geom:
            raise ValueError("Feature has no geometry.")
        return normalize_aoi(geom)
    if kind == "Point":
        lon, lat = aoi["coordinates"][:2]
        b = get_settings().point_buffer_deg
        return {
            "type": "Polygon",
            "coordinates": [
                [
                    [lon - b, lat - b],
                    [lon + b, lat - b],
                    [lon + b, lat + b],
                    [lon - b, lat + b],
                    [lon - b, lat - b],
                ]
            ],
        }
    return aoi
