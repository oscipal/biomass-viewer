"""POST /api/search — STAC search over the AOI."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import stac, store
from ..geo import normalize_aoi
from ..schemas import SearchRequest

router = APIRouter()


@router.post("/search")
def post_search(req: SearchRequest) -> dict:
    try:
        geom = normalize_aoi(req.aoi)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        items = stac.search(geom, req.datetime, req.collections, req.limit)
    except stac.StacError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Remember items so /tiles, /download and /asset can resolve their URLs.
    for item in items:
        store.register_item(item)

    return {
        "count": len(items),
        "items": items,
        "aoi": geom,
        "aoi_hash": store.aoi_hash(geom),
    }
