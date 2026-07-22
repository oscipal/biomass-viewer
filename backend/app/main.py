"""biomass-viewer FastAPI application.

Run from the ``backend`` directory:
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings
from .routes import assets, decompose, download, geocode, meta, search, tiles

settings = get_settings()

app = FastAPI(
    title="biomass-viewer backend",
    version=__version__,
    description="STAC proxy, token-secured asset proxy, AOI crop cache and COG tile server for ESA BIOMASS data.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (meta, search, tiles, download, decompose, assets, geocode):
    app.include_router(module.router, prefix="/api", tags=["biomass"])


@app.get("/")
def root() -> dict:
    return {"name": "biomass-viewer backend", "version": __version__, "docs": "/docs"}
