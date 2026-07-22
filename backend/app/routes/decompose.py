"""POST /api/decompose — polarimetric decomposition of SCS scenes to the AOI.

Warps the complex quad-pol SCS data to a geographic grid, runs the chosen
decomposition, and caches a 3-band RGB COG served via the normal /tiles path
(asset=decomp_<method>).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import decomp, stac, store
from ..auth import TokenError
from ..decomp import DecompError
from ..geo import normalize_aoi

router = APIRouter()


class DecomposeRequest(BaseModel):
    item_ids: list[str]
    aoi: dict
    method: str = "pauli"


@router.post("/decompose")
def post_decompose(req: DecomposeRequest) -> dict:
    try:
        geom = normalize_aoi(req.aoi)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    bbox = stac.geometry_to_bbox(geom)
    aoi_h = store.aoi_hash(geom)
    results = []
    for item_id in req.item_ids:
        try:
            meta = decomp.decompose_crop(item_id, geom, bbox, req.method)
            meta["status"] = "ok"
            meta["tile_url"] = f"/api/tiles/{item_id}/{{z}}/{{x}}/{{y}}.png?aoi={aoi_h}"
            results.append(meta)
        except TokenError as exc:
            results.append({"item_id": item_id, "status": "error", "code": 401, "error": str(exc)})
        except (DecompError, ValueError) as exc:
            results.append({"item_id": item_id, "status": "error", "code": 422, "error": str(exc)})
        except FileNotFoundError as exc:
            results.append({"item_id": item_id, "status": "error", "code": 404, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            results.append({"item_id": item_id, "status": "error", "error": f"Decompose failed: {exc}"})

    ok = [r for r in results if r.get("status") == "ok"]
    return {"aoi_hash": aoi_h, "ok_count": len(ok), "method": req.method, "results": results}
