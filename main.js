// Configuração dos Mapas Base
const basemaps = {
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }),
    light: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    })
};

// Inicialização do Mapa
const map = L.map('map', {
    center: [-22.9, -43.2], // Coordenadas temporárias, faremos fitBounds depois
    zoom: 9,
    layers: [basemaps.dark],
    zoomControl: false // Customizaremos a posição do zoom
});

// Move zoom control para a direita
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Armazena as camadas carregadas
const loadedLayers = {};

// Controle do indicador de carregamento
const loadingIndicator = document.getElementById('loading');
let loadingCount = 0;

function showLoading() {
    loadingCount++;
    loadingIndicator.classList.add('active');
}

function hideLoading() {
    loadingCount--;
    if (loadingCount <= 0) {
        loadingCount = 0;
        loadingIndicator.classList.remove('active');
    }
}

// Troca de Mapa Base
document.querySelectorAll('input[name="basemap"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        // Remove todos os basemaps atuais
        Object.values(basemaps).forEach(layer => map.removeLayer(layer));
        // Adiciona o selecionado
        basemaps[e.target.value].addTo(map);
    });
});

// Paletas de cores para os rasters usando chroma.js
const colorScales = {
    dem: chroma.scale('Spectral').domain([1000, 0]), // Inverte para altitudes mais altas serem vermelhas/marrons
    deforest: chroma.scale(['#f4f4f5', '#ef4444']).domain([0, 1]) // 0: nada, 1: desmatado
};

// Helper para converter base64 em ArrayBuffer para o TIF
function base64ToArrayBuffer(base64) {
    var binary_string = window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

// Carregar camada GeoJSON
async function loadGeoJSON(filename, color) {
    showLoading();
    try {
        const data = window.GeoportalData[filename];
        if (!data) throw new Error("Dados da camada não encontrados no banco embutido: " + filename);
        
        const layer = L.geoJSON(data, {
            style: function (feature) {
                return {
                    color: color,
                    weight: 2,
                    opacity: 0.8,
                    fillOpacity: 0.2
                };
            },
            onEachFeature: function (feature, layer) {
                // Adiciona tooltip/popup simples se houver propriedades
                if (feature.properties) {
                    let popupContent = '<div style="font-family: Inter, sans-serif; font-size: 13px;">';
                    for (const key in feature.properties) {
                        popupContent += `<strong>${key}:</strong> ${feature.properties[key]}<br/>`;
                    }
                    popupContent += '</div>';
                    layer.bindPopup(popupContent);
                }
            }
        });
        
        hideLoading();
        return layer;
    } catch (error) {
        console.error("Erro ao carregar GeoJSON:", error);
        hideLoading();
        alert("Erro ao carregar o arquivo " + filename + ". Ele não foi encontrado na base de dados gerada.");
        return null;
    }
}

// Carregar camada Raster (TIF)
async function loadRaster(filename, cmap) {
    showLoading();
    try {
        const b64 = window.GeoportalData[filename];
        if (!b64) throw new Error("Dados Raster não encontrados no banco embutido: " + filename);
        
        const arrayBuffer = base64ToArrayBuffer(b64);
        
        const georaster = await parseGeoraster(arrayBuffer);
        
        // Determinar min e max dinamicamente se necessário
        const min = Math.min(...georaster.mins);
        const max = Math.max(...georaster.maxs);
        
        const scale = cmap === 'dem' 
            ? chroma.scale('terrain').domain([min, max])
            : chroma.scale(['transparent', '#ef4444']).domain([0, max]);

        const layer = new GeoRasterLayer({
            georaster: georaster,
            opacity: 0.7,
            pixelValuesToColorFn: function(pixelValues) {
                const pixelValue = pixelValues[0];
                // Se for NoData ou valor muito baixo (dependendo do raster), retorna transparente
                if (pixelValue === georaster.noDataValue || isNaN(pixelValue) || (cmap === 'deforest' && pixelValue <= 0.1)) {
                    return null;
                }
                return scale(pixelValue).hex();
            },
            resolution: 256 // Pode ajustar para performance vs qualidade
        });

        hideLoading();
        return layer;
    } catch (error) {
        console.error("Erro ao carregar Raster:", error);
        hideLoading();
        alert("Erro ao carregar o Raster " + filename + ". Detalhes no console.");
        return null;
    }
}

// Gerenciamento de Toggle das Camadas
function attachToggleEvents() {
    document.querySelectorAll('.layer-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const filename = e.target.getAttribute('data-filename');
            const type = e.target.getAttribute('data-type');
            
            if (e.target.checked) {
                // Se já não foi carregada, carrega
                if (!loadedLayers[filename]) {
                    if (type === 'geojson') {
                        const color = e.target.getAttribute('data-color');
                        loadedLayers[filename] = await loadGeoJSON(filename, color);
                    } else if (type === 'raster') {
                        const cmap = e.target.getAttribute('data-cmap');
                        loadedLayers[filename] = await loadRaster(filename, cmap);
                    }
                }
                
                // Adiciona ao mapa
                if (loadedLayers[filename]) {
                    loadedLayers[filename].addTo(map);
                    
                    // Ajusta o zoom para a camada
                    if (type === 'geojson') {
                        map.fitBounds(loadedLayers[filename].getBounds());
                    } else if (type === 'raster' && loadedLayers[filename].getBounds) {
                        // georaster-layer-for-leaflet bounds
                        const bounds = loadedLayers[filename].getBounds();
                        map.fitBounds(bounds);
                    }
                } else {
                    // Em caso de falha, desmarca o checkbox
                    e.target.checked = false;
                }
            } else {
                // Remove do mapa
                if (loadedLayers[filename]) {
                    map.removeLayer(loadedLayers[filename]);
                }
            }
        });
    });
}

// Cria os controles de camadas dinamicamente
function buildLayerUI() {
    const geojsonContainer = document.getElementById('geojson-list');
    const rasterContainer = document.getElementById('raster-list');
    
    if (window.GeoportalData && geojsonContainer && rasterContainer) {
        const colors = ['#3388ff', '#ff3333', '#33ccff', '#ffaa00', '#aa00ff', '#aaaaaa'];
        let colorIdx = 0;
        
        Object.keys(window.GeoportalData).forEach(filename => {
            const extMatch = filename.match(/\.([^.]+)$/);
            if (!extMatch) return;
            const ext = extMatch[1].toLowerCase();
            const name = filename.replace('.'+extMatch[1], '').replace(/_/g, ' ');
            
            const label = document.createElement('label');
            label.className = 'custom-checkbox';
            
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'layer-toggle';
            input.setAttribute('data-filename', filename);
            
            const span = document.createElement('span');
            span.className = 'checkmark';
            
            label.appendChild(input);
            label.appendChild(span);
            label.appendChild(document.createTextNode(' ' + name));
            
            if (ext === 'geojson') {
                input.setAttribute('data-type', 'geojson');
                input.setAttribute('data-color', colors[colorIdx % colors.length]);
                colorIdx++;
                geojsonContainer.appendChild(label);
            } else if (ext === 'tif' || ext === 'tiff') {
                input.setAttribute('data-type', 'raster');
                const cmap = filename.toLowerCase().includes('dem') ? 'dem' : 'deforest';
                input.setAttribute('data-cmap', cmap);
                rasterContainer.appendChild(label);
            }
        });
    }
    
    attachToggleEvents();
}

// Inicializar interface
buildLayerUI();
