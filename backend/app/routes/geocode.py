"""GET /api/geocode — place search proxy (Nominatim by default, swappable).

Proxied server-side so we can send a proper User-Agent (Nominatim requires one)
and so the geocoder can be swapped via config without touching the frontend.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Query

from ..config import get_settings

router = APIRouter()


@router.get("/geocode")
def geocode(q: str = Query(..., min_length=1), limit: int = Query(5, ge=1, le=15)) -> dict:
    settings = get_settings()
    try:
        resp = httpx.get(
            settings.geocoder_url,
            params={"q": q, "format": "jsonv2", "limit": limit, "polygon_geojson": 0},
            headers={"User-Agent": settings.geocoder_user_agent},
            timeout=20.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Geocoder failed: {exc}") from exc

    results = []
    for row in resp.json():
        # Nominatim boundingbox order: [south, north, west, east] (strings).
        bb = row.get("boundingbox")
        bbox = None
        if bb and len(bb) == 4:
            south, north, west, east = (float(v) for v in bb)
            bbox = [west, south, east, north]
        results.append(
            {
                "display_name": row.get("display_name"),
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "bbox": bbox,
                "type": row.get("type"),
            }
        )
    return {"results": results}
