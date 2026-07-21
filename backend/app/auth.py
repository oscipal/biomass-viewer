"""ESA MAAP authentication.

The token a user generates from the MAAP portal is usually an *offline* token
(a Keycloak refresh token, ``typ": "Offline"``). Resource servers reject that
directly as a Bearer credential, so we exchange it for a short-lived *access*
token at the OIDC token endpoint and cache it until shortly before it expires.

If the configured token already looks like a plain access token we use it as-is.
"""

from __future__ import annotations

import base64
import binascii
import json
import threading
import time
from typing import Optional

import httpx

from .config import get_settings


class TokenError(RuntimeError):
    """Raised when no usable access token can be obtained."""


_lock = threading.Lock()
_cached_access_token: Optional[str] = None
_cached_expiry: float = 0.0
_cached_source: Optional[str] = None  # the raw token this cache was derived from


def _decode_jwt_payload(token: str) -> Optional[dict]:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)  # pad base64url
        return json.loads(base64.urlsafe_b64decode(payload))
    except (binascii.Error, ValueError, json.JSONDecodeError):
        return None


def _is_offline_token(token: str) -> bool:
    payload = _decode_jwt_payload(token)
    if not payload:
        return False
    return str(payload.get("typ", "")).lower() in ("offline", "refresh")


def _exchange_offline_token(raw: str) -> tuple[str, float]:
    """Exchange an offline/refresh token for an access token. Returns (token, expiry_epoch)."""
    settings = get_settings()
    try:
        resp = httpx.post(
            settings.oidc_token_url,
            data={
                "grant_type": "refresh_token",
                "refresh_token": raw,
                "client_id": settings.oidc_client_id,
                "client_secret": settings.oidc_client_secret,
                "scope": settings.oidc_scope,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:  # network problem
        raise TokenError(f"Could not reach MAAP OIDC endpoint: {exc}") from exc

    if resp.status_code != 200:
        raise TokenError(
            "MAAP token exchange failed "
            f"({resp.status_code}). The offline token is likely expired or "
            "invalid — regenerate it in the MAAP portal. "
            f"Details: {resp.text[:200]}"
        )

    body = resp.json()
    access = body.get("access_token")
    if not access:
        raise TokenError("MAAP token exchange returned no access_token.")
    expires_in = float(body.get("expires_in", 300))
    return access, time.time() + expires_in


def get_access_token() -> str:
    """Return a valid Bearer access token, exchanging/refreshing as needed.

    Raises TokenError if no token is configured or the exchange fails.
    """
    global _cached_access_token, _cached_expiry, _cached_source

    raw = get_settings().maap_token.strip()
    if not raw:
        raise TokenError(
            "MAAP token missing. Add MAAP_TOKEN to backend/.env "
            "(see .env.example for how to obtain one)."
        )

    # Not an offline token -> assume it is already a usable access token.
    if not _is_offline_token(raw):
        return raw

    with _lock:
        # Refresh 30s before actual expiry, and re-exchange if the source changed.
        if (
            _cached_access_token
            and _cached_source == raw
            and time.time() < _cached_expiry - 30
        ):
            return _cached_access_token

        access, expiry = _exchange_offline_token(raw)
        _cached_access_token = access
        _cached_expiry = expiry
        _cached_source = raw
        return access


def token_status() -> dict:
    """Non-secret status for the frontend /config endpoint."""
    raw = get_settings().maap_token.strip()
    if not raw:
        return {"configured": False, "kind": None}
    return {
        "configured": True,
        "kind": "offline" if _is_offline_token(raw) else "access",
    }
