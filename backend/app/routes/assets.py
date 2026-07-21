"""GET /api/asset — token-injecting proxy for quicklooks / thumbnails.

The MAAP asset URLs are token-secured, and we must never expose the token to
the browser. This endpoint resolves the asset href for a known item, fetches it
server-side with the Bearer token, and streams the bytes back. The target host
is checked against an allowlist to avoid being used as an open proxy (SSRF).
"""

from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

from .. import auth, store
from ..config import get_settings

router = APIRouter()


@router.get("/asset")
def get_asset(
    item: str = Query(..., description="item id"),
    key: Optional[str] = Query(None, description="asset key (defaults to quicklook)"),
    role: str = Query("quicklook", description="quicklook | cog"),
) -> Response:
    settings = get_settings()
    href = store.asset_href(item, key, role=role)
    if not href:
        raise HTTPException(status_code=404, detail=f"Asset not found for item '{item}'.")

    host = urlparse(href).hostname or ""
    if not settings.host_allowed(host):
        raise HTTPException(status_code=400, detail=f"Asset host not allowed: {host}")

    try:
        token = auth.get_access_token()
    except auth.TokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    try:
        resp = httpx.get(
            href,
            headers={"Authorization": f"Bearer {token}"},
            follow_redirects=True,
            timeout=60.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {exc}") from exc

    if resp.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="MAAP rejected the token (missing or expired). Refresh MAAP_TOKEN in backend/.env.",
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Upstream returned {resp.status_code}.")

    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=3600"},
    )
