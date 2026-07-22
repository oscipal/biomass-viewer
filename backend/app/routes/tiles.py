"""GET /api/tiles/{item_id}/{z}/{x}/{y}.png — on-the-fly COG tiles.

Serves from a cached AOI crop when ``?aoi=<hash>`` matches one, otherwise reads
the remote COG directly over range requests.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Response

from .. import cog
from ..auth import TokenError
from ..cog import NoCogAssetError

router = APIRouter()


def _parse_rescale(rescale: Optional[str]) -> Optional[list[list[float]]]:
    if not rescale:
        return None
    try:
        lo, hi = (float(v) for v in rescale.split(","))
        return [[lo, hi]]
    except (ValueError, TypeError):
        return None


def _parse_indexes(indexes: Optional[str]) -> Optional[tuple[int, ...]]:
    if not indexes:
        return None
    try:
        return tuple(int(v) for v in indexes.split(","))
    except (ValueError, TypeError):
        return None


@router.get("/tiles/{item_id}/{z}/{x}/{y}.png")
def get_tile(
    item_id: str,
    z: int,
    x: int,
    y: int,
    asset: Optional[str] = Query(None),
    aoi: Optional[str] = Query(None, description="AOI hash of a cached crop"),
    rescale: Optional[str] = Query(None, description='"min,max"'),
    colormap: Optional[str] = Query(None),
    indexes: Optional[str] = Query(None, description='band indices, e.g. "1,2,4"'),
    expression: Optional[str] = Query(None, description="rio-tiler band math"),
) -> Response:
    try:
        png = cog.render_tile(
            item_id, z, x, y,
            asset_key=asset,
            aoi_h=aoi,
            rescale=_parse_rescale(rescale),
            colormap=colormap,
            indexes=_parse_indexes(indexes),
            expression=expression,
        )
    except TokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except (NoCogAssetError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Tile render failed: {exc}") from exc

    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
