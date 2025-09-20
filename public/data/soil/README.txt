ISRIC SoilGrids v2.0 tile T36059 – manual assets
=================================================

This folder must contain the following GeoTIFFs before you run the app in live
mode:

- ORCDRC_M_sl1_T36059.tif  (organic carbon, 0–5 cm mean)
- PHIHOX_M_sl1_T36059.tif  (soil pH in water, 0–5 cm mean)
- BLD.f_M_sl1_T36059.tif   (bulk density, 0–5 cm mean)
- SNDPPT_M_sl1_T36059.tif  (sand fraction, 0–5 cm mean)
- CLYPPT_M_sl1_T36059.tif  (clay fraction, 0–5 cm mean)
- SLTPPT_M_sl1_T36059.tif  (silt fraction, 0–5 cm mean)
- TAXOUSDA_T36059.tif      (USDA soil taxonomy classes)

### Quick download (recommended)

```bash
npm run download:soil
```

This script pulls the tile directly from the official SoilGrids WCS endpoints
and saves the files into this directory.

### Manual download links

If you cannot run the helper script, download each file with `curl` (or by
pasting the link into a browser) and place it here using the exact filenames
above:

```bash
curl -L "https://maps.isric.org/mapserv?map=/mapfiles/soilgrids.map&SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=orcdrc_0-5cm_mean&SUBSETTINGCRS=EPSG:4326&SUBSET=Long(-122.00000928,-121.00000944)&SUBSET=Lat(37.999174566,38.999174406)&SCALESIZE=Long(480)&SCALESIZE=Lat(480)&FORMAT=GEOTIFF_FLOAT32" \
  -o ORCDRC_M_sl1_T36059.tif
curl -L "https://maps.isric.org/mapserv?map=/mapfiles/soilgrids.map&SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=phh2o_0-5cm_mean&SUBSETTINGCRS=EPSG:4326&SUBSET=Long(-122.00000928,-121.00000944)&SUBSET=Lat(37.999174566,38.999174406)&SCALESIZE=Long(480)&SCALESIZE=Lat(480)&FORMAT=GEOTIFF_FLOAT32" \
  -o PHIHOX_M_sl1_T36059.tif
curl -L "https://maps.isric.org/mapserv?map=/mapfiles/soilgrids.map&SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=bdod_0-5cm_mean&SUBSETTINGCRS=EPSG:4326&SUBSET=Long(-122.00000928,-121.00000944)&SUBSET=Lat(37.999174566,38.999174406)&SCALESIZE=Long(480)&SCALESIZE=Lat(480)&FORMAT=GEOTIFF_FLOAT32" \
  -o BLD.f_M_sl1_T36059.tif
curl -L "https://maps.isric.org/mapserv?map=/mapfiles/soilgrids.map&SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=sand_0-5cm_mean&SUBSETTINGCRS=EPSG:4326&SUBSET=Long(-122.00000928,-121.00000944)&SUBSET=Lat(37.999174566,38.999174406)&SCALESIZE=Long(480)&SCALESIZE=Lat(480)&FORMAT=GEOTIFF_FLOAT32" \
  -o SNDPPT_M_sl1_T36059.tif
curl -L "https://maps.isric.org/mapserv?map=/mapfiles/soilgrids.map&SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=clay_0-5cm_mean&SUBSETTINGCRS=EPSG:4326&SUBSET=Long(-122.00000928,-121.00000944)&SUBSET=Lat(37.999174566,38.999174406)&SCALESIZE=Long(480)&SCALESIZE=Lat(480)&FORMAT=GEOTIFF_FLOAT32" \
  -o CLYPPT_M_sl1_T36059.tif
curl -L "https://maps.isric.org/mapserv?map=/mapfiles/soilgrids.map&SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=silt_0-5cm_mean&SUBSETTINGCRS=EPSG:4326&SUBSET=Long(-122.00000928,-121.00000944)&SUBSET=Lat(37.999174566,38.999174406)&SCALESIZE=Long(480)&SCALESIZE=Lat(480)&FORMAT=GEOTIFF_FLOAT32" \
  -o SLTPPT_M_sl1_T36059.tif
curl -L "https://maps.isric.org/mapserv?map=/mapfiles/taxousda.map&SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=taxousda&SUBSETTINGCRS=EPSG:4326&SUBSET=Long(-122.00000928,-121.00000944)&SUBSET=Lat(37.999174566,38.999174406)&SCALESIZE=Long(480)&SCALESIZE=Lat(480)&FORMAT=GEOTIFF_INT16" \
  -o TAXOUSDA_T36059.tif
```

All services are operated by ISRIC (soilgrids.org) and published under the CC
BY 4.0 licence. The tile footprint matches the app bounds exactly, so the map
should immediately switch to live data once the files are in place.
