"""Pre-build the global BIOMASS coverage as a density grid (heatmap).

The catalogue holds hundreds of thousands of acquisitions, so we fetch a
representative sample of footprints and bin them into a coarse lon/lat grid,
counting how many acquisitions overlap each cell. The output size is bounded by
the grid (a few thousand cells) no matter how many acquisitions exist, and
renders as a heatmap/choropleth.

    python build_coverage.py                       # all products
    python build_coverage.py --sample 8000 --cell 0.5

Writes ``data/coverage/<collection>.geojson`` (grid cells with a ``count``),
served by GET /api/coverage.
"""

from __future__ import annotations

import argparse
import json
import math
import time

from shapely.geometry import box, shape

from app import stac
from app.config import get_settings

COLLECTIONS = ["BiomassLevel2a", "BiomassLevel1b", "BiomassLevel1a"]


def density_grid(features: list[dict], cell: float) -> tuple[list[dict], int]:
    counts: dict[tuple[int, int], int] = {}
    for f in features:
        geom = f.get("geometry")
        if not geom:
            continue
        try:
            g = shape(geom)
        except Exception:  # noqa: BLE001
            continue
        minx, miny, maxx, maxy = g.bounds
        for i in range(math.floor(minx / cell), math.floor(maxx / cell) + 1):
            for j in range(math.floor(miny / cell), math.floor(maxy / cell) + 1):
                if g.intersects(box(i * cell, j * cell, (i + 1) * cell, (j + 1) * cell)):
                    counts[(i, j)] = counts.get((i, j), 0) + 1
    feats = []
    for (i, j), c in counts.items():
        x0, y0, x1, y1 = i * cell, j * cell, (i + 1) * cell, (j + 1) * cell
        feats.append(
            {
                "type": "Feature",
                "properties": {"count": c},
                "geometry": {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]},
            }
        )
    return feats, (max(counts.values()) if counts else 1)


def build(collections: list[str], sample: int, cell: float) -> None:
    out_dir = get_settings().data_dir / "coverage"
    out_dir.mkdir(parents=True, exist_ok=True)
    for col in collections:
        t = time.time()
        footprints = stac.coverage_features(col, sample)
        cells, mx = density_grid(footprints, cell)
        fc = {
            "type": "FeatureCollection",
            "collection": col,
            "cell": cell,
            "sample": len(footprints),
            "maxCount": mx,
            "count": len(cells),
            "features": cells,
        }
        (out_dir / f"{col}.geojson").write_text(json.dumps(fc), encoding="utf-8")
        print(f"{col}: {len(footprints)} footprints -> {len(cells)} cells (max {mx}) in {time.time() - t:.0f}s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=5000, help="footprints to sample per collection")
    ap.add_argument("--cell", type=float, default=1.0, help="grid cell size in degrees")
    ap.add_argument("--collections", nargs="*", default=COLLECTIONS)
    args = ap.parse_args()
    build(args.collections, args.sample, args.cell)
