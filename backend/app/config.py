"""Application configuration.

Loaded from environment variables and/or a local ``.env`` file (see
``.env.example``). Complex values (lists) are expected as JSON in the env.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- ESA MAAP / STAC ---
    # MAAP_TOKEN may be either a short-lived *access* token or (more commonly)
    # an *offline* token (Keycloak refresh token, typ="Offline"). If it is an
    # offline token the backend exchanges it for an access token at the OIDC
    # endpoint below and refreshes automatically. See app/auth.py.
    maap_token: str = ""
    oidc_token_url: str = (
        "https://iam.maap.eo.esa.int/realms/esa-maap/protocol/openid-connect/token"
    )
    # Public client credentials documented by MAAP for offline-token exchange.
    oidc_client_id: str = "offline-token"
    oidc_client_secret: str = "p1eL7uonXs6MDxtGbgKdPVRAmnGxHpVE"
    oidc_scope: str = "offline_access openid"
    stac_catalog_url: str = "https://catalog.maap.eo.esa.int/catalogue/"
    stac_collections: list[str] = [
        "BiomassLevel2a",
        "BiomassLevel2b",
        "BiomassLevel1a",
        "BiomassLevel1b",
    ]
    default_quicklook_asset: str = "quicklook_png"
    default_cog_asset: str = "enclosure_i_abs_tiff"
    # Suffix-matched host allowlist for the asset proxy / tile reader (anti-SSRF).
    asset_host_allowlist: list[str] = ["maap.eo.esa.int"]

    # --- Cache ---
    cache_dir: Path = Path("./cache")
    cache_max_bytes: int = 5 * 1024**3  # 5 GiB

    # --- Search / AOI ---
    point_buffer_deg: float = 0.05
    max_search_items: int = 50

    # --- Geocoder (swappable, Nominatim-compatible) ---
    geocoder_url: str = "https://nominatim.openstreetmap.org/search"
    geocoder_user_agent: str = "biomass-viewer/0.1"

    # --- Tiles ---
    tile_default_colormap: str = "viridis"

    # --- CORS ---
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @property
    def has_token(self) -> bool:
        return bool(self.maap_token.strip())

    def host_allowed(self, host: str) -> bool:
        host = (host or "").lower()
        return any(host == h or host.endswith("." + h) or host.endswith(h) for h in self.asset_host_allowlist)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    return settings
