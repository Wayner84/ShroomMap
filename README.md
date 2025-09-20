# ShroomMap – UK Liberty Cap Suitability

ShroomMap is a pan-and-zoom web map that highlights UK locations with soils and land cover most favourable for **Psilocybe semilanceata** (liberty caps). The application overlays live suitability scoring on top of OpenStreetMap, powered by ISRIC SoilGrids v2.0 soil properties and ESA WorldCover 10 m land-cover classifications.

## Features

- **Responsive map UX** with Leaflet, custom sidebar controls, and an animated suitability heatmap that follows the viewport.
- **Live data adapters** for SoilGrids WCS coverages and ESA WorldCover WCS tiles, including request deduplication, retry with backoff, and in-memory caching.
- **Web Worker pipeline** that keeps raster maths off the main thread and streams back per-cell suitability, categorical buckets, and viewport statistics without janking the UI.
- **Mock mode** for offline development and automated testing using deterministic synthetic rasters.
- **Soft refresh** button that re-renders the last fetched tiles immediately while longer network refreshes happen opportunistically in the background cache.

## Project structure

```
.
├── index.html             # Vite entry point
├── src/
│   ├── data/              # Data source adapters and caches
│   ├── scoring/           # Pure scoring and masking utilities + tests
│   ├── ui/                # UI helpers (future expansion)
│   ├── workers/           # Suitability computation worker
│   └── main.ts            # App bootstrapper
├── tests/                 # Vitest unit tests for scoring logic
├── README.md
└── agents.md
```

## Getting started

### Prerequisites

- Node.js 18 or later
- npm 9 (ships with Node 18)

### Install dependencies

```bash
npm install
```

> **Note:** The default npm registry (`https://registry.npmjs.org`) must be reachable. If you are behind a proxy, export `HTTPS_PROXY`/`https_proxy` or set `npm config set proxy`/`https-proxy` accordingly.

### Run the dev server

```bash
npm run dev
```

This launches Vite on <http://localhost:5173>. The map boots in approximately two seconds on broadband when live endpoints are reachable.

### Build and preview

```bash
npm run build
npm run preview
```

The production build emits static assets under `dist/` which can be hosted on any static web server.

### Tests

Vitest covers the core suitability maths (pH response curve, texture penalties, land-cover masking, and streaming averages).

```bash
npm test
```

## Configuration

All runtime configuration is driven by Vite environment variables. Create a `.env.local` (ignored by git) to override defaults.

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_SOILGRIDS_WCS_URL` | Base WCS endpoint for SoilGrids coverages | `https://maps.isric.org/mapserv?map=/mapfiles/soilgrids.map` |
| `VITE_WORLDCOVER_WCS_URL` | Base WCS endpoint for ESA WorldCover | `https://services.terrascope.be/wcs/v2` |
| `VITE_USE_MOCK` | When set to `true`, serves deterministic mock rasters for offline mode | `false` |

### Switching to mock mode

Set `VITE_USE_MOCK=true` (or `npm run dev -- --mode mock`) to run with local synthetic rasters. The UI, worker, and stats stay identical, enabling rapid unit/integration testing without live network access.

## Data sources

| Source | Endpoint type | Layers/variables |
| --- | --- | --- |
| **ISRIC SoilGrids v2.0** | WCS 2.0.1 | `orcdrc`, `phh2o`, `bdod`, `sand`, `clay`, `silt` (topsoil `0-5cm` mean) |
| **ESA WorldCover 10 m** | WCS 2.0.1 | `urn:cgls:worldcover:v200:2021` (class IDs) |

Adapters normalise the differing pixel payloads into typed arrays, cache successful responses for 30 minutes, and expose a `cancelPending()` hook so the map can abort inflight tiles during rapid pans. HTTP 429/5xx responses trigger exponential backoff (500 ms base) before retrying.

Both adapters down-sample coverages to a configurable grid (`SAMPLE_GRID_SIZE`, default 64×64 per viewport) before any CPU-heavy computation, ensuring we only process what is visible.

## Suitability model

The worker combines soil and land-cover signals into three user-facing buckets (green/ideal, orange/caution, red/unfavourable). The soil score is a weighted blend of four components, each returning a 0–100 score:

