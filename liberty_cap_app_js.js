// app.js - Liberty Cap Habitat Suitability Map

class HabitatMap {
    constructor() {
        this.map = null;
        this.gridLayer = null;
        this.landcoverLayer = null;
        this.rainfallLayer = null;
        
        this.weights = {
            landcover: 0.30,
            ph: 0.25,
            drainage: 0.15,
            grazing: 0.10,
            terrain: 0.05,
            climate: 0.15
        };
        
        this.rainThresholds = {
            min: 8,
            max: 35
        };
        
        this.cellData = new Map();
        this.weatherData = new Map();
        
        this.isLoading = false;
        this.lastUpdate = null;
        
        this.init();
    }
    
    init() {
        this.setupMap();
        this.setupUI();
        this.loadDemoData();
        this.refreshData();
    }
    
    setupMap() {
        // Initialize map centered on UK
        this.map = L.map('map', {
            center: [54.5, -3],
            zoom: 6,
            zoomControl: true,
            attributionControl: true
        });
        
        // Add OpenStreetMap tiles with dark styling
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            className: 'dark-tiles'
        }).addTo(this.map);
        
        // Add layer control
        this.setupLayerControl();
    }
    
    setupLayerControl() {
        const baseLayers = {};
        const overlayLayers = {};
        
        // Initialize layer control (will be populated as layers are added)
        this.layerControl = L.control.layers(baseLayers, overlayLayers, {
            position: 'topright',
            collapsed: false
        }).addTo(this.map);
    }
    
    setupUI() {
        // Sidebar toggle
        document.getElementById('toggleSidebar').addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('collapsed');
            
            // Update button text
            const btn = document.getElementById('toggleSidebar');
            btn.textContent = sidebar.classList.contains('collapsed') ? '→' : '←';
            
            // Invalidate map size after transition
            setTimeout(() => this.map.invalidateSize(), 300);
        });
        
        // Refresh button
        document.getElementById('refreshData').addEventListener('click', () => {
            this.refreshData();
        });
        
        // Weight sliders
        Object.keys(this.weights).forEach(key => {
            const slider = document.getElementById(key + 'Weight');
            if (slider) {
                slider.addEventListener('input', (e) => {
                    this.weights[key] = parseFloat(e.target.value);
                    this.updateWeightDisplay(key, e.target.value);
                    this.debounceRecompute();
                });
            }
        });
        
        // Rain thresholds
        document.getElementById('minRain').addEventListener('input', (e) => {
            this.rainThresholds.min = parseFloat(e.target.value);
            this.debounceRecompute();
        });
        
        document.getElementById('maxRain').addEventListener('input', (e) => {
            this.rainThresholds.max = parseFloat(e.target.value);
            this.debounceRecompute();
        });
        
        // Layer toggles
        document.getElementById('showSuitability').addEventListener('change', (e) => {
            this.toggleLayer('suitability', e.target.checked);
        });
        
        document.getElementById('showLandcover').addEventListener('change', (e) => {
            this.toggleLayer('landcover', e.target.checked);
        });
        
        document.getElementById('showRainfall').addEventListener('change', (e) => {
            this.toggleLayer('rainfall', e.target.checked);
        });
        
        // Weather source
        document.getElementById('weatherSource').addEventListener('change', (e) => {
            const apiKeyControl = document.getElementById('apiKeyControl');
            if (e.target.value === 'met-office') {
                apiKeyControl.style.display = 'block';
            } else {
                apiKeyControl.style.display = 'none';
            }
        });
        
        this.recomputeTimeout = null;
    }
    
    updateWeightDisplay(key, value) {
        const display = document.querySelector(`#${key}Weight`).parentNode.querySelector('.weight-value');
        if (display) {
            display.textContent = parseFloat(value).toFixed(2);
        }
    }
    
    debounceRecompute() {
        if (this.recomputeTimeout) {
            clearTimeout(this.recomputeTimeout);
        }
        this.recomputeTimeout = setTimeout(() => {
            this.recomputeSuitability();
        }, 300);
    }
    
    loadDemoData() {
        // Load embedded demo data
        demoData.ukGrid.features.forEach(cell => {
            const id = cell.properties.id;
            
            // Find corresponding data from other datasets
            const landcoverData = demoData.landcover.features.find(f => f.properties.id === id);
            const soilData = demoData.soil.features.find(f => f.properties.id === id);
            const terrainData = demoData.terrain.features.find(f => f.properties.id === id);
            
            this.cellData.set(id, {
                geometry: cell.geometry,
                lat: cell.properties.lat,
                lng: cell.properties.lng,
                landcover: landcoverData?.properties || {},
                soil: soilData?.properties || {},
                terrain: terrainData?.properties || {}
            });
        });
        
        console.log(`Loaded ${this.cellData.size} grid cells`);
    }
    
    async refreshData() {
        if (this.isLoading) return;
        
        this.setLoading(true);
        this.updateStatus('Fetching weather data...');
        
        try {
            await this.fetchWeatherData();
            await this.recomputeSuitability();
            this.lastUpdate = new Date();
            this.updateStatus(`Updated: ${this.lastUpdate.toLocaleTimeString()} | Cells: ${this.cellData.size} | Source: Open-Meteo`);
        } catch (error) {
            console.error('Error refreshing data:', error);
            this.updateStatus('Error updating data - using demo mode');
            // Fallback to demo weather data
            this.generateDemoWeatherData();
            await this.recomputeSuitability();
        } finally {
            this.setLoading(false);
        }
    }
    
    async fetchWeatherData() {
        const source = document.getElementById('weatherSource').value;
        
        if (source === 'met-office') {
            const apiKey = document.getElementById('apiKey').value;
            if (!apiKey) {
                throw new Error('Met Office API key required');
            }
            await this.fetchMetOfficeData(apiKey);
        } else {
            await this.fetchOpenMeteoData();
        }
    }
    
    async fetchOpenMeteoData() {
        // Batch requests to avoid overwhelming the API
        const cells = Array.from(this.cellData.values());
        const batchSize = 10;
        
        for (let i = 0; i < cells.length; i += batchSize) {
            const batch = cells.slice(i, i + batchSize);
            
            // Build coordinates for batch request
            const coords = batch.map(cell => `${cell.lat},${cell.lng}`).join('|');
            
            try {
                const response = await fetch(
                    `https://api.open-meteo.com/v1/forecast?` +
                    `latitude=${batch.map(c => c.lat).join(',')}` +
                    `&longitude=${batch.map(c => c.lng).join(',')}` +
                    `&hourly=precipitation,temperature_2m` +
                    `&past_days=3` +
                    `&forecast_days=0` +
                    `&timezone=Europe/London`
                );
                
                if (response.ok) {
                    const data = await response.json();
                    this.processOpenMeteoData(data, batch);
                } else {
                    console.warn('Weather API request failed, using demo data');
                }
            } catch (error) {
                console.warn('Weather fetch error:', error);
            }
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Fill in missing data with demo values
        this.supplementWithDemoWeather();
    }
    
    processOpenMeteoData(data, cells) {
        // Process the response for each cell in the batch
        cells.forEach((cell, index) => {
            const cellId = this.getCellId(cell);
            
            if (data.hourly && data.hourly.precipitation) {
                // Calculate 72-hour precipitation sum
                const precipitation = data.hourly.precipitation;
                const last72Hours = precipitation.slice(-72); // Last 72 hours
                const rainfall72h = last72Hours.reduce((sum, val) => sum + (val || 0), 0);
                
                // Get temperature data
                const temperatures = data.hourly.temperature_2m;
                const tempLast72 = temperatures.slice(-72);
                const maxTemp = Math.max(...tempLast72.filter(t => t !== null));
                const minTemp = Math.min(...tempLast72.filter(t => t !== null));
                
                this.weatherData.set(cellId, {
                    rainfall_72h: rainfall72h,
                    temp_max: maxTemp,
                    temp_min: minTemp,
                    source: 'open-meteo'
                });
            }
        });
    }
    
    async fetchMetOfficeData(apiKey) {
        // Met Office API implementation would go here
        console.warn('Met Office API not implemented in demo - using demo data');
        this.generateDemoWeatherData();
    }
    
    generateDemoWeatherData() {
        // Generate realistic demo weather data
        this.cellData.forEach((cell, cellId) => {
            this.weatherData.set(cellId, {
                rainfall_72h: Math.random() * 45, // 0-45mm
                temp_max: 8 + Math.random() * 15, // 8-23°C
                temp_min: Math.random() * 12, // 0-12°C
                source: 'demo'
            });
        });
    }
    
    supplementWithDemoWeather() {
        this.cellData.forEach((cell, cellId) => {
            if (!this.weatherData.has(cellId)) {
                this.weatherData.set(cellId, {
                    rainfall_72h: Math.random() * 45,
                    temp_max: 8 + Math.random() * 15,
                    temp_min: Math.random() * 12,
                    source: 'demo'
                });
            }
        });
    }
    
    getCellId(cell) {
        // Find cell ID by coordinates (for reverse lookup)
        for (const [id, cellData] of this.cellData.entries()) {
            if (Math.abs(cellData.lat - cell.lat) < 0.001 && 
                Math.abs(cellData.lng - cell.lng) < 0.001) {
                return id;
            }
        }
        return null;
    }
    
    async recomputeSuitability() {
        this.updateStatus('Computing suitability scores...');
        
        const results = [];
        
        this.cellData.forEach((cell, cellId) => {
            const weather = this.weatherData.get(cellId) || {
                rainfall_72h: 15,
                temp_max: 12,
                temp_min: 4
            };
            
            const suitability = this.computeCellSuitability(cell, weather);
            results.push({
                cellId,
                cell,
                weather,
                suitability
            });
        });
        
        this.renderSuitabilityLayer(results);
        this.updateAverageScore(results);
    }
    
    computeCellSuitability(cell, weather) {
        // Land cover score (already computed in demo data)
        const landcoverScore = cell.landcover.landcover_score || 0;
        
        // Soil pH score using Gaussian curve centered at 5.5
        const pH = cell.soil.ph || 6.5;
        const phScore = Math.exp(-0.5 * Math.pow((pH - 5.5) / 1.0, 2));
        
        // Drainage score
        const drainage = cell.soil.drainage || 'moderate';
        const drainageScores = {
            'well': 1.0,
            'moderate': 0.8,
            'imperfect': 0.5,
            'poor': 0.2,
            'very_poor': 0.0
        };
        const drainScore = drainageScores[drainage] || 0.5;
        
        // Grazing/nutrients score (proxy from land cover)
        const landcoverType = cell.landcover.landcover || 'unknown';
        const grazeScores = {
            'rough_pasture': 0.9,
            'acid_grassland': 0.9,
            'heath': 0.8,
            'mixed_grass_shrub': 0.7,
            'improved_grassland': 0.5,
            'arable': 0.2,
            'urban': 0.1,
            'unknown': 0.5
        };
        const grazeScore = grazeScores[landcoverType] || 0.5;
        
        // Slope and aspect score
        const slope = cell.terrain.slope || 5;
        const aspect = cell.terrain.aspect || 180;
        
        let slopeScore;
        if (slope <= 15) {
            slopeScore = 1.0 - (slope / 15) * 0.4; // Linear from 1.0 to 0.6
        } else {
            slopeScore = 0.4;
        }
        
        // Aspect bonus for north (0±60°) and west (270±60°)
        let aspectBonus = 0;
        if ((aspect >= 300 || aspect <= 60) || (aspect >= 210 && aspect <= 330)) {
            aspectBonus = 0.05;
        }
        
        // Climate score based on recent temperatures
        const tempMax = weather.temp_max;
        const tempMin = weather.temp_min;
        
        let tmaxScore = 0;
        if (tempMax >= 8 && tempMax <= 18) {
            tmaxScore = tempMax === 12 ? 1.0 : 0.8;
        } else if (tempMax >= 5 && tempMax <= 22) {
            tmaxScore = 0.3;
        }
        
        let tminScore = 0;
        if (tempMin >= 0 && tempMin <= 10) {
            tminScore = tempMin === 6 ? 1.0 : 0.8;
        } else if (tempMin >= -3 && tempMin <= 14) {
            tminScore = 0.3;
        }
        
        const climateScore = (tmaxScore + tminScore) / 2;
        
        // Base suitability calculation
        const base = 
            this.weights.landcover * landcoverScore +
            this.weights.ph * phScore +
            this.weights.drainage * drainScore +
            this.weights.grazing * grazeScore +
            this.weights.terrain * (slopeScore + aspectBonus) +
            this.weights.climate * climateScore;
        
        // Rain bonus and penalties
        const rainfall72h = weather.rainfall_72h;
        let rainBonus = 0;
        let waterlogged = false;
        
        if (rainfall72h >= this.rainThresholds.min && rainfall72h <= this.rainThresholds.max) {
            rainBonus = 0.05;
        } else if (rainfall72h > this.rainThresholds.max) {
            waterlogged = true;
        }
        
        // Final suitability
        let final = Math.max(0, Math.min(1, base + rainBonus));
        
        if (waterlogged && drainScore < 0.8) {
            final = Math.min(final, 0.49); // Force red for waterlogged areas
        }
        
        // Color determination
        let color;
        if (final >= 0.70 && rainfall72h >= this.rainThresholds.min && rainfall72h <= this.rainThresholds.max) {
            color = '#4CAF50'; // Green - Ideal
        } else if (final >= 0.50 && rainfall72h < this.rainThresholds.min) {
            color = '#FF9800'; // Orange - Good base but not enough rain
        } else {
            color = '#F44336'; // Red - Not ideal
        }
        
        return {
            base,
            final,
            color,
            components: {
                landcover: landcoverScore,
                ph: phScore,
                drainage: drainScore,
                grazing: grazeScore,
                slope: slopeScore,
                aspect: aspectBonus,
                climate: climateScore
            },
            weather: {
                rainfall72h,
                tempMax,
                tempMin
            },
            waterlogged
        };
    }
    
    renderSuitabilityLayer(results) {
        // Remove existing layer
        if (this.gridLayer) {
            this.map.removeLayer(this.gridLayer);
        }
        
        const features = results.map(result => {
            return {
                type: 'Feature',
                geometry: result.cell.geometry,
                properties: {
                    ...result.suitability,
                    cellId: result.cellId
                }
            };
        });
        
        const geojsonData = {
            type: 'FeatureCollection',
            features
        };
        
        this.gridLayer = L.geoJSON(geojsonData, {
            style: (feature) => ({
                fillColor: feature.properties.color,
                weight: 1,
                opacity: 0.8,
                color: '#333',
                fillOpacity: 0.7
            }),
            onEachFeature: (feature, layer) => {
                this.bindPopup(layer, feature.properties);
                
                layer.on('mouseover', () => {
                    layer.setStyle({
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.9
                    });
                });
                
                layer.on('mouseout', () => {
                    layer.setStyle({
                        weight: 1,
                        opacity: 0.8,
                        fillOpacity: 0.7
                    });
                });
            }
        });
        
        // Add to map if suitability layer is enabled
        if (document.getElementById('showSuitability').checked) {
            this.gridLayer.addTo(this.map);
        }
        
        // Update layer control
        this.updateLayerControl();
    }
    
    bindPopup(layer, properties) {
        const rainfall = properties.weather.rainfall72h.toFixed(1);
        const tempMax = properties.weather.tempMax.toFixed(1);
        const tempMin = properties.weather.tempMin.toFixed(1);
        
        const popupContent = `
            <div style="font-size: 12px; line-height: 1.4;">
                <h4 style="margin: 0 0 10px 0; color: #a8d48a;">Habitat Suitability</h4>
                <p><strong>Final Score:</strong> ${properties.final.toFixed(3)}</p>
                <p><strong>Color:</strong> <span style="color: ${properties.color}">●</span></p>
                
                <h5 style="margin: 10px 0 5px 0;">Component Scores:</h5>
                <ul style="margin: 5px 0; padding-left: 15px;">
                    <li>Land Cover: ${properties.components.landcover.toFixed(3)}</li>
                    <li>Soil pH: ${properties.components.ph.toFixed(3)}</li>
                    <li>Drainage: ${properties.components.drainage.toFixed(3)}</li>
                    <li>Grazing: ${properties.components.grazing.toFixed(3)}</li>
                    <li>Terrain: ${(properties.components.slope + properties.components.aspect).toFixed(3)}</li>
                    <li>Climate: ${properties.components.climate.toFixed(3)}</li>
                </ul>
                
                <h5 style="margin: 10px 0 5px 0;">Recent Weather:</h5>
                <ul style="margin: 5px 0; padding-left: 15px;">
                    <li>Rainfall (72h): ${rainfall}mm</li>
                    <li>Max Temp: ${tempMax}°C</li>
                    <li>Min Temp: ${tempMin}°C</li>
                </ul>
                
                ${properties.waterlogged ? '<p style="color: #ff6b6b;"><strong>⚠ Waterlogged conditions</strong></p>' : ''}
            </div>
        `;
        
        layer.bindPopup(popupContent);
    }
    
    updateLayerControl() {
        // This could be expanded to manage overlay layers
        if (this.layerControl && this.gridLayer) {
            // Remove and re-add to update
            try {
                this.layerControl.removeLayer(this.gridLayer);
            } catch (e) {
                // Layer might not exist yet
            }
            this.layerControl.addOverlay(this.gridLayer, 'Suitability Grid');
        }
    }
    
    toggleLayer(layerType, show) {
        switch (layerType) {
            case 'suitability':
                if (this.gridLayer) {
                    if (show) {
                        this.map.addLayer(this.gridLayer);
                    } else {
                        this.map.removeLayer(this.gridLayer);
                    }
                }
                break;
            case 'landcover':
                // Placeholder for landcover layer
                console.log('Landcover layer toggle:', show);
                break;
            case 'rainfall':
                // Placeholder for rainfall heat layer
                console.log('Rainfall layer toggle:', show);
                break;
        }
    }
    
    updateAverageScore(results) {
        const avgScore = results.reduce((sum, r) => sum + r.suitability.final, 0) / results.length;
        const statusText = document.getElementById('statusText');
        const currentText = statusText.textContent;
        statusText.textContent = currentText.replace(/Avg score: \d+\.\d+/, `Avg score: ${avgScore.toFixed(3)}`);
    }
    
    setLoading(loading) {
        this.isLoading = loading;
        const spinner = document.getElementById('loadingSpinner');
        const button = document.getElementById('refreshData');
        
        if (loading) {
            spinner.classList.remove('hidden');
            button.style.opacity = '0.5';
            button.disabled = true;
        } else {
            spinner.classList.add('hidden');
            button.style.opacity = '1';
            button.disabled = false;
        }
    }
    
    updateStatus(message) {
        document.getElementById('statusText').textContent = message;
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new HabitatMap();
});