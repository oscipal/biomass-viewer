"""POST /api/download — crop selected items to the AOI and cache them.

Uses partial COG reads (HTTP range requests) so only the AOI window is fetched,
never the full multi-GB scene. The cropped COG is cached on disk; the frontend
then displays it via the pyramidal /tiles endpoint.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import cog, stac, store
from ..auth import TokenError
from ..cog import NoCogAssetError
from ..geo import normalize_aoi
from ..schemas import DownloadRequest

router = APIRouter()


@router.post("/download")
def post_download(req: DownloadRequest) -> dict:
    try:
        geom = normalize_aoi(req.aoi)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    bbox = stac.geometry_to_bbox(geom)
    aoi_h = store.aoi_hash(geom)
    results = []

    for item_id in req.item_ids:
        try:
            meta = cog.crop_to_aoi(item_id, geom, bbox, asset_key=req.asset)
            meta["status"] = "ok"
            meta["tile_url"] = f"/api/tiles/{item_id}/{{z}}/{{x}}/{{y}}.png?aoi={aoi_h}"
            results.append(meta)
        except TokenError as exc:
            results.append({"item_id": item_id, "status": "error", "code": 401, "error": str(exc)})
        except NoCogAssetError as exc:
            results.append(
                {"item_id": item_id, "status": "error", "code": 422, "preview_only": True, "error": str(exc)}
            )
        except FileNotFoundError as exc:
            results.append({"item_id": item_id, "status": "error", "code": 404, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            results.append({"item_id": item_id, "status": "error", "error": f"Crop failed: {exc}"})

    ok = [r for r in results if r.get("status") == "ok"]
    return {"aoi_hash": aoi_h, "ok_count": len(ok), "results": results}
