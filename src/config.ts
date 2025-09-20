export const USE_MOCK_DATA = (import.meta.env.VITE_USE_MOCK ?? 'false') === 'true';
export const ENABLE_WEATHER_OVERLAY = (import.meta.env.VITE_ENABLE_WEATHER ?? 'true') === 'true';

export const WEATHER_API_BASE =
  import.meta.env.VITE_WEATHER_API_URL ?? 'https://api.open-meteo.com/v1/forecast';

export const SAMPLE_GRID_SIZE = 64;
export const UPDATE_DEBOUNCE_MS = 320;
export const REQUEST_TIMEOUT_MS = 15000;

function buildStaticUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const trimmedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${trimmedBase}/${trimmedPath}`;
}

export type BoundingBox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export const ATTRIBUTION_TEXT =
  '© OpenStreetMap contributors | Soil: ISRIC SoilGrids v2.0 (tile T36059) | Land cover: SoilGrids USDA order proxy';

export const WORLDCOVER_RELEASE = 'Soil-derived land classes';

export const SOIL_PROPERTY_URLS = {
  orcdrc:
    import.meta.env.VITE_SOIL_ORCDRC_URL ??
    buildStaticUrl('data/soil/ORCDRC_M_sl1_T36059.tif'),
  phh2o:
    import.meta.env.VITE_SOIL_PHH2O_URL ??
    buildStaticUrl('data/soil/PHIHOX_M_sl1_T36059.tif'),
  bdod:
    import.meta.env.VITE_SOIL_BDOD_URL ??
    buildStaticUrl('data/soil/BLD.f_M_sl1_T36059.tif'),
  sand:
    import.meta.env.VITE_SOIL_SAND_URL ??
    buildStaticUrl('data/soil/SNDPPT_M_sl1_T36059.tif'),
  clay:
    import.meta.env.VITE_SOIL_CLAY_URL ??
    buildStaticUrl('data/soil/CLYPPT_M_sl1_T36059.tif'),
  silt:
    import.meta.env.VITE_SOIL_SILT_URL ??
    buildStaticUrl('data/soil/SLTPPT_M_sl1_T36059.tif')
} as const;

export const SOIL_DATA_EXTENT = {
  minLon: -122.00000928,
  minLat: 37.999174566,
  maxLon: -121.00000944,
  maxLat: 38.999174406
} as const;

export const LANDCOVER_TAXONOMY_URL =
  import.meta.env.VITE_LANDCOVER_TAXONOMY_URL ??
  buildStaticUrl('data/soil/TAXOUSDA_T36059.tif');

export const MAP_VIEW_BOUNDS = {
  minLon: -122.0,
  minLat: 38.0,
  maxLon: -121.0,
  maxLat: 38.9
} as const;

export const MAP_INITIAL_CENTER = { lat: 38.4, lon: -121.5 } as const;
export const MAP_INITIAL_ZOOM = 9;
