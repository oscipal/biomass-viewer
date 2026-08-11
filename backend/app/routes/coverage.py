"""GET /api/coverage — global BIOMASS scene footprints for a collection.

The STAC query is slow (~20 s) so the result is cached to disk and served
instantly afterwards. Pass ?refresh=true to rebuild the cache.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query

from .. import stac
from ..config import get_settings

router = APIRouter()


@router.get("/coverage")
def get_coverage(
    collection: str = Query(..., description="STAC collection id"),
    limit: int = Query(1500, ge=1, le=5000),
    refresh: bool = Query(False),
) -> dict:
    settings = get_settings()
    cache_file = settings.data_dir / "coverage" / f"{collection}.geojson"
    if cache_file.exists() and not refresh:
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001 - fall through to a rebuild
            pass
    try:
        feats = stac.coverage_features(collection, limit)
    except stac.StacError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    fc = {"type": "FeatureCollection", "collection": collection, "count": len(feats), "features": feats}
    try:
        cache_file.write_text(json.dumps(fc), encoding="utf-8")
    except Exception:  # noqa: BLE001 - caching is best-effort
        pass
    return fc
