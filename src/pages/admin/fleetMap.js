import { socketClient } from '../../services/socketClient.js';
import { apiService } from '../../services/apiService.js';
import { showToast } from '../../components/toast.js';
import { icon } from '../../utils/icons.js';

export function renderFleetMap(container) {
    container.innerHTML = `
        <div class="fleet-view" style="padding: 0;">
            <!-- Sleek Control Bar -->
            <div style="
                display: flex; justify-content: space-between; align-items: center; 
                flex-wrap: wrap; gap: 14px; margin-bottom: 16px; background: var(--surface-card); 
                padding: 16px 20px; border-radius: 20px; border: 1px solid var(--border-color);
            ">
                <div>
                    <h3 style="color: var(--text-primary); font-size: 1.25rem; font-weight: 800; margin: 0; display:flex; align-items:center; gap:8px;">
                        ${icon('mapPin', 20)} Monitoreo de Flota GPS en Tiempo Real
                    </h3>
                    <small style="color: var(--text-secondary);">Supervisión directa con Socket.IO y PostgreSQL</small>
                </div>

                <!-- Compact Stat Pills Row -->
                <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                    <div style="
                        background: var(--surface-elevated); padding: 8px 14px; border-radius: 12px; 
                        border: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px;
                    ">
                        <span style="color: var(--text-muted); font-size: 0.78rem; font-weight: 700; text-transform: uppercase;">Total:</span>
                        <strong id="tot-drv" style="color: var(--text-primary); font-size: 0.95rem; font-family: 'JetBrains Mono', monospace;">0</strong>
                    </div>

                    <div style="
                        background: rgba(0, 230, 118, 0.1); padding: 8px 14px; border-radius: 12px; 
                        border: 1px solid rgba(0, 230, 118, 0.4); display: flex; align-items: center; gap: 6px;
                    ">
                        <span style="color: #00E676; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;">Disponibles:</span>
                        <strong id="on-drv" style="color: #00E676; font-size: 0.95rem; font-family: 'JetBrains Mono', monospace;">0</strong>
                    </div>

                    <div style="
                        background: rgba(0, 210, 255, 0.1); padding: 8px 14px; border-radius: 12px; 
                        border: 1px solid rgba(0, 210, 255, 0.4); display: flex; align-items: center; gap: 6px;
                    ">
                        <span style="color: #00D2FF; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;">En Viaje:</span>
                        <strong id="trp-drv" style="color: #00D2FF; font-size: 0.95rem; font-family: 'JetBrains Mono', monospace;">0</strong>
                    </div>

                    <div style="
                        background: var(--surface-elevated); padding: 8px 14px; border-radius: 12px; 
                        border: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px;
                    ">
                        <span style="color: var(--text-muted); font-size: 0.78rem; font-weight: 700; text-transform: uppercase;">Offline:</span>
                        <strong id="off-drv" style="color: var(--text-muted); font-size: 0.95rem; font-family: 'JetBrains Mono', monospace;">0</strong>
                    </div>
                </div>

                <!-- Filter Select Dropdown -->
                <div style="display: flex; align-items: center; gap: 8px;">
                    <select id="status-filter" style="
                        padding: 8px 14px; border-radius: 12px; border: 1px solid var(--border-gold);
                        background: var(--surface-elevated); color: var(--accent-primary); font-weight: 700; font-size: 0.85rem; outline: none; cursor: pointer;
                    ">
                        <option value="all">Todos los estados</option>
                        <option value="AVAILABLE">Solo Disponibles</option>
                        <option value="IN_TRIP">Solo En Viaje</option>
                        <option value="OFFLINE">Solo Offline</option>
                    </select>
                </div>
            </div>

            <!-- Full Screen Height GPS Map Container -->
            <div style="position: relative; border-radius: 24px; overflow: hidden; border: 1.5px solid var(--border-gold);">
                <div id="fleet-map" class="fleet-map-container" style="height: 620px;"></div>
                
                <!-- Map Legend Bar as shown in user screenshot -->
                <div class="map-legend-bar" style="
                    position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
                    z-index: 1000; background: rgba(15, 20, 32, 0.92); backdrop-filter: blur(16px);
                    border: 1.5px solid var(--border-gold, #FFC107); border-radius: 20px;
                    padding: 8px 16px; display: flex; align-items: center; gap: 16px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.6); pointer-events: auto;
                ">
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.78rem; font-weight:800; color:var(--text-primary);">
                        <span style="width:10px; height:10px; border-radius:50%; background:#00E676; box-shadow:0 0 8px #00E676;"></span>
                        Mi ubicación
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.78rem; font-weight:800; color:var(--text-primary);">
                        <span style="width:10px; height:10px; border-radius:50%; background:#FFC107; box-shadow:0 0 8px #FFC107;"></span>
                        Compañeros
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.78rem; font-weight:800; color:var(--text-primary);">
                        <span style="width:10px; height:10px; border-radius:50%; background:#FF4D4D; box-shadow:0 0 8px #FF4D4D;"></span>
                        SOS activos
                    </div>
                </div>
            </div>
        </div>
    `;

    setTimeout(async () => {
        const mapElement = document.getElementById('fleet-map');
        if (!mapElement || typeof L === 'undefined') return;

        // Center on Maracaibo
        const maracaiboCenter = [10.6427, -71.6125];
        const map = L.map('fleet-map', {
            zoomControl: true
        }).setView(maracaiboCenter, 13);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            maxZoom: 19
        }).addTo(map);

        setTimeout(() => map.invalidateSize(), 200);

        const markers = {};
        const driversMap = new Map();

        function createCustomIcon(status, heading = 0) {
            const normalizedStatus = (status || '').toUpperCase();
            let statusClass = 'offline';
            let iconSymbol = '🏍️';

            if (normalizedStatus === 'AVAILABLE' || normalizedStatus === 'ONLINE') {
                statusClass = 'online';
                iconSymbol = '🛵';
            } else if (normalizedStatus === 'BUSY' || normalizedStatus === 'IN_TRIP' || normalizedStatus === 'ON_TRIP') {
                statusClass = 'in_trip';
                iconSymbol = '⚡';
            }

            return L.divIcon({
                className: 'custom-driver-leaflet-icon',
                html: `
                    <div class="driver-marker-pulse ${statusClass}" style="transform: rotate(${heading}deg); transition: transform 0.3s ease;">
                        <div class="pulse-ring"></div>
                        <div class="marker-icon-box" style="font-size: 1.2rem;">${iconSymbol}</div>
                    </div>
                `,
                iconSize: [44, 44],
                iconAnchor: [22, 22],
                popupAnchor: [0, -20]
            });
        }

        function renderDriverMarker(d) {
            const status = (d.status || (d.isAvailable ? 'AVAILABLE' : d.isOnline ? 'ONLINE' : 'OFFLINE')).toUpperCase();
            const lat = Number(d.lat ?? d.latitude);
            const lng = Number(d.lng ?? d.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            const heading = d.heading || 0;
            const speed = d.speed || 0;
            const battery = d.batteryLevel !== undefined && d.batteryLevel !== null ? `${d.batteryLevel}%` : 'N/A';
            const name = d.driverName || (d.user ? `${d.user.firstName} ${d.user.lastName}` : d.firstName ? `${d.firstName} ${d.lastName || ''}` : 'Conductor');
            const phone = d.phone || d.user?.phone || '+58 414-000-0004';
            const photo = d.photoUrl || d.user?.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
            const brand = d.vehicleBrand || 'Bera';
            const model = d.vehicleModel || 'SBR 150';
            const plate = d.vehiclePlate || 'AC3M49P';
            const color = d.vehicleColor || 'Negro';

            const icon = createCustomIcon(status, heading);
            const popupContent = `
                <div style="padding: 12px; min-width: 230px; font-family: 'Inter', sans-serif;">
                    <div style="display:flex; align-items:center; gap: 12px; margin-bottom: 10px;">
                        <img src="${photo}" style="width: 44px; height: 44px; border-radius: 50%; border: 2.5px solid var(--accent-primary); object-fit: cover;">
                        <div>
                            <h4 style="margin: 0; color: white; font-size: 0.95rem; font-weight: 800;">${name}</h4>
                            <small style="color: var(--text-secondary); font-weight: 600;">${phone}</small>
                        </div>
                    </div>

                    <div style="background: rgba(255,255,255,0.06); padding: 10px; border-radius: 14px; margin-bottom: 10px; font-size: 0.82rem; display: flex; flex-direction: column; gap: 5px;">
                        <div><strong>Vehículo:</strong> ${brand} ${model} (${color})</div>
                        <div><strong>Placa:</strong> <code style="color:var(--accent-primary); font-size:0.88rem; font-weight:800;">${plate}</code></div>
                        <div><strong>Estado:</strong> 
                            <span class="badge badge-${status === 'AVAILABLE' ? 'success' : status === 'BUSY' ? 'warning' : 'secondary'}">
                                ${status}
                            </span>
                        </div>
                        <div><strong>Velocidad:</strong> <span style="color:var(--accent-secondary); font-weight:800;">${speed} km/h</span></div>
                        <div><strong>Batería:</strong> 🔋 ${battery}</div>
                        <div><strong>Última Ubicación:</strong> hace unos segundos</div>
                    </div>
                </div>
            `;

            if (!markers[d.userId || d.id]) {
                const marker = L.marker([lat, lng], { icon }).addTo(map);
                marker.bindPopup(popupContent);
                markers[d.userId || d.id] = marker;
            } else {
                markers[d.userId || d.id].setLatLng([lat, lng]);
                markers[d.userId || d.id].setIcon(icon);
                markers[d.userId || d.id].setPopupContent(popupContent);
            }
        }

        function updateKpis() {
            let tot = 0, avail = 0, busy = 0, off = 0;
            driversMap.forEach((d) => {
                tot++;
                const st = (d.status || '').toUpperCase();
                if (st === 'AVAILABLE' || d.isAvailable) avail++;
                else if (st === 'BUSY' || st === 'IN_TRIP') busy++;
                else off++;
            });

            const totEl = container.querySelector('#tot-drv');
            const onEl = container.querySelector('#on-drv');
            const trpEl = container.querySelector('#trp-drv');
            const offEl = container.querySelector('#off-drv');

            if (totEl) totEl.textContent = tot;
            if (onEl) onEl.textContent = avail;
            if (trpEl) trpEl.textContent = busy;
            if (offEl) offEl.textContent = off;
        }

        // Fetch initial list of drivers from REST API
        try {
            const initialDrivers = await apiService.get('/drivers/nearby');
            if (Array.isArray(initialDrivers)) {
                initialDrivers.forEach(d => {
                    const id = d.userId || d.id;
                    driversMap.set(id, d);
                    renderDriverMarker(d);
                });
                updateKpis();
            }
        } catch (err) {
            // Default seed
        }

        // Subscribe to real-time Socket.IO telemetry events
        const socket = socketClient.connect();
        
        socket.on('admin:driver_location', (data) => {
            if (data && data.userId) {
                driversMap.set(data.userId, { ...driversMap.get(data.userId), ...data });
                renderDriverMarker(data);
                updateKpis();
            }
        });

        socket.on('admin:driver_updated', (data) => {
            if (data && (data.userId || data.id)) {
                const id = data.userId || data.id;
                driversMap.set(id, { ...driversMap.get(id), ...data });
                renderDriverMarker(driversMap.get(id));
                updateKpis();
            }
        });

        container.querySelector('#status-filter')?.addEventListener('change', event => {
            const selected = event.target.value;
            driversMap.forEach((driver, id) => {
                const status = String(driver.status || 'OFFLINE').toUpperCase();
                const visible = selected === 'all' || status === selected || (selected === 'IN_TRIP' && status === 'BUSY');
                const marker = markers[id];
                if (!marker) return;
                if (visible && !map.hasLayer(marker)) marker.addTo(map);
                if (!visible && map.hasLayer(marker)) marker.removeFrom(map);
            });
        });

    }, 150);
}
