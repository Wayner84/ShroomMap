# ShroomMap – Liberty Cap Finder (UK)

ShroomMap is a simple interactive map that helps highlight the best areas in the UK for finding **Psilocybe semilanceata** (liberty caps).  
It combines soil and land cover data to show how suitable the ground is, giving you a quick way to check new spots.  

👉 Live data is pulled from **ISRIC SoilGrids v2.0** and **ESA WorldCover 10m**, then displayed on top of OpenStreetMap with a smooth pan and zoom interface.

---

## ✨ Features

- Clean, responsive map with sidebar controls
- Suitability heatmap that updates live as you move around
- Uses SoilGrids + WorldCover to calculate “ideal / caution / poor” zones
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
| `VITE_SOILGRIDS_WCS_URL` | SoilGrids endpoint | `https://maps.isric.org/...` |
| `VITE_WORLDCOVER_WCS_URL` | WorldCover endpoint | `https://services.terrascope.be/...` |
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

- Works best with a steady internet connection (pulls data live)  
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
