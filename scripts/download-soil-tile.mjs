#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public', 'data', 'soil');

const TILE_ID = 'T36059';
const BBOX = {
  minLon: -122.00000928,
  minLat: 37.999174566,
  maxLon: -121.00000944,
  maxLat: 38.999174406
};
const SIZE = { width: 480, height: 480 };

const SOIL_WCS_BASE = 'https://maps.isric.org/mapserv?map=/mapfiles/soilgrids.map';
const TAXO_WCS_BASE = 'https://maps.isric.org/mapserv?map=/mapfiles/taxousda.map';

const DOWNLOADS = [
  {
    label: 'Organic carbon (orcdrc)',
    coverageId: 'orcdrc_0-5cm_mean',
    format: 'GEOTIFF_FLOAT32',
    filename: 'ORCDRC_M_sl1_T36059.tif',
    baseUrl: SOIL_WCS_BASE
  },
  {
    label: 'Soil pH in water (phh2o)',
    coverageId: 'phh2o_0-5cm_mean',
    format: 'GEOTIFF_FLOAT32',
    filename: 'PHIHOX_M_sl1_T36059.tif',
    baseUrl: SOIL_WCS_BASE
  },
  {
    label: 'Bulk density (bdod)',
    coverageId: 'bdod_0-5cm_mean',
    format: 'GEOTIFF_FLOAT32',
    filename: 'BLD.f_M_sl1_T36059.tif',
    baseUrl: SOIL_WCS_BASE
  },
  {
    label: 'Sand fraction (sand)',
    coverageId: 'sand_0-5cm_mean',
    format: 'GEOTIFF_FLOAT32',
    filename: 'SNDPPT_M_sl1_T36059.tif',
    baseUrl: SOIL_WCS_BASE
  },
  {
    label: 'Clay fraction (clay)',
    coverageId: 'clay_0-5cm_mean',
    format: 'GEOTIFF_FLOAT32',
    filename: 'CLYPPT_M_sl1_T36059.tif',
    baseUrl: SOIL_WCS_BASE
  },
  {
    label: 'Silt fraction (silt)',
    coverageId: 'silt_0-5cm_mean',
    format: 'GEOTIFF_FLOAT32',
    filename: 'SLTPPT_M_sl1_T36059.tif',
    baseUrl: SOIL_WCS_BASE
  },
  {
    label: 'USDA taxonomy (taxousda)',
    coverageId: 'taxousda',
    format: 'GEOTIFF_INT16',
    filename: 'TAXOUSDA_T36059.tif',
    baseUrl: TAXO_WCS_BASE
  }
];

function buildWcsUrl({ baseUrl, coverageId, format }) {
  const params = new URLSearchParams({
    SERVICE: 'WCS',
    REQUEST: 'GetCoverage',
    VERSION: '2.0.1',
    COVERAGEID: coverageId,
    FORMAT: format,
    SUBSETTINGCRS: 'EPSG:4326'
  });
  params.append('SUBSET', `Long(${BBOX.minLon},${BBOX.maxLon})`);
  params.append('SUBSET', `Lat(${BBOX.minLat},${BBOX.maxLat})`);
  params.append('SCALESIZE', `Long(${SIZE.width})`);
  params.append('SCALESIZE', `Lat(${SIZE.height})`);
  return `${baseUrl}&${params.toString()}`;
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

await mkdir(outputDir, { recursive: true });

console.log(`Downloading SoilGrids tile ${TILE_ID} into ${path.relative(projectRoot, outputDir)}`);

try {
  for (const download of DOWNLOADS) {
    const url = buildWcsUrl(download);
    const destination = path.join(outputDir, download.filename);
    process.stdout.write(`→ ${download.filename} (${download.label})... `);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) {
        throw new Error('Empty response');
      }
      await writeFile(destination, buffer);
      console.log('done');
    } catch (error) {
      clearTimeout(timeout);
      console.log('failed');
      throw new Error(`${download.filename}: ${formatError(error)}`);
    }
  }

  console.log('\nAll rasters saved. You can now run the app in live mode.');
} catch (error) {
  console.error(`\nDownload failed: ${formatError(error)}`);
  console.error('The tile may still be partially downloaded. Remove any incomplete files before retrying.');
  process.exit(1);
}
