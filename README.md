# biomass-viewer

Interactive web app to **search, preview and download ESA BIOMASS satellite
imagery** (P-band SAR, Above-Ground-Biomass products) on a map — a bit like
Google Earth, but for the ESA BIOMASS mission.

- **Search** the [ESA MAAP STAC catalog](https://catalog.maap.eo.esa.int/catalogue/)
  for an area of interest (point / rectangle / polygon / place search).
- **Preview** matching scenes as quicklook overlays on the map, scrub through
  acquisition dates with a **timeline**.
- **Download** full-resolution data on demand — only the AOI window is fetched
  from the (multi-GB) Cloud-Optimized-GeoTIFFs via HTTP range requests, cropped,
  cached, and served as **pyramidal map tiles**.

The map uses a **satellite / aerial basemap** (Esri World Imagery) with a dark
translucent HUD overlay for the controls.

```
biomass-viewer/
  environment.yml     # conda env (Python 3.11 + geospatial stack)
  backend/            # FastAPI: STAC proxy, token auth, AOI-crop cache, COG tile server
  frontend/           # React + TypeScript + Vite + MapLibre GL JS
  README.md
```

---

## 1. Prerequisites

- [conda / miniconda](https://docs.conda.io/) (for the backend geospatial stack)
- [Node.js](https://nodejs.org/) ≥ 20 and npm (for the frontend)
- An **ESA MAAP account + offline token** to preview/download pixel data
  (searching works without one). See step 3.

---

## 2. Backend

### Create the conda environment

```bash
conda env create -f environment.yml
conda activate biomass-viewer
```

This installs GDAL, rasterio, rio-tiler, rio-cogeo, pystac-client, FastAPI, etc.
— all from conda-forge so they share one GDAL build.

### Configure your token

```bash
cd backend
cp .env.example .env      # then edit .env
```

Open `backend/.env` and set `MAAP_TOKEN`. See **step 3** for how to get one.
All other settings have sensible defaults (catalog URL, collections, cache dir,
cache size limit, geocoder, CORS origins…). The **token never leaves the
backend** — the frontend only talks to this server.

### Run the backend

```bash
# from the backend/ directory, with the conda env active:
uvicorn app.main:app --reload --port 8000
```

- API docs: <http://localhost:8000/docs>
- Health:  <http://localhost:8000/api/health>
- Config:  <http://localhost:8000/api/config> (shows whether a token is loaded)

---

## 3. Getting a MAAP token

Discovery (STAC search) is open, but reading quicklooks and COG assets is
token-secured.

1. Create an ESA MAAP account: <https://portal.maap.eo.esa.int>
2. Generate an **offline token**:
   <https://portal.maap.eo.esa.int/ini/services/auth/token/index.php>
3. Paste it into `backend/.env` as `MAAP_TOKEN=...`

The token you get is normally an **offline token** (a Keycloak refresh token).
The backend automatically exchanges it for a short-lived *access* token at the
MAAP OIDC endpoint and refreshes it as needed (see `backend/app/auth.py`) — you
don't have to do anything. If the token is missing or expired, the frontend
shows a clear message; just refresh it in `.env`.

> The OIDC client id/secret used for the exchange are the **public** values
> documented by MAAP and are baked in as defaults (`OIDC_CLIENT_ID`,
> `OIDC_CLIENT_SECRET`); override them in `.env` if MAAP changes them.

---

## 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server **proxies `/api`** to the
backend on port 8000, so make sure the backend is running.

Production build:

```bash
npm run build     # outputs to frontend/dist
npm run preview
```

If your backend runs elsewhere, set `VITE_API_PROXY` (dev) or `VITE_API_BASE`
(build) accordingly.

---

## 5. How to use

1. **Define an AOI** with the toolbar: **Point** (auto-buffered to a small box),
   **Rectangle** (click-drag), **Polygon** (click vertices, double-click to
   finish), or type a **place name** to geocode + fly there. Drawing an AOI
   zooms the map into it.
2. Optionally set an **acquisition date** range, then **Search scenes**. The
   control panel slides away to the left on search — click the **‹ / ›** tab to
   show/hide it again.
3. Matching scenes appear as **quicklook overlays** covering the AOI (adjacent
   frames shown together, with black nodata keyed to transparent). Use the
   bottom **timeline** (play/pause) to scrub through acquisition dates, and the
   **Mosaics** list on the right.
4. **Select** one or more scenes (checkbox in the list, or click the overlay on
   the map), then **Confirm download**. The backend crops the original COGs to
   your AOI, caches them, and switches to a **full-resolution view**: the mosaics
   and timeline hide so you can inspect the downloaded **pyramidal tiles**.
   - Adjust the **colormap** and **vmin/vmax** stretch live (empty vmin/vmax =
     automatic 2–98% percentile).
   - **‹ Choose a different image** brings back the mosaics/timeline; **Clear
     all** resets the workspace.

---

## 6. Architecture / API

Backend endpoints (all under `/api`):

| Endpoint | Purpose |
| --- | --- |
| `POST /search` | STAC search over an AOI (GeoJSON) + optional date range. |
| `GET /tiles/{item_id}/{z}/{x}/{y}.png` | On-the-fly COG tiles (rio-tiler). Serves a cached AOI crop when `?aoi=<hash>` is given, else the remote COG. Optional `?asset=`, `?rescale=min,max`, `?colormap=`. |
| `POST /download` | Partial COG read → crop to AOI → write cached COG. Returns a tile-URL template. |
| `GET /asset` | Token-injecting proxy for quicklooks/thumbnails (never exposes the token; host-allowlisted). |
| `GET /geocode` | Place search proxy (Nominatim by default, swappable). |
| `GET /config`, `GET /health` | Non-secret status. |

Key backend modules: `stac.py` (search), `auth.py` (offline→access token
exchange), `cog.py` (tiles + AOI crop), `store.py` (item registry + LRU crop
cache), `routes/` (FastAPI routers).

Frontend: `store.ts` (Zustand — the single source of truth: tool mode, AOI,
results, active timestep, selection, downloads, render params, UI layout),
`MapView.tsx` (MapLibre + terra-draw + overlay sync), `mapStyles.ts` (the
hand-authored satellite basemap style), `mapLayers.ts` (overlay placement +
transparent-nodata quicklook processing), `grouping.ts` (frame grouping + the
GN-only product filter).

---

## 7. Notes & caveats

- **Data availability:** BIOMASS Level-1 products are openly available since
  Dec 2025; Level-2 is rolling out. Collections searched:
  `BiomassLevel2a/2b/1a/1b` (configurable via `STAC_COLLECTIONS`).
- **Asset names vary by product** (`enclosure_i_fd_tiff`, `enclosure_tiff`,
  `quicklook_jpg`, …). The backend picks a sensible quicklook + primary COG per
  item; override the defaults in `.env`.
- **Cache:** cropped COGs live in `backend/cache/` (gitignored) with LRU
  eviction once total size exceeds `CACHE_MAX_BYTES` (default 5 GiB).
- **Basemap** uses Esri **World Imagery** XYZ tiles (no API key required). See
  attribution below.
- **Quicklook display:** the app currently shows only the L2A **GN** product
  quicklook (the others are filtered out — Forest Disturbance quicklooks in
  particular are published near-black). Each quicklook is placed on its bounding
  box and its black nodata padding is keyed to transparent so only the SAR swath
  shows. Colormap / vmin / vmax apply to the **downloaded COG tiles**, not to the
  static quicklook JPEGs.

---

## 8. Attribution & references

This tool is a client for third-party data and services. When you use, publish,
or redistribute anything obtained through it, you must honour the providers'
terms and attribution requirements:

- **ESA BIOMASS mission data** — © ESA / European Space Agency, distributed via
  the [MAAP](https://portal.maap.eo.esa.int) STAC catalog
  (<https://catalog.maap.eo.esa.int/catalogue/>). BIOMASS products are subject to
  ESA's data policy and terms of use; cite the mission and processing level when
  publishing results. Mission reference: ESA BIOMASS Earth Explorer (P-band SAR),
  <https://www.esa.int/Applications/Observing_the_Earth/FutureEO/Biomass>.
- **Basemap imagery** — Esri **World Imagery**: *Esri, Maxar, Earthstar
  Geographics, and the GIS User Community*
  (<https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9>).
  Subject to the Esri terms of use.
- **Geocoding** — [Nominatim](https://nominatim.org/) over
  [OpenStreetMap](https://www.openstreetmap.org/copyright) data,
  © OpenStreetMap contributors (ODbL). Respect the Nominatim usage policy.
- **Core libraries** — [MapLibre GL JS](https://maplibre.org/),
  [terra-draw](https://github.com/JamesLMilner/terra-draw),
  [rio-tiler](https://github.com/cogeotiff/rio-tiler),
  [rio-cogeo](https://github.com/cogeotiff/rio-cogeo),
  [rasterio](https://rasterio.readthedocs.io/) / GDAL,
  [pystac-client](https://github.com/stac-utils/pystac-client),
  [FastAPI](https://fastapi.tiangolo.com/), [React](https://react.dev/),
  [Vite](https://vite.dev/).

Suggested data citation (adapt to the products you use):

> BIOMASS Level-<n> products, European Space Agency (ESA), accessed <date> via
> the ESA MAAP catalogue (https://catalog.maap.eo.esa.int/catalogue/).

---

## 9. License

Application source code: **MIT** — see [`LICENSE`](./LICENSE). The MIT license
covers this app's code only, **not** the satellite data, basemap imagery, or
geocoding results, which remain under their providers' terms (see section 8).
