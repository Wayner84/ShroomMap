import 'leaflet/dist/leaflet.css';
import './style.css';

import L from 'leaflet';

import {
  ATTRIBUTION_TEXT,
  ENABLE_WEATHER_OVERLAY,
  SAMPLE_GRID_SIZE,
  UPDATE_DEBOUNCE_MS,
  USE_MOCK_DATA,
  type BoundingBox
} from './config';
import { SoilGridsClient } from './data/soilgrids';
import { WorldCoverClient } from './data/worldcover';
import { WeatherClient } from './data/weather';
import { mockSoilGrid } from './data/mock/soilgrids';
import { mockWorldCover } from './data/mock/worldcover';
import { debounce } from './utils/debounce';
import { isAbortError } from './utils/errors';
import type { LandCoverGrid, SoilGrid, SuitabilityWorkerOutput, WeatherGrid } from './types';
import { WeatherOverlay } from './types';
import SuitabilityWorker from './workers/suitabilityWorker?worker';

const app = document.getElementById('app');
if (!app) {
  throw new Error('App container missing');
}

app.innerHTML = `
  <aside class="sidebar" data-open="false">
    <header>
      <h1>ShroomMap</h1>
      <h2>UK Liberty Cap Suitability</h2>
    </header>
    <main>
      <section class="section">
        <h3>Data layers</h3>
        <div class="layer-toggle">
          <label>
            <input id="soil-layer-toggle" type="checkbox" checked />
            <span>Soil Data: SoilGrids (ISRIC)</span>
          </label>
        </div>
        <div class="layer-toggle">
          <label>
            <input id="land-layer-toggle" type="checkbox" checked />
            <span>Land Cover: ESA WorldCover</span>
          </label>
        </div>
      </section>
      <section class="section">
        <h3>Controls</h3>
        <div class="refresh-row">
          <button class="refresh-button" id="refresh-button">
            <span>Refresh suitability</span>
            <span class="spinner" id="refresh-spinner" hidden></span>
          </button>
        </div>
        <p id="status-message" class="status-message"></p>
      </section>
      <section class="section">
        <h3>Mode</h3>
        <p class="status-note">${USE_MOCK_DATA ? 'Mock data mode enabled' : 'Live data mode'}</p>
      </section>
    </main>
  </aside>
  <button class="sidebar-toggle" id="sidebar-toggle">Layers &amp; settings</button>
  <div class="map-container">
    <div id="map"></div>
    <canvas class="suitability-canvas" id="suitability-canvas"></canvas>
    <div class="status-panel" id="status-panel">
      <div class="status-chip" data-variant="ideal">
        <span class="dot"></span>
        <span><strong id="ideal-count">0</strong> ideal</span>
      </div>
      <div class="status-chip" data-variant="caution">
        <span class="dot"></span>
        <span><strong id="caution-count">0</strong> needs rain</span>
      </div>
      <div class="status-chip" data-variant="poor">
        <span class="dot"></span>
        <span><strong id="poor-count">0</strong> unsuitable</span>
      </div>
      <div class="status-chip average-indicator">
        <strong><span id="average-score">–</span></strong>
        <span id="sample-count">0 sampled cells</span>
      </div>
    </div>
  </div>
`;

