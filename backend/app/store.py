"""In-process item registry + on-disk crop cache with LRU eviction.

Why a registry: the ``/tiles`` and ``/download`` endpoints only receive an
``item_id``. To resolve that to a concrete COG/quicklook URL we remember the
items returned by the most recent ``/search`` calls. The registry is persisted
to disk so tile/download requests keep working across a backend restart.

The crop cache stores AOI-cropped COGs keyed by ``item_id + aoi_hash + asset``
and evicts least-recently-used files once the total size exceeds the limit.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from pathlib import Path
from typing import Any, Optional

from .config import get_settings

_lock = threading.RLock()
_registry: dict[str, dict[str, Any]] = {}
_registry_loaded = False

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _registry_path() -> Path:
    return get_settings().cache_dir / "registry.json"


def _index_path() -> Path:
    return get_settings().cache_dir / "cache_index.json"


# --------------------------------------------------------------------------- #
# Item registry
# --------------------------------------------------------------------------- #
def _ensure_loaded() -> None:
    global _registry_loaded
    if _registry_loaded:
        return
    with _lock:
        if _registry_loaded:
            return
        path = _registry_path()
        if path.exists():
            try:
                _registry.update(json.loads(path.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, OSError):
                pass
        _registry_loaded = True


def _persist_registry() -> None:
    try:
        _registry_path().write_text(json.dumps(_registry), encoding="utf-8")
    except OSError:
        pass


def register_item(item: dict[str, Any]) -> None:
    """Store the minimal fields needed to later resolve assets for an item."""
    _ensure_loaded()
    with _lock:
        _registry[item["id"]] = {
            "id": item["id"],
            "collection": item.get("collection"),
            "datetime": item.get("datetime"),
            "bbox": item.get("bbox"),
            "assets": item.get("assets", {}),
            "quicklook_key": item.get("quicklook_key"),
            "cog_key": item.get("cog_key"),
            "rescale": item.get("rescale"),  # cached [min,max] once computed
        }
        _persist_registry()


def get_item(item_id: str) -> Optional[dict[str, Any]]:
    _ensure_loaded()
    with _lock:
        return _registry.get(item_id)


def set_item_rescale(item_id: str, rescale: list[float]) -> None:
    _ensure_loaded()
    with _lock:
        if item_id in _registry:
            _registry[item_id]["rescale"] = rescale
            _persist_registry()


def asset_href(item_id: str, key: Optional[str], role: str = "cog") -> Optional[str]:
    """Resolve an asset href for an item.

    ``role`` selects a sensible default key when ``key`` is None:
    ``cog`` -> cog_key, ``quicklook`` -> quicklook_key.
    """
    item = get_item(item_id)
    if not item:
        return None
    assets = item.get("assets", {})
    if key is None:
        key = item.get("cog_key") if role == "cog" else item.get("quicklook_key")
    asset = assets.get(key) if key else None
    return asset.get("href") if asset else None


# --------------------------------------------------------------------------- #
# AOI hashing + crop cache paths
# --------------------------------------------------------------------------- #
def aoi_hash(geometry: dict[str, Any]) -> str:
    payload = json.dumps(geometry, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]


def _safe(name: str) -> str:
    return _SAFE.sub("_", name)[:120]


def crop_path(item_id: str, aoi_h: str, asset: str) -> Path:
    fname = f"{_safe(item_id)}__{aoi_h}__{_safe(asset)}.tif"
    return get_settings().cache_dir / fname


# --------------------------------------------------------------------------- #
# LRU cache index / eviction
# --------------------------------------------------------------------------- #
def _load_index() -> dict[str, float]:
    path = _index_path()
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_index(index: dict[str, float]) -> None:
    try:
        _index_path().write_text(json.dumps(index), encoding="utf-8")
    except OSError:
        pass


def touch(path: Path) -> None:
    """Mark a cache file as recently used."""
    with _lock:
        index = _load_index()
        index[path.name] = time.time()
        _save_index(index)


def evict_if_needed() -> None:
    """Delete least-recently-used crops until total size <= cache_max_bytes."""
    settings = get_settings()
    with _lock:
        index = _load_index()
        files = [p for p in settings.cache_dir.glob("*.tif") if p.is_file()]
        total = sum(p.stat().st_size for p in files)
        if total <= settings.cache_max_bytes:
            return
        # Oldest access first (missing index entry => treat as very old).
        files.sort(key=lambda p: index.get(p.name, 0.0))
        for p in files:
            if total <= settings.cache_max_bytes:
                break
            try:
                size = p.stat().st_size
                p.unlink()
                total -= size
                index.pop(p.name, None)
            except OSError:
                continue
        _save_index(index)
