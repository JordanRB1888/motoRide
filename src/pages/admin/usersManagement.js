import { db } from '../../services/mockDatabase.js';
import { showToast } from '../../components/toast.js';
import { apiService } from '../../services/apiService.js';

export function renderUsersManagement(container) {
    let currentTab = 'drivers'; // Default to drivers as requested
    let driverFilter = 'ALL'; // ALL, APPROVED, PENDING, SUSPENDED

    function renderView() {
        container.innerHTML = `
            <div class="users-view" style="padding: 10px 0;">
                <!-- Header Controls -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: 14px; margin-bottom: 20px;">
                    <div>
                        <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 800; margin: 0;">Gestión y Control de Conductores</h2>
                        <small style="color: var(--text-secondary);">Aprobación de nuevas solicitudes, revisión de documentos y control de accesos en Maracaibo</small>
                    </div>

                    <div style="display:flex; gap: 10px; flex-wrap:wrap;">
                        <button id="btn-add-driver" class="btn btn-3d primary-btn" style="
                            padding: 10px 18px; border-radius: 16px; font-weight: 800; font-size: 0.88rem;
                            background: linear-gradient(135deg, #00E676 0%, #00B0FF 100%); color: #121824;
                        ">
                            ➕ Registrar Nuevo Conductor
                        </button>
                    </div>
                </div>

                <!-- Main Role Tabs -->
                <div class="tabs" style="margin-bottom: 16px; display: flex; gap: 10px;">
                    <button class="btn-primary main-tab-btn ${currentTab === 'drivers' ? 'active' : ''}" data-tab="drivers" style="
                        padding: 10px 20px; border-radius: 16px; font-weight: 800; cursor: pointer;
                        background: ${currentTab === 'drivers' ? 'var(--accent-primary)' : 'var(--surface-elevated)'};
                        color: ${currentTab === 'drivers' ? '#121824' : 'var(--text-primary)'};
                        border: 1px solid var(--border-color);
                    ">
                        🛵 Conductores (${db.getCollection('users').filter(u => u.role === 'driver').length})
                    </button>
                    
                    <button class="btn-primary main-tab-btn ${currentTab === 'passengers' ? 'active' : ''}" data-tab="passengers" style="
                        padding: 10px 20px; border-radius: 16px; font-weight: 800; cursor: pointer;
                        background: ${currentTab === 'passengers' ? 'var(--accent-primary)' : 'var(--surface-elevated)'};
                        color: ${currentTab === 'passengers' ? '#121824' : 'var(--text-primary)'};
                        border: 1px solid var(--border-color);
                    ">
                        👥 Pasajeros (${db.getCollection('users').filter(u => u.role === 'passenger').length})
                    </button>
                </div>

                ${currentTab === 'drivers' ? `
                    <!-- Driver Sub-Filter Bar -->
                    <div style="display:flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px;">
                        <button class="driver-filter-btn" data-filter="ALL" style="
                            padding: 8px 14px; border-radius: 14px; font-size: 0.8rem; font-weight: 800; cursor: pointer;
                            background: ${driverFilter === 'ALL' ? 'var(--accent-secondary)' : 'var(--surface-card)'};
                            color: ${driverFilter === 'ALL' ? '#121824' : 'var(--text-primary)'};
                            border: 1px solid var(--border-color);
                        ">
                            Todos
                        </button>
                        <button class="driver-filter-btn" data-filter="APPROVED" style="
                            padding: 8px 14px; border-radius: 14px; font-size: 0.8rem; font-weight: 800; cursor: pointer;
                            background: ${driverFilter === 'APPROVED' ? 'var(--success)' : 'var(--surface-card)'};
                            color: ${driverFilter === 'APPROVED' ? '#121824' : 'var(--success)'};
                            border: 1px solid var(--border-color);
                        ">
                            🟢 Aprobados / Activos
                        </button>
                        <button class="driver-filter-btn" data-filter="PENDING" style="
                            padding: 8px 14px; border-radius: 14px; font-size: 0.8rem; font-weight: 800; cursor: pointer;
                            background: ${driverFilter === 'PENDING' ? 'var(--accent-primary)' : 'var(--surface-card)'};
                            color: ${driverFilter === 'PENDING' ? '#121824' : 'var(--accent-primary)'};
                            border: 1px solid var(--border-color);
                        ">
                            🟡 Solicitudes Nuevas (Pendientes)
                        </button>
                        <button class="driver-filter-btn" data-filter="SUSPENDED" style="
                            padding: 8px 14px; border-radius: 14px; font-size: 0.8rem; font-weight: 800; cursor: pointer;
                            background: ${driverFilter === 'SUSPENDED' ? 'var(--danger)' : 'var(--surface-card)'};
                            color: ${driverFilter === 'SUSPENDED' ? '#FFFFFF' : 'var(--danger)'};
                            border: 1px solid var(--border-color);
                        ">
                            🔴 Suspendidos / Inactivos
                        </button>
                    </div>
                ` : ''}

                <!-- Search Input Bar -->
                <div class="search-bar" style="margin-bottom: 20px;">
                    <input type="text" id="user-search" placeholder="🔍 Buscar por nombre, teléfono, placa o modelo de moto..." style="
                        width: 100%; padding: 14px 18px; border-radius: 20px; border: 1.5px solid var(--border-color);
                        background: var(--surface-input); color: white; outline: none; font-size: 0.95rem;
                    " />
                </div>

                <!-- Table Container -->
                <div id="users-table-container" class="data-table-container diorama-card-3d">
                    <!-- Table rendered here -->
                </div>

                <div id="modal-slot"></div>
            </div>
        `;

        // Event listeners
        container.querySelectorAll('.main-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentTab = e.currentTarget.dataset.tab;
                renderView();
            });
        });

        container.querySelectorAll('.driver-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                driverFilter = e.currentTarget.dataset.filter;
                renderView();
            });
        });

        const addDriverBtn = container.querySelector('#btn-add-driver');
        if (addDriverBtn) {
            addDriverBtn.addEventListener('click', openAddDriverModal);
        }

        const searchInput = container.querySelector('#user-search');
        if (searchInput) {
            searchInput.addEventListener('input', renderTable);
        }

        renderTable();
    }

    function renderTable() {
        const tableContainer = container.querySelector('#users-table-container');
        const searchInput = container.querySelector('#user-search');
        const search = searchInput ? searchInput.value.toLowerCase() : '';

        let users = db.getCollection('users').filter(u => u.role === (currentTab === 'passengers' ? 'passenger' : 'driver'));

        if (currentTab === 'drivers') {
            if (driverFilter === 'APPROVED') {
                users = users.filter(u => u.status === 'ONLINE' || u.status === 'IN_TRIP' || u.status === 'OFFLINE' || u.isVerified);
            } else if (driverFilter === 'PENDING') {
                users = users.filter(u => u.status === 'PENDING_APPROVAL' || u.isVerified === false);
            } else if (driverFilter === 'SUSPENDED') {
                users = users.filter(u => u.status === 'SUSPENDED');
            }
        }

        if (search) {
            users = users.filter(u => {
                const fullName = `${u.firstName || ''} ${u.lastName || ''} ${u.name || ''}`.toLowerCase();
                const phone = u.phone || '';
                const plate = u.vehiclePlate || '';
                const model = `${u.vehicleBrand || ''} ${u.vehicleModel || ''}`.toLowerCase();
                return fullName.includes(search) || phone.includes(search) || plate.toLowerCase().includes(search) || model.includes(search);
            });
        }

        if (currentTab === 'passengers') {
            tableContainer.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Teléfono</th>
                            <th>Email</th>
                            <th>Saldo Wallet</th>
                            <th>Calificación</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td><strong>${u.firstName || u.name} ${u.lastName || ''}</strong></td>
                                <td>${u.phone || 'N/A'}</td>
                                <td>${u.email || 'N/A'}</td>
                                <td style="color: var(--accent-primary); font-weight: 800;">€${(u.walletBalance || 25.00).toFixed(2)} EUR</td>
                                <td>⭐ ${u.rating || 5.0}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="5" class="text-center" style="padding: 20px; color: var(--text-muted);">No se encontraron pasajeros registrados</td></tr>'}
                    </tbody>
                </table>
            `;
        } else {
            tableContainer.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Conductor</th>
                            <th>Moto & Placa</th>
                            <th>Estatus de Acceso</th>
                            <th>Documentación</th>
                            <th>Acciones de Administración</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => {
                            const docs = u.documents || {};
                            const docValues = Object.values(docs);
                            const totalDocs = 5;
                            const approvedCount = docValues.filter(d => (typeof d === 'string' ? d === 'approved' : d?.status === 'approved')).length;
                            const pendingCount = docValues.filter(d => (typeof d === 'object' && d?.status === 'pending')).length;

                            let docBadge = `<span class="badge badge-success" style="font-weight:700;">✓ ${approvedCount}/5 Al Día</span>`;
                            if (pendingCount > 0) {
                                docBadge = `<span class="badge badge-warning" style="font-weight:800;">⚡ ${pendingCount} Por Revisar</span>`;
                            } else if (approvedCount < totalDocs) {
                                docBadge = `<span class="badge badge-danger" style="font-weight:700;">⚠️ ${approvedCount}/5 Incompleto</span>`;
                            }

                            const isApproved = u.status !== 'SUSPENDED' && (u.isVerified !== false && u.status !== 'PENDING_APPROVAL');
                            const isSuspended = u.status === 'SUSPENDED';

                            let statusBadge = `<span class="badge badge-success" style="font-weight:800;">🟢 Aprobado</span>`;
                            if (isSuspended) {
                                statusBadge = `<span class="badge badge-danger" style="font-weight:800;">🔴 Suspendido</span>`;
                            } else if (!isApproved) {
                                statusBadge = `<span class="badge badge-warning" style="font-weight:800;">🟡 Pendiente Aprobación</span>`;
                            }

                            return `
                                <tr>
                                    <td>
                                        <div style="display:flex; align-items:center; gap:12px;">
                                            <img src="${u.photoUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + u.firstName}" style="width:42px; height:42px; border-radius:50%; border:2px solid var(--accent-primary); flex-shrink:0;">
                                            <div>
                                                <strong style="color:var(--text-primary); font-size:0.95rem; display:block;">${u.firstName || ''} ${u.lastName || ''}</strong>
                                                <small style="color:var(--text-secondary); font-size:0.8rem;">${u.phone || 'Sin teléfono'}</small>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <strong style="color:var(--text-primary); font-size:0.9rem; display:block;">${u.vehicleBrand || 'Bera'} ${u.vehicleModel || 'BR200'} (${u.vehicleYear || '2023'})</strong>
                                        <code style="background:var(--surface-elevated); padding:2px 8px; border-radius:6px; color:var(--accent-primary); font-weight:800;">${u.vehiclePlate || 'S/P'}</code>
                                    </td>
                                    <td>${statusBadge}</td>
                                    <td>${docBadge}</td>
                                    <td>
                                        <div style="display:flex; gap: 6px; flex-wrap:wrap;">
                                            <button class="btn btn-secondary btn-sm inspect-driver-btn" data-id="${u.id}" style="
                                                padding: 6px 12px; border-radius: 12px; font-weight: 800; font-size: 0.78rem;
                                            " title="Revisar expediente completo y documentos">
                                                🔍 Expediente
                                            </button>

                                            ${!isApproved ? `
                                                <button class="btn btn-success btn-sm quick-approve-btn" data-id="${u.id}" style="
                                                    padding: 6px 12px; border-radius: 12px; font-weight: 800; font-size: 0.78rem; background: var(--success); color: #121824;
                                                ">
                                                    ✓ Aprobar
                                                </button>
                                            ` : ''}

                                            ${!isSuspended ? `
                                                <button class="btn btn-warning btn-sm quick-suspend-btn" data-id="${u.id}" style="
                                                    padding: 6px 12px; border-radius: 12px; font-weight: 800; font-size: 0.78rem; background: rgba(255,152,0,0.2); color: var(--warning); border: 1px solid var(--warning);
                                                ">
                                                    🚫 Suspender
                                                </button>
                                            ` : `
                                                <button class="btn btn-success btn-sm quick-approve-btn" data-id="${u.id}" style="
                                                    padding: 6px 12px; border-radius: 12px; font-weight: 800; font-size: 0.78rem; background: var(--success); color: #121824;
                                                ">
                                                    🟢 Reacondicionar
                                                </button>
                                            `}

                                            <button class="btn btn-danger btn-sm delete-driver-btn" data-id="${u.id}" style="
                                                padding: 6px 10px; border-radius: 12px; font-weight: 800; font-size: 0.78rem; background: rgba(255,77,77,0.2); color: var(--danger); border: 1px solid var(--danger);
                                            " title="Eliminar de la plataforma permanentemente">
                                                🗑️ Eliminar
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('') || '<tr><td colspan="5" class="text-center" style="padding: 24px; color: var(--text-muted);">No se encontraron conductores con este filtro</td></tr>'}
                    </tbody>
                </table>
            `;

            // Attach table events
            tableContainer.querySelectorAll('.inspect-driver-btn').forEach(btn => {
                btn.addEventListener('click', () => openDocVerificationModal(btn.dataset.id));
            });

            tableContainer.querySelectorAll('.quick-approve-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    approveDriver(btn.dataset.id);
                });
            });

            tableContainer.querySelectorAll('.quick-suspend-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    suspendDriver(btn.dataset.id);
                });
            });

            tableContainer.querySelectorAll('.delete-driver-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    confirmDeleteDriver(btn.dataset.id);
                });
            });
        }
    }

    async function approveDriver(driverId) {
        const driver = db.findById('users', driverId);
        if (!driver) return;

        const defaultDocs = {
            cedula: 'approved',
            licencia: 'approved',
            rcv: 'approved',
            certificadoMedico: 'approved',
            carnetCirculacion: 'approved'
        };

        const updated = await apiService.patch(`/admin/drivers/${driverId}`, { action: 'approve' });
        if (!updated) return showToast('No se pudo aprobar el conductor', 'error');
        db.update('users', driverId, updated);
        showToast(`¡Conductor ${driver.firstName} ${driver.lastName} APROBADO para trabajar!`, 'success');
        renderView();
    }

    async function suspendDriver(driverId) {
        const driver = db.findById('users', driverId);
        if (!driver) return;

        const updated = await apiService.patch(`/admin/drivers/${driverId}`, { action: 'suspend' });
        if (!updated) return showToast('No se pudo suspender el conductor', 'error');
        db.update('users', driverId, updated);
        showToast(`Acceso suspendido a ${driver.firstName} ${driver.lastName}`, 'warning');
        renderView();
    }

    async function confirmDeleteDriver(driverId) {
        const driver = db.findById('users', driverId);
        if (!driver) return;

        if (confirm(`¿Estás seguro de que deseas ELIMINAR a ${driver.firstName} ${driver.lastName} de la aplicación? El conductor perderá acceso permanentemente.`)) {
            const deleted = await apiService.delete(`/admin/drivers/${driverId}`);
            if (!deleted) return showToast('No se pudo eliminar el conductor', 'error');
            db.delete('users', driverId);
            showToast(`Conductor ${driver.firstName} ${driver.lastName} eliminado del sistema`, 'error');
            renderView();
        }
    }

    function openAddDriverModal() {
        const modalSlot = container.querySelector('#modal-slot');
        const overlay = document.createElement('div');
        overlay.className = 'diorama-card-3d fade-in';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(10, 15, 24, 0.9); backdrop-filter: blur(20px);
            display: flex; align-items: center; justify-content: center; padding: 16px;
        `;

        overlay.innerHTML = `
            <div style="
                width: 100%; max-width: 520px; background: var(--surface-card); border-radius: 28px;
                border: 2px solid var(--accent-primary); padding: 24px; box-shadow: 0 30px 70px rgba(0,0,0,0.8);
            ">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
                    <h3 style="color: var(--text-primary); font-size: 1.2rem; font-weight: 800; margin: 0;">➕ Registrar Nuevo Conductor</h3>
                    <button id="close-add-modal" style="color: var(--text-secondary); font-size: 1.3rem; background: none; border: none; cursor: pointer;">✕</button>
                </div>

                <form id="add-driver-form" style="display:flex; flex-direction:column; gap: 12px;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <small style="color:var(--text-secondary);">Nombre</small>
                            <input type="text" id="new-fname" required placeholder="Ej: Gabriel" style="width:100%; padding:10px 14px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                        </div>
                        <div>
                            <small style="color:var(--text-secondary);">Apellido</small>
                            <input type="text" id="new-lname" required placeholder="Ej: Zambrano" style="width:100%; padding:10px 14px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <small style="color:var(--text-secondary);">Teléfono WhatsApp</small>
                            <input type="text" id="new-phone" required placeholder="+58 414-000-0000" style="width:100%; padding:10px 14px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                        </div>
                        <div>
                            <small style="color:var(--text-secondary);">Correo Electrónico</small>
                            <input type="email" id="new-email" required placeholder="correo@ejemplo.com" style="width:100%; padding:10px 14px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                        <div>
                            <small style="color:var(--text-secondary);">Marca Moto</small>
                            <input type="text" id="new-brand" required placeholder="Ej: Bera" style="width:100%; padding:10px 14px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                        </div>
                        <div>
                            <small style="color:var(--text-secondary);">Modelo</small>
                            <input type="text" id="new-model" required placeholder="Ej: BR200" style="width:100%; padding:10px 14px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                        </div>
                        <div>
                            <small style="color:var(--text-secondary);">Placa</small>
                            <input type="text" id="new-plate" required placeholder="Ej: AC9M11P" style="width:100%; padding:10px 14px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                        </div>
                    </div>

                    <div style="margin-top: 12px; display:flex; justify-content:flex-end; gap: 10px;">
                        <button type="button" id="cancel-add-btn" class="btn" style="padding:10px 18px; border-radius:14px; background:var(--surface-elevated); color:white;">Cancelar</button>
                        <button type="submit" class="btn btn-3d primary-btn" style="padding:10px 22px; border-radius:14px; font-weight:800;">REGISTRAR Y HABILITAR</button>
                    </div>
                </form>
            </div>
        `;

        overlay.querySelector('#close-add-modal').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#cancel-add-btn').addEventListener('click', () => overlay.remove());

        overlay.querySelector('#add-driver-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const firstName = overlay.querySelector('#new-fname').value.trim();
            const lastName = overlay.querySelector('#new-lname').value.trim();
            const phone = overlay.querySelector('#new-phone').value.trim();
            const email = overlay.querySelector('#new-email').value.trim();
            const vehicleBrand = overlay.querySelector('#new-brand').value.trim();
            const vehicleModel = overlay.querySelector('#new-model').value.trim();
            const vehiclePlate = overlay.querySelector('#new-plate').value.trim();

            const newDriver = {
                id: 'driver_' + Date.now(),
                role: 'driver',
                firstName,
                lastName,
                phone,
                email,
                vehicleBrand,
                vehicleModel,
                vehiclePlate,
                photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(firstName)}`,
                status: 'ONLINE',
                isVerified: true,
                rating: 5.0,
                totalTrips: 0,
                documents: {
                    cedula: 'approved',
                    licencia: 'approved',
                    rcv: 'approved',
                    certificadoMedico: 'approved',
                    carnetCirculacion: 'approved'
                }
            };

            const created = await apiService.post('/admin/drivers', newDriver);
            if (!created?.user) return showToast('No se pudo registrar el conductor', 'error');
            db.insert('users', created.user);
            showToast(`Conductor registrado. Contraseña temporal: ${created.temporaryPassword}`, 'success');
            overlay.remove();
            renderView();
        });

        modalSlot.appendChild(overlay);
    }

    function openDocVerificationModal(driverId) {
        const driver = db.findById('users', driverId);
        if (!driver) return;

        const docs = driver.documents || {};
        const docKeys = [
            { key: 'cedula', label: 'Cédula de Identidad 🇻🇪' },
            { key: 'licencia', label: 'Licencia de Conducir (2do Grado)' },
            { key: 'rcv', label: 'RCV (Seguro de Responsabilidad Civil)' },
            { key: 'certificadoMedico', label: 'Certificado Médico de Conducir' },
            { key: 'carnetCirculacion', label: 'Carnet de Circulación de la Moto' }
        ];

        const modalSlot = container.querySelector('#modal-slot');
        const overlay = document.createElement('div');
        overlay.className = 'diorama-card-3d fade-in';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(10, 15, 24, 0.92); backdrop-filter: blur(20px);
            display: flex; align-items: center; justify-content: center; padding: 16px;
        `;

        const renderModalContent = () => {
            const isApproved = driver.status !== 'SUSPENDED' && (driver.isVerified !== false && driver.status !== 'PENDING_APPROVAL');
            const isSuspended = driver.status === 'SUSPENDED';

            overlay.innerHTML = `
                <div style="
                    width: 100%; max-width: 620px; max-height: 90vh; background: var(--surface-card); border-radius: 28px;
                    border: 2px solid var(--accent-secondary); padding: 24px; box-shadow: 0 30px 70px rgba(0,0,0,0.8);
                    display: flex; flex-direction: column; overflow: hidden;
                ">
                    <!-- Header -->
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border-color); padding-bottom: 14px; margin-bottom: 16px;">
                        <div style="display:flex; align-items:center; gap: 12px;">
                            <img src="${driver.photoUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + driver.firstName}" style="width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--accent-primary);" />
                            <div>
                                <h3 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 800; margin: 0;">
                                    ${driver.firstName} ${driver.lastName}
                                </h3>
                                <small style="color: var(--text-secondary);">${driver.vehicleBrand} ${driver.vehicleModel} (${driver.vehiclePlate}) · ${driver.phone}</small>
                            </div>
                        </div>
                        <button id="close-inspector-modal" style="color: var(--text-secondary); font-size: 1.3rem; background: none; border: none; cursor: pointer;">✕</button>
                    </div>

                    <!-- Documents Checklist Container -->
                    <div style="flex:1; overflow-y: auto; padding-right: 6px; display:flex; flex-direction:column; gap: 14px; margin-bottom: 16px;">
                        ${docKeys.map(item => {
                            const docObj = docs[item.key];
                            const status = typeof docObj === 'string' ? docObj : (docObj?.status || 'pending');

                            return `
                                <div style="padding: 14px; background: var(--surface-elevated); border-radius: 16px; border: 1px solid var(--border-color);">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                                        <strong style="color:var(--text-primary); font-size:0.92rem;">${item.label}</strong>
                                        <span class="badge badge-${status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'warning'}" style="font-weight:800;">
                                            ${status === 'approved' ? '✓ APROBADO' : status === 'rejected' ? '✕ RECHAZADO' : '⚡ PENDIENTE'}
                                        </span>
                                    </div>
                                    <div style="display:flex; gap: 8px; margin-top: 10px;">
                                        <button class="btn btn-success btn-sm approve-doc-btn" data-key="${item.key}" style="
                                            flex:1; padding: 8px; border-radius: 12px; font-weight: 800; font-size: 0.78rem; background: var(--success); color: #121824;
                                        ">✓ Aprobar Documento</button>
                                        <button class="btn btn-danger btn-sm reject-doc-btn" data-key="${item.key}" style="
                                            flex:1; padding: 8px; border-radius: 12px; font-weight: 800; font-size: 0.78rem; background: rgba(255,77,77,0.2); color: var(--danger); border: 1px solid var(--danger);
                                        ">✕ Rechazar Documento</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <!-- Global Actions Footer Bar -->
                    <div style="border-top: 1px solid var(--border-color); padding-top: 16px; display:flex; gap: 10px; flex-wrap:wrap;">
                        <button id="modal-approve-all-btn" class="btn btn-3d" style="
                            flex:1; min-width: 160px; padding: 12px; border-radius: 14px; font-weight: 900;
                            background: linear-gradient(135deg, #00E676 0%, #00B0FF 100%); color: #121824;
                        ">
                            ✓ Aceptar y Habilitar Conductor
                        </button>

                        <button id="modal-suspend-btn" class="btn" style="
                            flex:1; min-width: 140px; padding: 12px; border-radius: 14px; font-weight: 800;
                            background: rgba(255,152,0,0.15); border: 1.5px solid var(--warning); color: var(--warning);
                        ">
                            🚫 Suspender Acceso
                        </button>

                        <button id="modal-delete-btn" class="btn" style="
                            padding: 12px 16px; border-radius: 14px; font-weight: 800;
                            background: rgba(255,77,77,0.15); border: 1.5px solid var(--danger); color: var(--danger);
                        ">
                            🗑️ Eliminar
                        </button>
                    </div>
                </div>
            `;

            overlay.querySelector('#close-inspector-modal').addEventListener('click', () => overlay.remove());

            overlay.querySelectorAll('.approve-doc-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const key = btn.dataset.key;
                    docs[key] = 'approved';
                    const updated = await apiService.patch(`/admin/drivers/${driver.id}`, { documentKey: key, documentStatus: 'approved' });
                    if (!updated) return showToast('No se pudo actualizar el documento', 'error');
                    db.update('users', driver.id, updated);
                    showToast(`Documento ${key} marcado como APROBADO`, 'success');
                    renderModalContent();
                    renderTable();
                });
            });

            overlay.querySelectorAll('.reject-doc-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const key = btn.dataset.key;
                    docs[key] = 'rejected';
                    const updated = await apiService.patch(`/admin/drivers/${driver.id}`, { documentKey: key, documentStatus: 'rejected', action: 'pending' });
                    if (!updated) return showToast('No se pudo actualizar el documento', 'error');
                    db.update('users', driver.id, updated);
                    showToast(`Documento ${key} RECHAZADO`, 'error');
                    renderModalContent();
                    renderTable();
                });
            });

            overlay.querySelector('#modal-approve-all-btn').addEventListener('click', () => {
                approveDriver(driver.id);
                overlay.remove();
            });

            overlay.querySelector('#modal-suspend-btn').addEventListener('click', () => {
                suspendDriver(driver.id);
                overlay.remove();
            });

            overlay.querySelector('#modal-delete-btn').addEventListener('click', () => {
                confirmDeleteDriver(driver.id);
                overlay.remove();
            });
        };

        renderModalContent();
        modalSlot.appendChild(overlay);
    }

    renderView();
}