const sidebar = document.querySelector<HTMLDivElement>('.sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

const SIDEBAR_TRANSITION_MS = 360;

sidebarToggle?.addEventListener('click', () => {
  const open = sidebar?.dataset.open === 'true';
  if (sidebar) {
    sidebar.dataset.open = open ? 'false' : 'true';
  }
});


const soilToggle = document.getElementById('soil-layer-toggle') as HTMLInputElement;
const landToggle = document.getElementById('land-layer-toggle') as HTMLInputElement;
const refreshButton = document.getElementById('refresh-button') as HTMLButtonElement;
const refreshSpinner = document.getElementById('refresh-spinner') as HTMLSpanElement;
const statusMessage = document.getElementById('status-message');
const statusNote = document.querySelector<HTMLParagraphElement>('.status-note');
const canvas = document.getElementById('suitability-canvas') as HTMLCanvasElement;
const averageScoreEl = document.getElementById('average-score');
const sampleCountEl = document.getElementById('sample-count');
const idealCountEl = document.getElementById('ideal-count');
const cautionCountEl = document.getElementById('caution-count');
const poorCountEl = document.getElementById('poor-count');

const MODE_LABELS = {
  live: 'Live data mode',
  fallback: 'Synthetic fallback active – live data temporarily unavailable.',
  mock: 'Mock data mode enabled'
} as const;

function updateModeNote({ fallbackActive }: { fallbackActive: boolean }) {
  if (!statusNote) {
    return;
  }

  if (USE_MOCK_DATA) {
    statusNote.textContent = MODE_LABELS.mock;
    statusNote.dataset.variant = 'mock';
    return;
  }

  if (fallbackActive) {
    statusNote.textContent = MODE_LABELS.fallback;
    statusNote.dataset.variant = 'fallback';
  } else {
    statusNote.textContent = MODE_LABELS.live;
    statusNote.dataset.variant = 'live';
  }
}

updateModeNote({ fallbackActive: false });

const map = L.map('map', {
  preferCanvas: true,
  minZoom: 5,
  maxZoom: 18,
  zoomControl: true,
  attributionControl: true
}).setView([54.5, -2.5], 6);

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap contributors'
});
osmLayer.addTo(map);

const soilClient = new SoilGridsClient();
const worldCoverClient = new WorldCoverClient();
const weatherClient = ENABLE_WEATHER_OVERLAY ? new WeatherClient() : null;

const soilDataLayer = L.tileLayer.wms('https://maps.isric.org/mapserv?map=/mapfiles/soilgrids.map', {
  layers: 'phh2o_0-5cm_mean',
  format: 'image/png',
  transparent: true,
  opacity: 0.55,
  attribution: 'SoilGrids v2.0 (ISRIC)'
});

const worldCoverLayer = L.tileLayer.wms('https://services.terrascope.be/wms/v2', {
  layers: 'WORLDCOVER_2021_MAP',
  format: 'image/png',
  transparent: true,
  opacity: 0.45,
  attribution: 'ESA WorldCover 10m'
});

const overlayControl = L.control.layers(undefined, {
  'Soil Data: SoilGrids (ISRIC)': soilDataLayer,
  [`Land Cover: ESA WorldCover (${worldCoverClient.releaseLabel})`]: worldCoverLayer
});
overlayControl.addTo(map);

map.attributionControl.setPrefix('');
map.attributionControl.addAttribution(`${ATTRIBUTION_TEXT} | ESA WorldCover ${worldCoverClient.releaseLabel}`);

soilToggle.addEventListener('change', () => {
  if (soilToggle.checked) {
    soilDataLayer.addTo(map);
  } else {
    map.removeLayer(soilDataLayer);
  }
});
landToggle.addEventListener('change', () => {
  if (landToggle.checked) {
    worldCoverLayer.addTo(map);
  } else {
    map.removeLayer(worldCoverLayer);
  }
});
soilDataLayer.addTo(map);
worldCoverLayer.addTo(map);

const worker = new SuitabilityWorker();

let lastRequestId = 0;
let lastCompletedRequest = 0;
let latestResult: SuitabilityWorkerOutput | null = null;
let latestSoil: SoilGrid | null = null;
let latestLand: LandCoverGrid | null = null;
let latestBBox: BoundingBox | null = null;
let latestWeather: WeatherGrid | null = null;
let lastDataWasSynthetic = false;

