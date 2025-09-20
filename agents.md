# Agents and background workers

ShroomMap uses lightweight, browser-native agents to keep the UI responsive while fetching and crunching raster data.

## Data-fetch agents

### SoilGrids client (`src/data/soilgrids.ts`)

- **Role:** Query ISRIC SoilGrids WCS coverages for the current viewport.
- **Inputs:** `BoundingBox`, desired pixel width/height (defaults to `SAMPLE_GRID_SIZE`).
- **Outputs:** `SoilGrid` object containing six Float32 rasters (`orcdrc`, `phh2o`, `bdod`, `sand`, `clay`, `silt`).
- **Caching:** 30 minute TTL keyed by quantised bounding box + resolution. Each request dedupes in-flight promises and exposes an `abort()` hook.
- **Retry/backoff:** Retries up to three times on HTTP 429/5xx with exponential delays (500 ms base).

### WorldCover client (`src/data/worldcover.ts`)

- **Role:** Fetch ESA WorldCover classification raster for the viewport.
- **Inputs/Outputs:** Same interface as the SoilGrids client but returns a single `Uint8Array` of class codes.
- **Caching & retry:** Mirrors the SoilGrids client strategy so both data sources stay in sync.

Both adapters honour `VITE_USE_MOCK`; when enabled they use deterministic mock rasters from `src/data/mock/` instead of hitting the network.

## Computation agent – suitability worker (`src/workers/suitabilityWorker.ts`)

- **Type:** Dedicated Web Worker spawned via Vite (`?worker`).
- **Inputs:**
  - `requestId` – monotonically increasing ID to correlate responses.
  - `soil` – `SoilGrid` typed arrays.
  - `landCover` – `LandCoverGrid` typed array.
  - `bbox` – viewport bounding box (for reprojection when painting on the main thread).
  - `config.includeWeather` – reserved flag (currently `false`, keeps interface forward-compatible).
- **Processing:**
  1. Derives land-cover suitability classes (ideal/caution/poor) using ESA codes and woodland-edge promotion.
  2. Computes soil component scores (pH, organic carbon, texture, moisture proxy) and a weighted overall score per cell.
  3. Maps overall score + land class into UI categories (green/orange/red) and aggregates counts and a streaming average.
- **Outputs:** `SuitabilityWorkerOutput` containing:
  - `Float32Array` of scores, `Uint8Array` of category IDs.
  - Running average, sampled cell count, per-category counts.
  - Echoed `bbox` + `requestId` for the main thread.
- **Transfer:** Uses `postMessage` with transferable buffers for the large arrays to minimise copy costs.

## Coordination sequence

```
User pans map
└─▶ Main thread debounces moveend (320 ms)
    └─▶ Cancels any inflight SoilGrids/WorldCover requests
        ├─▶ SoilGrids client fetches/returns coverage (cached if possible)
        ├─▶ WorldCover client fetches/returns coverage (cached if possible)
        └─▶ Main thread clones rasters & posts message to worker
             └─▶ Worker computes soil + land scores
                  └─▶ Worker posts SuitabilityWorkerOutput back
                       └─▶ Main thread draws canvas overlay & updates stats
```

## Error handling & resilience

- In-flight cancellation prevents stale tiles from consuming rate limits during rapid pans.
- On fetch failure the sidebar shows the error and the spinner stops; cached data remain available for soft refresh.
- The soft “Refresh suitability” button simply replays the most recently cached rasters, guaranteeing instant feedback while background caches repopulate.

## Extending agents

- **Weather overlay:** Toggle `config.includeWeather` and extend the worker to consume rain/temperature rasters without touching the UI.
- **Additional layers:** Implement a new data adapter that conforms to the same cache/dedupe interface and pass its rasters alongside the existing inputs. The worker pipeline already supports combining multiple typed arrays per cell.
