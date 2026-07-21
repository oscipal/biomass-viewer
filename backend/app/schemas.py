"""Request/response models for the API."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    # GeoJSON geometry, Feature, or FeatureCollection. A Point is buffered into
    # a small bbox using POINT_BUFFER_DEG.
    aoi: dict[str, Any] = Field(..., description="GeoJSON AOI")
    datetime: Optional[str] = Field(
        None, description='STAC datetime range, e.g. "2025-01-01/2025-12-31" or null'
    )
    collections: Optional[list[str]] = None
    limit: Optional[int] = None


class DownloadRequest(BaseModel):
    item_ids: list[str]
    aoi: dict[str, Any]
    asset: Optional[str] = None
