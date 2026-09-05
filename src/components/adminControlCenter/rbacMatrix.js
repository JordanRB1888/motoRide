import { icon } from '../../utils/icons.js';
import { esc, pageHeader, empty, gap, badge, metric, mountDialog } from './ui.js';

const PERMISSION_DOMAINS = [
  {
    id: 'OPERACIONES',
    name: 'Operaciones',
    icon: 'mapPin',
    description: 'Control de tráfico, supervisión de viajes en curso y gestión de zonas.',
    permissions: [
      { id: 'gestionar_viajes', name: 'Gestionar viajes', desc: 'Asignar, reasignar o cancelar viajes ante contingencias.' },
      { id: 'monitoreo_flota', name: 'Monitoreo de flota', desc: 'Visualizar conductores y unidades en el mapa de operaciones en tiempo real.' },
      { id: 'tarifas_base', name: 'Tarifas base', desc: 'Consultar y ajustar parámetros base de cálculo de costo por km.' },
      { id: 'zonas_servicio', name: 'Zonas de servicio', desc: 'Definir y habilitar polígonos de cobertura operativa en la ciudad.' }
    ]
  },
  {
    id: 'SOLICITUDES',
    name: 'Solicitudes',
    icon: 'fileText',
    description: 'Revisión documental de postulantes a conductores y verificación de antecedentes.',
    permissions: [
      { id: 'ver_expedientes', name: 'Ver expedientes', desc: 'Explorar solicitudes de ingreso en estado pendiente o en revisión.' },
      { id: 'aprobar_conductores', name: 'Aprobar conductores', desc: 'Emitir resolución favorable y habilitar cuenta operativa de conductor.' },
      { id: 'pedir_correcciones', name: 'Pedir correcciones', desc: 'Solicitar reenvío de recaudos ilegibles, vencidos o incompletos.' },
      { id: 'descargar_docs_sensibles', name: 'Descargar docs sensibles', desc: 'Descargar bajo demanda cédula, RIF, carnet y póliza con token cifrado.' }
    ]
  },
  {
    id: 'USUARIOS',
    name: 'Usuarios',
    icon: 'users',
    description: 'Censo global de pasajeros y conductores registrados en +58Express.',
    permissions: [
      { id: 'ver_usuarios', name: 'Ver usuarios', desc: 'Consultar directorio general, historial de viajes y estado de cuenta.' },
      { id: 'editar_perfiles', name: 'Editar perfiles', desc: 'Modificar datos de contacto y nivel de verificación de identidad.' },
      { id: 'bloquear_usuarios', name: 'Bloquear usuarios', desc: 'Inhabilitar temporal o permanentemente cuentas por infracciones.' },
      { id: 'exportar_datos', name: 'Exportar datos', desc: 'Generar reportes y resúmenes de usuarios en formatos estándar.' }
    ]
  },
  {
    id: 'FINANZAS',
    name: 'Finanzas',
    icon: 'wallet',
    description: 'Conciliación bancaria, acreditación de recargas y liquidación a conductores.',
    permissions: [
      { id: 'ver_balances', name: 'Ver balances', desc: 'Monitorear saldo retenido, comisiones de plataforma y balance global.' },
      { id: 'aprobar_recargas', name: 'Aprobar recargas', desc: 'Verificar pagos móviles y acreditar saldo a billeteras de usuarios.' },
      { id: 'ajustar_saldos', name: 'Ajustar saldos', desc: 'Realizar cargos, abonos y notas de crédito administrativas.' },
      { id: 'reportes_fiscales', name: 'Reportes fiscales', desc: 'Emitir balances contables para declaración y conciliación mensual.' }
    ]
  },
  {
    id: 'MARKETING',
    name: 'Marketing',
    icon: 'grid',
    description: 'Campañas promocionales, carruseles del inicio de Pasajeros y convenios comerciales.',
    permissions: [
      { id: 'crear_campanas', name: 'Crear campañas', desc: 'Diseñar y programar nuevos banners publicitarios en la app.' },
      { id: 'editar_banners', name: 'Editar banners', desc: 'Modificar títulos, textos de CTA y vigencia de anuncios activos.' },
      { id: 'gestionar_aliados', name: 'Gestionar aliados', desc: 'Administrar el catálogo de marcas aliadas y sus promociones.' },
      { id: 'enviar_push', name: 'Enviar notificaciones push', desc: 'Segmentar y emitir avisos promocionales a pasajeros o conductores.' }
    ]
  },
  {
    id: 'SOPORTE',
    name: 'Soporte',
    icon: 'message',
    description: 'Atención a tickets de ayuda, mediación de reclamos y chat en vivo.',
    permissions: [
      { id: 'atender_tickets', name: 'Atender tickets', desc: 'Abrir, gestionar y responder incidencias de soporte técnico.' },
      { id: 'chat_operador', name: 'Chat operador', desc: 'Comunicarse en tiempo real con pasajeros y conductores durante viajes.' },
      { id: 'anular_cargos_soporte', name: 'Anular cargos soporte', desc: 'Reembolsar o exonerar tarifas cobradas por error comprobado.' },
      { id: 'ver_historial_casos', name: 'Ver historial de casos', desc: 'Inspeccionar el historial de quejas y resoluciones previas del usuario.' }
    ]
  },
  {
    id: 'ADMIN',
    name: 'Administración',
    icon: 'settings',
    description: 'Control de seguridad perimetral, gestión de equipo y registros de auditoría.',
    permissions: [
      { id: 'gestionar_roles', name: 'Gestionar roles', desc: 'Crear perfiles de acceso y configurar la matriz de permisos RBAC.' },
      { id: 'invitar_admin', name: 'Invitar administradores', desc: 'Generar credenciales y enlaces de invitación para nuevo personal.' },
      { id: 'ver_auditoria', name: 'Ver auditoría', desc: 'Consultar el registro inmutable de todas las acciones administrativas.' },
      { id: 'config_seguridad', name: 'Configuración de seguridad', desc: 'Ajustar políticas de sesiones, autenticación de dos factores y timeouts.' }
    ]
  }
];

