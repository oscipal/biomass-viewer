"""ESA MAAP STAC search.

Discovery does not require a token, so ``/search`` works even before you add
credentials — only the pixel data (quicklooks, COGs) is token-secured.
"""

from __future__ import annotations

from typing import Any, Optional

import pystac_client
from shapely.geometry import shape

from .config import get_settings


class StacError(RuntimeError):
    pass


def get_catalog() -> pystac_client.Client:
    settings = get_settings()
    try:
        return pystac_client.Client.open(settings.stac_catalog_url)
    except Exception as exc:  # noqa: BLE001 - surface a clean message
        raise StacError(f"Could not open STAC catalog: {exc}") from exc


def geometry_to_bbox(geometry: dict[str, Any]) -> tuple[float, float, float, float]:
    geom = shape(geometry)
    minx, miny, maxx, maxy = geom.bounds
    return (minx, miny, maxx, maxy)


def _pick_quicklook(assets: dict[str, dict]) -> Optional[str]:
    settings = get_settings()
    if settings.default_quicklook_asset in assets:
        return settings.default_quicklook_asset
    # Prefer a PNG/JPEG quicklook, then any thumbnail.
    for key, a in assets.items():
        kl = key.lower()
        if "quicklook" in kl and (a.get("type") or "").startswith("image"):
            return key
    for key in ("quicklook_png", "quicklook", "thumbnail", "preview"):
        if key in assets:
            return key
    for key, a in assets.items():
        roles = a.get("roles") or []
        if "thumbnail" in roles or "overview" in roles:
            return key
    return None


# Substrings marking a *secondary* raster (quality/uncertainty/etc.) that we
# would rather not pick as the main displayable band.
_SECONDARY = ("quality", "probability", "uncertain", "cfm", "mask", "_ql", "ql_", "overview", "thumb")


def _is_tiff(a: dict) -> bool:
    href = (a.get("href") or "").lower()
    typ = (a.get("type") or "").lower()
    return href.endswith((".tif", ".tiff")) or "tiff" in typ


def _pick_cog(assets: dict[str, dict]) -> Optional[str]:
    settings = get_settings()
    if settings.default_cog_asset in assets:
        return settings.default_cog_asset
    tiffs = [key for key, a in assets.items() if _is_tiff(a)]
    # Prefer a primary data band (skip obvious secondary/quality layers).
    for key in tiffs:
        if not any(s in key.lower() for s in _SECONDARY):
            return key
    return tiffs[0] if tiffs else None


def _item_datetime(item) -> Optional[str]:
    if item.datetime is not None:
        return item.datetime.isoformat()
    props = item.properties or {}
    return props.get("start_datetime") or props.get("datetime") or props.get("end_datetime")


def serialize_item(item) -> dict[str, Any]:
    assets = {
        key: {
            "href": a.href,
            "type": a.media_type,
            "title": a.title,
            "roles": list(a.roles) if a.roles else [],
        }
        for key, a in item.assets.items()
    }
    props = item.properties or {}
    return {
        "id": item.id,
        "collection": item.collection_id,
        "datetime": _item_datetime(item),
        "bbox": list(item.bbox) if item.bbox else None,
        "geometry": item.geometry,
        "assets": assets,
        "quicklook_key": _pick_quicklook(assets),
        "cog_key": _pick_cog(assets),
        "properties": {
            k: props.get(k)
            for k in ("product:type", "processing:level", "sar:instrument_mode", "sat:orbit_state")
            if k in props
        },
    }


def search(
    geometry: dict[str, Any],
    datetime_range: Optional[str] = None,
    collections: Optional[list[str]] = None,
    limit: Optional[int] = None,
) -> list[dict[str, Any]]:
    """Search the catalog for items intersecting ``geometry``.

    ``datetime_range`` is a STAC datetime string, e.g. ``"2025-01-01/2025-12-31"``
    or ``None`` for no temporal filter. Results are sorted newest-first.
    """
    settings = get_settings()
    catalog = get_catalog()
    bbox = geometry_to_bbox(geometry)
    max_items = limit or settings.max_search_items
    cols = collections or settings.stac_collections

    kwargs: dict[str, Any] = {
        "collections": cols,
        "bbox": bbox,
        "max_items": max_items,
        "method": "GET",
    }
    if datetime_range:
        kwargs["datetime"] = datetime_range

    try:
        result = catalog.search(**kwargs)
        items = [serialize_item(it) for it in result.items()]
    except Exception as exc:  # noqa: BLE001
        raise StacError(f"STAC search failed: {exc}") from exc

    # Newest first (items without a date sort last).
    items.sort(key=lambda it: it.get("datetime") or "", reverse=True)
    return items
