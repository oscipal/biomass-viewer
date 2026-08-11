"""POST /api/stitch — mosaic several adjacent scenes' AOI crops into one COG."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import cog, stac, store
from ..auth import TokenError
from ..cog import NoCogAssetError
from ..geo import normalize_aoi

router = APIRouter()


class StitchRequest(BaseModel):
    item_ids: list[str]
    aoi: dict
    asset: str | None = None


@router.post("/stitch")
def post_stitch(req: StitchRequest) -> dict:
    if len(req.item_ids) < 2:
        raise HTTPException(status_code=400, detail="Stitching needs at least two scenes.")
    try:
        geom = normalize_aoi(req.aoi)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    bbox = stac.geometry_to_bbox(geom)
    aoi_h = store.aoi_hash(geom)
    try:
        meta = cog.stitch_to_aoi(req.item_ids, geom, bbox, asset_key=req.asset)
    except TokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except NoCogAssetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Stitch failed: {exc}") from exc

    meta["status"] = "ok"
    meta["tile_url"] = f"/api/tiles/{meta['item_id']}/{{z}}/{{x}}/{{y}}.png?aoi={aoi_h}"
    return {"aoi_hash": aoi_h, "ok_count": 1, "count": len(req.item_ids), "result": meta}