const PREDEFINED_ROLES = [
  {
    id: 'super_admin',
    name: 'Superadministrador',
    description: 'Acceso irrestricto y absoluto a todos los dominios operativos, financieros, comerciales y de seguridad.',
    assignedUsers: 2,
    permissions: Object.fromEntries(
      PERMISSION_DOMAINS.flatMap(d => d.permissions.map(p => [`${d.id}.${p.id}`, true]))
    )
  },
  {
    id: 'operations',
    name: 'Operaciones',
    description: 'Supervisión en tiempo real del tráfico, flota activa, reasignación de viajes y zonas de cobertura.',
    assignedUsers: 4,
    permissions: {
      'OPERACIONES.gestionar_viajes': true, 'OPERACIONES.monitoreo_flota': true, 'OPERACIONES.tarifas_base': false, 'OPERACIONES.zonas_servicio': true,
      'SOLICITUDES.ver_expedientes': true, 'SOLICITUDES.aprobar_conductores': false, 'SOLICITUDES.pedir_correcciones': false, 'SOLICITUDES.descargar_docs_sensibles': false,
      'USUARIOS.ver_usuarios': true, 'USUARIOS.editar_perfiles': false, 'USUARIOS.bloquear_usuarios': false, 'USUARIOS.exportar_datos': false,
      'FINANZAS.ver_balances': false, 'FINANZAS.aprobar_recargas': false, 'FINANZAS.ajustar_saldos': false, 'FINANZAS.reportes_fiscales': false,
      'MARKETING.crear_campanas': false, 'MARKETING.editar_banners': false, 'MARKETING.gestionar_aliados': false, 'MARKETING.enviar_push': false,
      'SOPORTE.atender_tickets': true, 'SOPORTE.chat_operador': true, 'SOPORTE.anular_cargos_soporte': false, 'SOPORTE.ver_historial_casos': true,
      'ADMIN.gestionar_roles': false, 'ADMIN.invitar_admin': false, 'ADMIN.ver_auditoria': false, 'ADMIN.config_seguridad': false
    }
  },
  {
    id: 'driver_review',
    name: 'Revisión de Expedientes',
    description: 'Revisión y validación de expedientes de conductores, inspección de recaudos protegidos y control de cambios.',
    assignedUsers: 3,
    permissions: {
      'OPERACIONES.gestionar_viajes': false, 'OPERACIONES.monitoreo_flota': false, 'OPERACIONES.tarifas_base': false, 'OPERACIONES.zonas_servicio': false,
      'SOLICITUDES.ver_expedientes': true, 'SOLICITUDES.aprobar_conductores': true, 'SOLICITUDES.pedir_correcciones': true, 'SOLICITUDES.descargar_docs_sensibles': true,
      'USUARIOS.ver_usuarios': true, 'USUARIOS.editar_perfiles': false, 'USUARIOS.bloquear_usuarios': false, 'USUARIOS.exportar_datos': false,
      'FINANZAS.ver_balances': false, 'FINANZAS.aprobar_recargas': false, 'FINANZAS.ajustar_saldos': false, 'FINANZAS.reportes_fiscales': false,
      'MARKETING.crear_campanas': false, 'MARKETING.editar_banners': false, 'MARKETING.gestionar_aliados': false, 'MARKETING.enviar_push': false,
      'SOPORTE.atender_tickets': false, 'SOPORTE.chat_operador': false, 'SOPORTE.anular_cargos_soporte': false, 'SOPORTE.ver_historial_casos': false,
      'ADMIN.gestionar_roles': false, 'ADMIN.invitar_admin': false, 'ADMIN.ver_auditoria': true, 'ADMIN.config_seguridad': false
    }
  },
  {
    id: 'support',
    name: 'Atención al Cliente',
    description: 'Atención a usuarios y conductores, resolución de incidencias en viaje y chat en vivo.',
    assignedUsers: 5,
    permissions: {
      'OPERACIONES.gestionar_viajes': false, 'OPERACIONES.monitoreo_flota': true, 'OPERACIONES.tarifas_base': false, 'OPERACIONES.zonas_servicio': false,
      'SOLICITUDES.ver_expedientes': false, 'SOLICITUDES.aprobar_conductores': false, 'SOLICITUDES.pedir_correcciones': false, 'SOLICITUDES.descargar_docs_sensibles': false,
      'USUARIOS.ver_usuarios': true, 'USUARIOS.editar_perfiles': false, 'USUARIOS.bloquear_usuarios': false, 'USUARIOS.exportar_datos': false,
      'FINANZAS.ver_balances': false, 'FINANZAS.aprobar_recargas': false, 'FINANZAS.ajustar_saldos': false, 'FINANZAS.reportes_fiscales': false,
      'MARKETING.crear_campanas': false, 'MARKETING.editar_banners': false, 'MARKETING.gestionar_aliados': false, 'MARKETING.enviar_push': false,
      'SOPORTE.atender_tickets': true, 'SOPORTE.chat_operador': true, 'SOPORTE.anular_cargos_soporte': true, 'SOPORTE.ver_historial_casos': true,
      'ADMIN.gestionar_roles': false, 'ADMIN.invitar_admin': false, 'ADMIN.ver_auditoria': false, 'ADMIN.config_seguridad': false
    }
  },
  {
    id: 'finance',
    name: 'Finanzas',
    description: 'Conciliación de pagos móviles, aprobación de recargas de billetera y balances financieros.',
    assignedUsers: 2,
    permissions: {
      'OPERACIONES.gestionar_viajes': false, 'OPERACIONES.monitoreo_flota': false, 'OPERACIONES.tarifas_base': true, 'OPERACIONES.zonas_servicio': false,
      'SOLICITUDES.ver_expedientes': false, 'SOLICITUDES.aprobar_conductores': false, 'SOLICITUDES.pedir_correcciones': false, 'SOLICITUDES.descargar_docs_sensibles': false,
      'USUARIOS.ver_usuarios': true, 'USUARIOS.editar_perfiles': false, 'USUARIOS.bloquear_usuarios': false, 'USUARIOS.exportar_datos': true,
      'FINANZAS.ver_balances': true, 'FINANZAS.aprobar_recargas': true, 'FINANZAS.ajustar_saldos': true, 'FINANZAS.reportes_fiscales': true,
      'MARKETING.crear_campanas': false, 'MARKETING.editar_banners': false, 'MARKETING.gestionar_aliados': false, 'MARKETING.enviar_push': false,
      'SOPORTE.atender_tickets': false, 'SOPORTE.chat_operador': false, 'SOPORTE.anular_cargos_soporte': false, 'SOPORTE.ver_historial_casos': false,
      'ADMIN.gestionar_roles': false, 'ADMIN.invitar_admin': false, 'ADMIN.ver_auditoria': true, 'ADMIN.config_seguridad': false
    }
  },
  {
    id: 'marketing',
    name: 'Comercial y Mercadeo',
    description: 'Diseño de campañas, carruseles del inicio de Pasajeros, promociones y catálogo de aliados.',
    assignedUsers: 1,
    permissions: {
      'OPERACIONES.gestionar_viajes': false, 'OPERACIONES.monitoreo_flota': false, 'OPERACIONES.tarifas_base': false, 'OPERACIONES.zonas_servicio': false,
      'SOLICITUDES.ver_expedientes': false, 'SOLICITUDES.aprobar_conductores': false, 'SOLICITUDES.pedir_correcciones': false, 'SOLICITUDES.descargar_docs_sensibles': false,
      'USUARIOS.ver_usuarios': false, 'USUARIOS.editar_perfiles': false, 'USUARIOS.bloquear_usuarios': false, 'USUARIOS.exportar_datos': false,
      'FINANZAS.ver_balances': false, 'FINANZAS.aprobar_recargas': false, 'FINANZAS.ajustar_saldos': false, 'FINANZAS.reportes_fiscales': false,
      'MARKETING.crear_campanas': true, 'MARKETING.editar_banners': true, 'MARKETING.gestionar_aliados': true, 'MARKETING.enviar_push': true,
      'SOPORTE.atender_tickets': false, 'SOPORTE.chat_operador': false, 'SOPORTE.anular_cargos_soporte': false, 'SOPORTE.ver_historial_casos': false,
      'ADMIN.gestionar_roles': false, 'ADMIN.invitar_admin': false, 'ADMIN.ver_auditoria': false, 'ADMIN.config_seguridad': false
    }
  },
  {
    id: 'custom',
    name: 'Personalizado',
    description: 'Rol personalizado ajustable para necesidades operativas o de auditoría especiales.',
    assignedUsers: 0,
    permissions: {
      'OPERACIONES.gestionar_viajes': false, 'OPERACIONES.monitoreo_flota': true, 'OPERACIONES.tarifas_base': false, 'OPERACIONES.zonas_servicio': false,
      'SOLICITUDES.ver_expedientes': true, 'SOLICITUDES.aprobar_conductores': false, 'SOLICITUDES.pedir_correcciones': false, 'SOLICITUDES.descargar_docs_sensibles': false,
      'USUARIOS.ver_usuarios': true, 'USUARIOS.editar_perfiles': false, 'USUARIOS.bloquear_usuarios': false, 'USUARIOS.exportar_datos': false,
      'FINANZAS.ver_balances': false, 'FINANZAS.aprobar_recargas': false, 'FINANZAS.ajustar_saldos': false, 'FINANZAS.reportes_fiscales': false,
      'MARKETING.crear_campanas': false, 'MARKETING.editar_banners': false, 'MARKETING.gestionar_aliados': false, 'MARKETING.enviar_push': false,
      'SOPORTE.atender_tickets': false, 'SOPORTE.chat_operador': false, 'SOPORTE.anular_cargos_soporte': false, 'SOPORTE.ver_historial_casos': false,
      'ADMIN.gestionar_roles': false, 'ADMIN.invitar_admin': false, 'ADMIN.ver_auditoria': true, 'ADMIN.config_seguridad': false
    }
  }
];