| Component | Input | Rationale | Weight |
| --- | --- | --- | --- |
| pH response | SoilGrids `phh2o` | Gaussian peak at 6.0 with σ = 0.6 (sweet spot for liberty caps) | 0.32 |
| Organic carbon | SoilGrids `orcdrc` | Triangular plateau between 3–6 % organic matter, penalises extremes | 0.22 |
| Texture balance | SoilGrids `sand`/`clay`/`silt` | Penalises very sandy (>70 %) or heavy clay (>45 %) mixes, rewards loams (~45 % sand, 25 % clay) | 0.28 |
| Moisture proxy | SoilGrids `bdod` | Prefers moderate bulk density (1.05–1.35 g/cm³) as a simple moisture indicator | 0.18 |

Overall soil suitability is the weighted average of the available components (weights renormalise if a component is missing). Land cover is classified via ESA WorldCover codes:

- **Ideal:** grassland (30), shrubland/heath (20), moss & lichen (100), and woodland fringe pixels (class 10) bordering an ideal clearing.
- **Caution:** woodland away from edges, wetlands (90/95), mangroves (95), or otherwise ambiguous natural cover.
- **Poor:** cropland (40), built-up (50), bare ground (60), snow/ice (70), permanent water (80).

Category mapping:

- Ideal land class + soil score ≥ 70 ⇒ **Green**.
- Ideal land class + soil score 45–70 ⇒ **Orange** (needs recent rain or warmth).
- Woodland/wetland caution class requires soil ≥ 75 to reach green, otherwise orange when ≥ 45.
- Anything else ⇒ **Red**.

The worker streams back a running average across sampled cells (`RunningAverage`), the total cell count, and per-category counts. The sidebar chips display those metrics instantly after every pan/zoom without blocking the UI thread.

## Refresh, caching, and rate limiting

- Viewport changes debounce recomputation by 320 ms (`UPDATE_DEBOUNCE_MS`).
- Repeated pans within the same ~0.01° bounding box reuse cached tiles (quantised cache keys), dramatically cutting API calls.
- The refresh button performs a **soft refresh**, re-rendering the most recent cached rasters immediately. A new network fetch is triggered only when the viewport changes or cached tiles expire.
- Soil and land-cover requests share an abortable in-flight map. Quick pans call `cancelPending()` so redundant requests are aborted before consuming rate limits.
- 429/5xx responses back off exponentially (500 ms, 1 s, 2 s) before failing.

## Updating endpoints

- **SoilGrids:** Update `VITE_SOILGRIDS_WCS_URL` if ISRIC revises their WCS host. Coverage IDs follow the pattern `${property}_${depth}_mean`; adjust `DEFAULT_DEPTH` in `src/config.ts` if you need deeper layers.
- **WorldCover:** Set `VITE_WORLDCOVER_WCS_URL` to point at the latest release and update `WORLDCOVER_RELEASE` in `src/config.ts` for UI labelling. If ESA changes the coverage ID, adjust `COVERAGE_ID` in `src/data/worldcover.ts`.

## Known limitations

- The default WCS endpoints rely on third-party CORS support; self-host a proxy if the browser is blocked by corporate firewalls.
- Bulk-density-as-moisture is a coarse proxy and does not replace live rainfall data. Weather overlays are feature-flagged off but the structure remains for future integration.
- The worker currently assumes soil and land-cover rasters share identical grid sizes. If a provider changes resolution dramatically, consider adding on-the-fly resampling.
- Offline mock mode is deterministic but not geospatially accurate—it is purely for UI/UX testing.

## Manual acceptance checklist

1. Load the app; tiles and suitability heatmap appear within ~2 s on broadband.
2. Pan/zoom; the UI stays responsive, and the average score updates ~0.5 s after the map settles.
3. Toggle the “Soil Data” or “Land Cover” checkboxes; corresponding WMS overlays hide/show without console errors.
4. Switch to mock mode or throttle the network: cached tiles continue to render (soft refresh) and no unhandled promise rejections occur.
5. Confirm the bottom-right disclaimer from the legacy build is gone—the status panel now shows live averages and sample counts instead.