function isSuitabilityWorkerOutput(value: unknown): value is SuitabilityWorkerOutput {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SuitabilityWorkerOutput>;
  const counts = candidate.countsByCategory;
  const hasCounts =
    !!counts &&
    typeof counts.ideal === 'number' &&
    typeof counts.caution === 'number' &&
    typeof counts.poor === 'number';

  return (
    typeof candidate.requestId === 'number' &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    typeof candidate.sampleCount === 'number' &&
    typeof candidate.averageScore === 'number' &&
    candidate.categories instanceof Uint8Array &&
    candidate.scores instanceof Float32Array &&
    candidate.woodlandMask instanceof Uint8Array &&
    candidate.weatherMask instanceof Uint8Array &&
    hasCounts
  );
}

sidebarToggle?.addEventListener('click', () => {
  const open = sidebar?.dataset.open === 'true';
  if (sidebar) {
    sidebar.dataset.open = open ? 'false' : 'true';
  }
  window.setTimeout(() => {
    map.invalidateSize();
    if (latestResult) {
      drawSuitability(latestResult);
    }
  }, SIDEBAR_TRANSITION_MS);
});

window.addEventListener('resize', () => {
  map.invalidateSize();
});


function bboxAlmostEqual(a: BoundingBox | null, b: BoundingBox | null, epsilon = 1e-3) {
  if (!a || !b) {
    return false;
  }
  return (
    Math.abs(a.minLon - b.minLon) < epsilon &&
    Math.abs(a.minLat - b.minLat) < epsilon &&
    Math.abs(a.maxLon - b.maxLon) < epsilon &&
    Math.abs(a.maxLat - b.maxLat) < epsilon
  );
}

function cloneSoil(grid: SoilGrid): SoilGrid {
  return {
    width: grid.width,
    height: grid.height,
    units: { ...grid.units },
    data: {
      orcdrc: new Float32Array(grid.data.orcdrc),
      phh2o: new Float32Array(grid.data.phh2o),
      bdod: new Float32Array(grid.data.bdod),
      sand: new Float32Array(grid.data.sand),
      clay: new Float32Array(grid.data.clay),
      silt: new Float32Array(grid.data.silt)
    }
  };
}

function cloneLand(grid: LandCoverGrid): LandCoverGrid {
  return {
    width: grid.width,
    height: grid.height,
    codes: new Uint8Array(grid.codes)
  };
}

function cloneWeather(grid: WeatherGrid): WeatherGrid {
  return {
    width: grid.width,
    height: grid.height,
    precipitation: new Float32Array(grid.precipitation),
    temperature: new Float32Array(grid.temperature)
  };
}

type SoilFetchResult = { grid: SoilGrid; usedFallback: boolean };
type LandFetchResult = { grid: LandCoverGrid; usedFallback: boolean };

async function fetchSoilWithFallback(
  bbox: BoundingBox,
  width: number,
  height: number
): Promise<SoilFetchResult> {
  try {
    const grid = await soilClient.fetchGrid(bbox, width, height);
    return { grid, usedFallback: false };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    if (import.meta.env.DEV) {
      console.warn('Falling back to synthetic SoilGrids data', error);
    }
    return { grid: mockSoilGrid(width, height, bbox), usedFallback: true };
  }
}

async function fetchLandCoverWithFallback(
  bbox: BoundingBox,
  width: number,
  height: number
): Promise<LandFetchResult> {
  try {
    const grid = await worldCoverClient.fetchGrid(bbox, width, height);
    return { grid, usedFallback: false };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    if (import.meta.env.DEV) {
      console.warn('Falling back to synthetic WorldCover data', error);
    }
    return { grid: mockWorldCover(width, height, bbox), usedFallback: true };
  }
}

function setPending(isPending: boolean) {
  refreshButton.disabled = isPending;
  if (isPending) {
    refreshSpinner.hidden = false;
  } else {
    refreshSpinner.hidden = true;
  }
}

function toBoundingBox(bounds: L.LatLngBounds): BoundingBox {
  return {
    minLon: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLon: bounds.getEast(),
    maxLat: bounds.getNorth()
  };
}

