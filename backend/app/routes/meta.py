"""GET /api/health and /api/config — service metadata (no secrets)."""

from __future__ import annotations

from fastapi import APIRouter

from .. import auth
from ..config import get_settings

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/config")
def config() -> dict:
    settings = get_settings()
    return {
        "catalog": settings.stac_catalog_url,
        "collections": settings.stac_collections,
        "token": auth.token_status(),
        "point_buffer_deg": settings.point_buffer_deg,
        "default_colormap": settings.tile_default_colormap,
        "max_search_items": settings.max_search_items,
    }
