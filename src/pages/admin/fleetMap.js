import { db } from '../../services/mockDatabase.js';
import { showToast } from '../../components/toast.js';

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
                    <h3 style="color: var(--text-primary); font-size: 1.25rem; font-weight: 800; margin: 0;">
                        🗺️ Monitoreo de Flota GPS
                    </h3>
                    <small style="color: var(--text-secondary);">Supervisión en vivo de mototaxistas en Maracaibo</small>
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
                        <span style="color: #00E676; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;">🟢 Online:</span>
                        <strong id="on-drv" style="color: #00E676; font-size: 0.95rem; font-family: 'JetBrains Mono', monospace;">0</strong>
                    </div>

                    <div style="
                        background: rgba(0, 210, 255, 0.1); padding: 8px 14px; border-radius: 12px; 
                        border: 1px solid rgba(0, 210, 255, 0.4); display: flex; align-items: center; gap: 6px;
                    ">
                        <span style="color: #00D2FF; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;">🔷 En Viaje:</span>
                        <strong id="trp-drv" style="color: #00D2FF; font-size: 0.95rem; font-family: 'JetBrains Mono', monospace;">0</strong>
                    </div>

                    <div style="
                        background: var(--surface-elevated); padding: 8px 14px; border-radius: 12px; 
                        border: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px;
                    ">
                        <span style="color: var(--text-muted); font-size: 0.78rem; font-weight: 700; text-transform: uppercase;">🔴 Offline:</span>
                        <strong id="off-drv" style="color: var(--text-muted); font-size: 0.95rem; font-family: 'JetBrains Mono', monospace;">0</strong>
                    </div>
                </div>

                <!-- Filter Select Dropdown -->
                <div style="display: flex; align-items: center; gap: 8px;">
                    <select id="status-filter" style="
                        padding: 8px 14px; border-radius: 12px; border: 1px solid var(--border-gold);
                        background: var(--surface-elevated); color: var(--accent-primary); font-weight: 700; font-size: 0.85rem; outline: none; cursor: pointer;
                    ">
                        <option value="all">⚡ Todos los estados</option>
                        <option value="online">🟢 Solo Online</option>
                        <option value="in_trip">🔷 Solo En Viaje</option>
                        <option value="offline">🔴 Solo Offline</option>
                    </select>
                </div>
            </div>

            <!-- Full Screen Height GPS Map Container -->
            <div id="fleet-map" class="fleet-map-container" style="height: 620px; border-radius: 22px;"></div>
        </div>
    `;

    setTimeout(() => {
        const mapElement = document.getElementById('fleet-map');
        if (!mapElement || typeof L === 'undefined') return;

        // Center on Maracaibo
        const maracaiboCenter = [10.6427, -71.6125];
        const map = L.map('fleet-map', {
            zoomControl: true
        }).setView(maracaiboCenter, 13);

        // CartoDB Voyager map tile layer for ultra clean aesthetics
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            maxZoom: 19
        }).addTo(map);

        setTimeout(() => map.invalidateSize(), 200);

        const markers = {};
        let intervalId = null;

        function createCustomIcon(status) {
            const normalizedStatus = (status || '').toLowerCase();
            let statusClass = 'offline';
            let iconSymbol = '🛵';

            if (normalizedStatus === 'online') {
                statusClass = 'online';
                iconSymbol = '🛵';
            } else if (normalizedStatus === 'in_trip' || normalizedStatus === 'en_route') {
                statusClass = 'in_trip';
                iconSymbol = '⚡';
            }

            return L.divIcon({
                className: 'custom-driver-leaflet-icon',
                html: `
                    <div class="driver-marker-pulse ${statusClass}">
                        <div class="pulse-ring"></div>
                        <div class="marker-icon-box">${iconSymbol}</div>
                    </div>
                `,
                iconSize: [44, 44],
                iconAnchor: [22, 22],
                popupAnchor: [0, -20]
            });
        }

        function updateMap() {
            const filter = container.querySelector('#status-filter')?.value || 'all';
            let drivers = db.getCollection('users').filter(u => u.role === 'driver');
            
            if (!drivers || drivers.length === 0) {
                drivers = [
                    { id: 'driver_1', firstName: 'Carlos', lastName: 'Mendoza', phone: '+58 414-000-0001', vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: 'AC3M49P', vehicleColor: 'Rojo', status: 'ONLINE', rating: 4.8, location: { lat: 10.6427, lng: -71.6125 } },
                    { id: 'driver_2', firstName: 'María', lastName: 'González', phone: '+58 414-000-0002', vehicleBrand: 'Empire', vehicleModel: 'TX200', vehiclePlate: 'AB7K12Q', vehicleColor: 'Negro', status: 'IN_TRIP', rating: 4.9, location: { lat: 10.6975, lng: -71.6342 } },
                    { id: 'driver_3', firstName: 'José', lastName: 'Rodríguez', phone: '+58 414-000-0003', vehicleBrand: 'UM', vehicleModel: 'DSR200', vehiclePlate: 'AD1L55R', vehicleColor: 'Azul', status: 'ONLINE', rating: 4.6, location: { lat: 10.6658, lng: -71.5975 } },
                    { id: 'driver_4', firstName: 'Luis', lastName: 'Hernández', phone: '+58 414-000-0004', vehicleBrand: 'Honda', vehicleModel: 'CBF150', vehiclePlate: 'AE5N33S', vehicleColor: 'Gris', status: 'IN_TRIP', rating: 4.7, location: { lat: 10.6689, lng: -71.6167 } },
                    { id: 'driver_5', firstName: 'Ana', lastName: 'Martínez', phone: '+58 414-000-0005', vehicleBrand: 'Bera', vehicleModel: 'SuperStar', vehiclePlate: 'AF9P77T', vehicleColor: 'Blanco', status: 'ONLINE', rating: 4.5, location: { lat: 10.6550, lng: -71.6080 } },
                    { id: 'driver_6', firstName: 'Pedro', lastName: 'López', phone: '+58 414-000-0006', vehicleBrand: 'Yamaha', vehicleModel: 'YBR125', vehiclePlate: 'AG2R88U', vehicleColor: 'Rojo', status: 'OFFLINE', rating: 4.8, location: { lat: 10.6800, lng: -71.6200 } },
                    { id: 'driver_7', firstName: 'Carmen', lastName: 'Silva', phone: '+58 414-000-0007', vehicleBrand: 'Suzuki', vehicleModel: 'GN125', vehiclePlate: 'AH6T21V', vehicleColor: 'Negro', status: 'ONLINE', rating: 4.4, location: { lat: 10.6610, lng: -71.6220 } },
                    { id: 'driver_8', firstName: 'Miguel', lastName: 'Torres', phone: '+58 414-000-0008', vehicleBrand: 'Empire', vehicleModel: 'Keeway', vehiclePlate: 'AI8V44W', vehicleColor: 'Plata', status: 'OFFLINE', rating: 4.7, location: { lat: 10.6880, lng: -71.6250 } }
                ];
            }

            let countOn = 0, countTrp = 0, countOff = 0;

            drivers.forEach((driver, idx) => {
                const normStatus = (driver.status || 'OFFLINE').toLowerCase();
                
                if (normStatus === 'online') countOn++;
                else if (normStatus === 'in_trip' || normStatus === 'en_route') countTrp++;
                else countOff++;

                // Filter check
                if (filter !== 'all') {
                    if (filter === 'online' && normStatus !== 'online') return hideMarker(driver.id);
                    if (filter === 'in_trip' && (normStatus !== 'in_trip' && normStatus !== 'en_route')) return hideMarker(driver.id);
                    if (filter === 'offline' && normStatus !== 'offline') return hideMarker(driver.id);
                }

                // Default coordinates if missing
                if (!driver.location || !driver.location.lat) {
                    const offsets = [
                        { lat: 10.6427, lng: -71.6125 },
                        { lat: 10.6975, lng: -71.6342 },
                        { lat: 10.6658, lng: -71.5975 },
                        { lat: 10.6689, lng: -71.6167 },
                        { lat: 10.6550, lng: -71.6080 },
                        { lat: 10.6800, lng: -71.6200 },
                        { lat: 10.6610, lng: -71.6220 },
                        { lat: 10.6880, lng: -71.6250 }
                    ];
                    driver.location = offsets[idx % offsets.length];
                } else if (normStatus !== 'offline') {
                    // Wiggle coordinate simulation
                    driver.location.lat += (Math.random() - 0.5) * 0.0003;
                    driver.location.lng += (Math.random() - 0.5) * 0.0003;
                }

                const icon = createCustomIcon(normStatus);
                const popupContent = `
                    <div style="padding: 10px; min-width: 220px; font-family: 'Inter', sans-serif;">
                        <div style="display:flex; align-items:center; gap: 12px; margin-bottom: 10px;">
                            <img src="${driver.photoUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + driver.firstName}" 
                                 style="width: 42px; height: 42px; border-radius: 50%; border: 2px solid var(--accent-primary);">
                            <div>
                                <h4 style="margin: 0; color: white; font-size: 0.95rem; font-weight: 800;">
                                    ${driver.firstName || 'Conductor'} ${driver.lastName || ''}
                                </h4>
                                <small style="color: var(--text-secondary); font-weight: 600;">${driver.phone || 'Sin teléfono'}</small>
                            </div>
                        </div>

                        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 12px; margin-bottom: 10px; font-size: 0.82rem; display: flex; flex-direction: column; gap: 4px;">
                            <div><strong>Moto:</strong> ${driver.vehicleBrand || 'Bera'} ${driver.vehicleModel || 'BR200'} (${driver.vehicleColor || 'Negro'})</div>
                            <div><strong>Placa:</strong> <code style="color:var(--accent-primary); font-size:0.9rem; font-weight:800;">${driver.vehiclePlate || 'S/P'}</code></div>
                            <div><strong>Estado:</strong> 
                                <span class="badge badge-${normStatus === 'online' ? 'success' : normStatus === 'in_trip' ? 'warning' : 'secondary'}">
                                    ${driver.status}
                                </span>
                            </div>
                            <div><strong>Calificación:</strong> ⭐ ${driver.rating || 4.8}</div>
                        </div>

                        <button onclick="window.contactDriver('${driver.firstName}')" style="
                            width: 100%; padding: 8px; border-radius: 10px; border: none;
                            background: var(--accent-primary); color: #121824; font-weight: 800; font-size: 0.85rem; cursor: pointer;
                        ">
                            💬 Contactar por Soporte
                        </button>
                    </div>
                `;

                if (!markers[driver.id]) {
                    const marker = L.marker([driver.location.lat, driver.location.lng], { icon }).addTo(map);
                    marker.bindPopup(popupContent);
                    markers[driver.id] = marker;
                } else {
                    markers[driver.id].setLatLng([driver.location.lat, driver.location.lng]);
                    markers[driver.id].setIcon(icon);
                    markers[driver.id].setPopupContent(popupContent);
                }
            });

            // Update compact KPI pill text
            const total = countOn + countTrp + countOff;
            const totEl = container.querySelector('#tot-drv');
            const onEl = container.querySelector('#on-drv');
            const trpEl = container.querySelector('#trp-drv');
            const offEl = container.querySelector('#off-drv');

            if (totEl) totEl.textContent = total;
            if (onEl) onEl.textContent = countOn;
            if (trpEl) trpEl.textContent = countTrp;
            if (offEl) offEl.textContent = countOff;
        }

        function hideMarker(id) {
            if (markers[id]) {
                map.removeLayer(markers[id]);
                delete markers[id];
            }
        }

        window.contactDriver = function(driverName) {
            showToast(`Abriendo soporte con ${driverName}...`, 'info');
        };

        updateMap();

        const filterSelect = container.querySelector('#status-filter');
        if (filterSelect) {
            filterSelect.addEventListener('change', () => {
                Object.values(markers).forEach(m => map.removeLayer(m));
                for (let k in markers) delete markers[k];
                updateMap();
            });
        }

        intervalId = setInterval(updateMap, 3000);

        const observer = new MutationObserver(() => {
            if (!document.getElementById('fleet-map')) {
                clearInterval(intervalId);
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

    }, 150);
}