function drawSuitability(result: SuitabilityWorkerOutput) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const size = map.getSize();
  canvas.width = size.x;
  canvas.height = size.y;

  const offscreen = document.createElement('canvas');
  offscreen.width = result.width;
  offscreen.height = result.height;
  const offscreenCtx = offscreen.getContext('2d');
  if (!offscreenCtx) {
    return;
  }
  const imageData = offscreenCtx.createImageData(result.width, result.height);
  const blendColor = (
    base: [number, number, number, number],
    overlay: [number, number, number],
    factor: number
  ): [number, number, number, number] => {
    const mix = (from: number, to: number) => Math.round(from * (1 - factor) + to * factor);
    return [mix(base[0], overlay[0]), mix(base[1], overlay[1]), mix(base[2], overlay[2]), base[3]];
  };
  for (let idx = 0; idx < result.categories.length; idx += 1) {
    const category = result.categories[idx];
    const baseIndex = idx * 4;
    const isWoodland = result.woodlandMask[idx] === 1;
    const weatherState = result.weatherMask[idx] ?? WeatherOverlay.Neutral;
    let color: [number, number, number, number];
    if (category === 2) {
      color = [31, 191, 104, 170];
    } else if (category === 1) {

      color = isWoodland ? [9, 59, 33, 230] : [255, 183, 77, 200];

    } else {
      color = [255, 90, 95, 210];
    }

    if (weatherState === WeatherOverlay.Dry) {
      color = blendColor(color, [255, 220, 120], 0.45);
    } else if (weatherState === WeatherOverlay.Favourable) {
      color = blendColor(color, [64, 156, 255], 0.4);
    }
    imageData.data[baseIndex] = color[0];
    imageData.data[baseIndex + 1] = color[1];
    imageData.data[baseIndex + 2] = color[2];
    imageData.data[baseIndex + 3] = color[3];
  }
  offscreenCtx.putImageData(imageData, 0, 0);

  const northWest = map.latLngToContainerPoint([result.bbox.maxLat, result.bbox.minLon]);
  const southEast = map.latLngToContainerPoint([result.bbox.minLat, result.bbox.maxLon]);
  const width = southEast.x - northWest.x;
  const height = southEast.y - northWest.y;

  requestAnimationFrame(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.75;
    ctx.drawImage(offscreen, northWest.x, northWest.y, width, height);
    ctx.globalAlpha = 1;
  });
}

function updateStats(result: SuitabilityWorkerOutput) {
  if (averageScoreEl) {
    averageScoreEl.textContent =
      result.sampleCount > 0 ? result.averageScore.toFixed(1) : '–';
  }
  if (sampleCountEl) {
    const formattedCount = result.sampleCount.toLocaleString();
    const suffix = result.sampleCount === 1 ? 'sampled cell' : 'sampled cells';
    sampleCountEl.textContent = `${formattedCount} ${suffix}`;
  }
  if (idealCountEl) {
    idealCountEl.textContent = `${result.countsByCategory.ideal.toLocaleString()}`;
  }
  if (cautionCountEl) {
    cautionCountEl.textContent = `${result.countsByCategory.caution.toLocaleString()}`;
  }
  if (poorCountEl) {
    poorCountEl.textContent = `${result.countsByCategory.poor.toLocaleString()}`;
  }
}

function handleWorkerResult(result: SuitabilityWorkerOutput) {
  if (result.requestId < lastCompletedRequest) {
    return;
  }
  lastCompletedRequest = result.requestId;
  latestResult = result;
  updateStats(result);
  try {
    drawSuitability(result);
  } catch (error) {
    console.error('Failed to draw suitability overlay', error);
  } finally {
    setPending(false);
  }
}

worker.onmessage = (event: MessageEvent<unknown>) => {
  if (!isSuitabilityWorkerOutput(event.data)) {
    if (import.meta.env.DEV) {
      console.warn('Ignoring unexpected worker message', event.data);
    }
    return;
  }
  handleWorkerResult(event.data);
};