export function renderRbacMatrix(container) {
  let roles = [...PREDEFINED_ROLES];
  let selectedRoleId = 'super_admin';

  const openNewRoleModal = () => {
    const { overlay, close } = mountDialog(container, `
      <header class="cc-command-search" style="border-bottom:1px solid var(--cc-line);padding:18px 20px;">
        <div>
          <span class="cc-eyebrow">Configurador de Seguridad</span>
          <h3 style="margin:0;font-size:16px;">Crear nuevo rol personalizado</h3>
        </div>
        <button data-dialog-close style="border:1px solid var(--cc-line);background:none;color:var(--cc-muted);border-radius:4px;padding:4px 8px;font-size:11px;">Esc</button>
      </header>
      <form id="new-role-form" style="padding:20px;display:flex;flex-direction:column;gap:14px;">
        <label class="cc-field">
          Nombre del rol
          <input required name="roleName" placeholder="Ej.: Auditor Externo Nocturno">
        </label>
        <label class="cc-field">
          Descripción de responsabilidades
          <textarea required name="roleDesc" rows="3" placeholder="Describe el alcance de este rol..."></textarea>
        </label>
        <label class="cc-field">
          Plantilla de partida
          <select name="baseTemplate">
            ${roles.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
          </select>
        </label>
        <div class="cc-gap">
          ${icon('info', 16)}
          <div>
            <strong>Configuración de rol en sesión</strong>
            <p>Este perfil se configura localmente. La sincronización remota de roles se activará con el servicio de autenticación.</p>
          </div>
        </div>
        <footer style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
          <button type="button" class="cc-button" data-dialog-close>Cancelar</button>
          <button type="submit" class="cc-button primary">${icon('check', 14)} Crear rol</button>
        </footer>
      </form>
    `, 'Nuevo Rol');

    overlay.querySelector('#new-role-form').onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const baseRole = roles.find(r => r.id === fd.get('baseTemplate')) || roles[0];
      const newRole = {
        id: `custom_${Date.now()}`,
        name: String(fd.get('roleName')).trim(),
        description: String(fd.get('roleDesc')).trim(),
        assignedUsers: 0,
        permissions: { ...baseRole.permissions }
      };
      roles.push(newRole);
      selectedRoleId = newRole.id;
      close();
      draw();
    };
  };

  const draw = () => {
    const currentRole = roles.find(r => r.id === selectedRoleId) || roles[0];
    const totalAssigned = roles.reduce((acc, r) => acc + (r.assignedUsers || 0), 0);

    container.innerHTML = `
      <div class="cc-workspace-page">
        ${pageHeader(
          'Seguridad y Accesos',
          'Roles y Permisos (RBAC)',
          'Matriz granular de privilegios administrativos clasificada en 7 dominios operativos.',
          `<button class="cc-button primary" id="btn-create-role">${icon('plus', 16)} + Crear rol</button>`
        )}

        <section class="cc-metric-strip">
          ${metric('Plantillas de roles', roles.length, 'Propuestas del editor, no roles vigentes')}
          ${metric('Miembros asignados', '—', 'No disponible')}
          ${metric('Dominios de control', PERMISSION_DOMAINS.length, '7 dominios')}
          ${metric('Gobernanza', 'JWT Servidor', 'Autorización por claims')}
        </section>

        <div class="cc-command-grid cc-rbac-layout">
          <!-- LISTA DE ROLES (SIDEBAR IZQUIERDO) -->
          <aside class="cc-panel" style="padding:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--cc-line);">
              <strong style="font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:var(--cc-muted);">Perfiles de rol</strong>
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;">
              ${roles.map(r => `
                <button type="button" class="cc-command-item ${r.id === selectedRoleId ? 'action' : ''}" data-select-role="${r.id}" style="border:1px solid ${r.id === selectedRoleId ? 'var(--cc-accent)' : 'var(--cc-line)'};border-radius:8px;padding:12px 14px;">
                  <div style="width:100%;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                      <strong style="font-size:13px;color:var(--cc-text);">${esc(r.name)}</strong>
                      <span class="cc-badge">Plantilla · sin asignación real</span>
                    </div>
                    <small style="margin-top:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(r.description)}</small>
                  </div>
                </button>
              `).join('')}
            </div>
          </aside>

          <!-- MATRIZ DETALLADA DE PERMISOS (7 DOMINIOS) -->
          <section class="cc-panel" style="padding:24px;">
            <header style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid var(--cc-line);">
              <div>
                <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:6px;">
                  <span class="cc-badge">7 dominios operativos</span>
                </div>
                <h2 style="margin:0 0 6px;font-size:20px;letter-spacing:-0.5px;">Matriz de permisos: ${esc(currentRole.name)}</h2>
                <p style="margin:0;font-size:12px;color:var(--cc-muted);">${esc(currentRole.description)}</p>
              </div>
              <button class="cc-button" id="btn-save-role-matrix" title="Guardar cambios de la matriz">${icon('check', 14)} Guardar cambios</button>
            </header>

            <div style="display:flex;flex-direction:column;gap:24px;">
              ${PERMISSION_DOMAINS.map(domain => `
                <div class="cc-rbac-domain-block" style="border:1px solid var(--cc-line);border-radius:10px;overflow:hidden;background:var(--cc-surface);">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:var(--cc-bg);border-bottom:1px solid var(--cc-line);">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span style="color:var(--cc-accent);">${icon(domain.icon, 16)}</span>
                      <strong style="font-size:13px;letter-spacing:0.4px;">${esc(domain.id)} · ${esc(domain.name)}</strong>
                    </div>
                    <small style="color:var(--cc-subtle);font-size:10px;">${esc(domain.description)}</small>
                  </div>

                  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;padding:16px;">
                    ${domain.permissions.map(perm => {
                      const permKey = `${domain.id}.${perm.id}`;
                      const isGranted = Boolean(currentRole.permissions[permKey]);
                      return `
                        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid var(--cc-line);border-radius:8px;background:var(--cc-raised);cursor:pointer;">
                          <input type="checkbox" data-perm-key="${permKey}" ${isGranted ? 'checked' : ''} style="margin-top:2px;accent-color:var(--cc-accent);">
                          <div style="flex:1;">
                            <strong style="display:block;font-size:11px;color:var(--cc-text);font-family:monospace;">${esc(perm.id)}</strong>
                            <span style="display:block;font-size:10px;color:var(--cc-muted);margin-top:2px;">${esc(perm.name)}</span>
                            <small style="display:block;font-size:9px;color:var(--cc-subtle);line-height:1.3;margin-top:2px;">${esc(perm.desc)}</small>
                          </div>
                        </label>
                      `;
                    }).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </section>
        </div>
      </div>
    `;

    container.querySelector('#btn-create-role')?.addEventListener('click', openNewRoleModal);

    container.querySelectorAll('[data-select-role]').forEach(btn => {
      btn.onclick = () => {
        selectedRoleId = btn.dataset.selectRole;
        draw();
      };
    });

    container.querySelectorAll('[data-perm-key]').forEach(input => {
      input.onchange = e => {
        const key = e.target.dataset.permKey;
        currentRole.permissions[key] = e.target.checked;
      };
    });

    container.querySelector('#btn-save-role-matrix')?.addEventListener('click', () => {
      const toastEl = document.createElement('div');
      toastEl.className = 'cc-gap';
      toastEl.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:20000;max-width:400px;box-shadow:0 10px 30px #0008;';
      toastEl.innerHTML = `${icon('check', 16)}<div><strong>Permisos actualizados en sesión</strong><p>La matriz de ${esc(currentRole.name)} se ha configurado para esta sesión administrativa.</p></div>`;
      document.body.appendChild(toastEl);
      setTimeout(() => toastEl.remove(), 4000);
    });
  };

  draw();
}
