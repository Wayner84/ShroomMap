# ShroomMap – Liberty Cap Finder

ShroomMap is a simple interactive map that helps highlight the best areas for finding **Psilocybe semilanceata** (liberty caps).
It combines SoilGrids soil chemistry with USDA soil taxonomy classes to show how suitable the ground is, giving you a quick way to check new spots.

👉 Live data is driven by **ISRIC SoilGrids v2.0** tile **T36059** bundled locally, then displayed on top of OpenStreetMap with a smooth pan and zoom interface.

---

## ✨ Features

- Clean, responsive map with sidebar controls
- Suitability heatmap that updates live as you move around
- Uses SoilGrids properties + USDA taxonomy proxy to calculate “ideal / caution / poor” zones
- Weather overlay blends recent rainfall & temperature into the suitability map
- Runs all the heavy number-crunching in a web worker (keeps it fast and smooth)
- Offline “mock mode” for testing without internet
- Quick refresh button to reload data

---

## 🚀 Getting Started

### Requirements
- Node.js 18+
- npm 9+

### Install
```bash
npm install
```

### Fetch the SoilGrids tile

The repository does **not** ship the GeoTIFF rasters to keep the repo light. Download them once before running the app:

```bash
npm run download:soil
```

If that script is blocked by your network, follow the manual links listed in `public/data/soil/README.txt`.

### Run (Dev Server)
```bash
npm run dev
```
Runs on <http://localhost:5173>.

### Build for Production
```bash
npm run build
npm run preview
```

Outputs static files to `dist/` (can be hosted anywhere).

### Tests
```bash
npm test
```

> 💡 Running locally uses the commands above.
> For the live version, visit: [https://wayner84.github.io/ShroomMap/](https://wayner84.github.io/ShroomMap/)

---

## ⚙️ Config

You can override settings with a `.env.local` file (ignored by git).

| Variable | What it does | Default |
| --- | --- | --- |
| `VITE_SOIL_ORCDRC_URL` | Soil organic carbon GeoTIFF | `/data/soil/ORCDRC_M_sl1_T36059.tif` |
| `VITE_SOIL_PHH2O_URL` | Soil pH (water) GeoTIFF | `/data/soil/PHIHOX_M_sl1_T36059.tif` |
| `VITE_SOIL_BDOD_URL` | Soil bulk density GeoTIFF | `/data/soil/BLD.f_M_sl1_T36059.tif` |
| `VITE_SOIL_SAND_URL` | Soil sand fraction GeoTIFF | `/data/soil/SNDPPT_M_sl1_T36059.tif` |
| `VITE_SOIL_CLAY_URL` | Soil clay fraction GeoTIFF | `/data/soil/CLYPPT_M_sl1_T36059.tif` |
| `VITE_SOIL_SILT_URL` | Soil silt fraction GeoTIFF | `/data/soil/SLTPPT_M_sl1_T36059.tif` |
| `VITE_LANDCOVER_TAXONOMY_URL` | USDA taxonomy GeoTIFF | `/data/soil/TAXOUSDA_T36059.tif` |
| `VITE_USE_MOCK` | Use offline mock data | `false` |
| `VITE_ENABLE_WEATHER` | Toggle the weather overlay | `true` |
| `VITE_WEATHER_API_URL` | Weather summary API base | `https://api.open-meteo.com/v1/forecast` |

---

## 📊 Suitability Model

ShroomMap looks at:
- Soil pH (best around 6.0)
- Organic carbon % (3–6% is ideal)
- Soil texture (loamy mixes best, too sandy/clayey penalised)
- Bulk density as a moisture proxy

This is combined with land cover (grassland, heath, woodland edge = best) to give one of three categories:

- **Green** = good chance
- **Orange** = maybe, but needs rain/conditions
- **Red** = unlikely

---

## ⚠️ Notes

- Works best with a steady internet connection (downloads SoilGrids tiles and weather data on demand)
- Weather overlay uses recent rainfall + temperature to show when “needs rain” areas are primed
- Mock mode is for testing only, not real results

---

## ☕ Support the Project

If you find this useful and want to support development, you can
[**send me a coffee via PayPal**](https://www.paypal.com/paypalme/wayner84) ✨

---

## 📂 Project Structure

```
.
├── index.html
├── src/
│   ├── data/
│   ├── scoring/
│   ├── ui/
│   ├── workers/
│   └── main.ts
├── tests/
├── README.md
└── agents.md
```