function handleError(error: unknown) {
  if (isAbortError(error)) {
    return;
  }
  console.error(error);
  if (statusMessage) {
    statusMessage.textContent = error instanceof Error ? error.message : 'Failed to update suitability.';
  }
  setPending(false);
}

async function requestUpdate({ forceFromCache = false } = {}) {
  const bounds = map.getBounds();
  const bbox = toBoundingBox(bounds);
  const requestId = ++lastRequestId;
  setPending(true);
  if (statusMessage) {
    statusMessage.textContent = '';
  }

  const wantWeather = ENABLE_WEATHER_OVERLAY && weatherClient !== null;

  if (forceFromCache && latestSoil && latestLand && bboxAlmostEqual(latestBBox, bbox)) {
    const cachedWeather = wantWeather && latestWeather ? cloneWeather(latestWeather) : null;
    if (statusMessage) {
      statusMessage.textContent = lastDataWasSynthetic
        ? 'Live map layers unavailable – showing synthetic suitability data.'
        : '';
    }
    updateModeNote({ fallbackActive: lastDataWasSynthetic });
    worker.postMessage({
      soil: cloneSoil(latestSoil),
      landCover: cloneLand(latestLand),
      weather: cachedWeather ?? undefined,
      bbox: { ...latestBBox! },
      requestId,
      config: { includeWeather: !!cachedWeather }
    });
    return;
  }

  soilClient.cancelPending();
  worldCoverClient.cancelPending();
  weatherClient?.cancelPending();

  const width = SAMPLE_GRID_SIZE;
  const height = SAMPLE_GRID_SIZE;

  try {
    const weatherPromise: Promise<WeatherGrid | null> =
      wantWeather && weatherClient
        ? weatherClient
            .fetchGrid(bbox, width, height)
            .then((grid) => grid)
            .catch((error) => {
              if (isAbortError(error)) {
                throw error;
              }
              if (import.meta.env.DEV) {
                console.warn('Weather overlay unavailable', error);
              }
              return null;
            })
        : Promise.resolve<WeatherGrid | null>(null);

    const [soilResult, landResult, weatherGrid] = await Promise.all([
      fetchSoilWithFallback(bbox, width, height),
      fetchLandCoverWithFallback(bbox, width, height),
      weatherPromise
    ]);

    const soilGrid = soilResult.grid;
    const landCoverGrid = landResult.grid;
    const usedSynthetic = soilResult.usedFallback || landResult.usedFallback;

    lastDataWasSynthetic = usedSynthetic;
    updateModeNote({ fallbackActive: usedSynthetic });
    if (statusMessage) {
      statusMessage.textContent = usedSynthetic
        ? 'Live map layers unavailable – showing synthetic suitability data.'
        : '';
    }

    latestSoil = cloneSoil(soilGrid);
    latestLand = cloneLand(landCoverGrid);
    latestBBox = { ...bbox };
    latestWeather = weatherGrid ? cloneWeather(weatherGrid) : null;

    worker.postMessage({
      soil: cloneSoil(soilGrid),
      landCover: cloneLand(landCoverGrid),
      weather: weatherGrid ? cloneWeather(weatherGrid) : undefined,
      bbox: { ...bbox },
      requestId,
      config: { includeWeather: !!weatherGrid }
    });
  } catch (error) {
    handleError(error);
  }
}

const debouncedUpdate = debounce(() => {
  requestUpdate().catch(handleError);
}, UPDATE_DEBOUNCE_MS);

map.on('moveend', () => debouncedUpdate());
map.on('zoomend', () => debouncedUpdate());
map.on('resize', () => {
  if (latestResult) {
    drawSuitability(latestResult);
  }
});

refreshButton.addEventListener('click', () => {
  requestUpdate({ forceFromCache: true }).catch(handleError);
});

requestUpdate().catch(handleError);
