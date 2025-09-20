export const SOILGRIDS_WCS_BASE =
  import.meta.env.VITE_SOILGRIDS_WCS_URL ??
  'https://maps.isric.org/mapserv?map=/mapfiles/soilgrids.map';

export const WORLDCOVER_WCS_BASE =
  import.meta.env.VITE_WORLDCOVER_WCS_URL ??
  'https://services.terrascope.be/wcs/v2';

export const USE_MOCK_DATA = (import.meta.env.VITE_USE_MOCK ?? 'false') === 'true';
export const ENABLE_WEATHER_OVERLAY = (import.meta.env.VITE_ENABLE_WEATHER ?? 'true') === 'true';

export const WEATHER_API_BASE =
  import.meta.env.VITE_WEATHER_API_URL ?? 'https://api.open-meteo.com/v1/forecast';

export const SAMPLE_GRID_SIZE = 64;
export const UPDATE_DEBOUNCE_MS = 320;
export const REQUEST_TIMEOUT_MS = 15000;

export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 500;

export type BoundingBox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export const DEFAULT_DEPTH = '0-5cm';

export const ATTRIBUTION_TEXT =
  '© OpenStreetMap contributors | Soil: ISRIC SoilGrids v2.0 | Land cover: ESA WorldCover';

export const WORLDCOVER_RELEASE = '2021 v200';
