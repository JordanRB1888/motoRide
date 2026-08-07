export function createStatusBadge(status, text) {
  const configs = {
    online: { color: '#00E676', bg: 'rgba(0, 230, 118, 0.1)', pulse: true },
    offline: { color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.1)', pulse: false },
    busy: { color: '#FFC107', bg: 'rgba(255, 193, 7, 0.1)', pulse: true },
    en_route: { color: '#00D2FF', bg: 'rgba(0, 210, 255, 0.1)', pulse: true },
    in_trip: { color: '#FFAB00', bg: 'rgba(255, 171, 0, 0.1)', pulse: true },
    pending: { color: '#FFC107', bg: 'rgba(255, 193, 7, 0.1)', pulse: false },
    approved: { color: '#00E676', bg: 'rgba(0, 230, 118, 0.1)', pulse: false },
    rejected: { color: '#FF4D4D', bg: 'rgba(255, 77, 77, 0.1)', pulse: false }
  };

  const config = configs[status] || configs.offline;
  
  const pulseHtml = config.pulse 
    ? `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${config.color}; margin-right:6px; box-shadow:0 0 6px ${config.color}; animation:badge-pulse 2s infinite;"></span>`
    : `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${config.color}; margin-right:6px;"></span>`;

  // Inject keyframes if not present
  if (config.pulse && typeof document !== 'undefined' && !document.getElementById('badge-animations')) {
    const style = document.createElement('style');
    style.id = 'badge-animations';
    style.innerHTML = `
      @keyframes badge-pulse {
        0% { transform: scale(0.95); opacity: 0.8; }
        50% { transform: scale(1.2); opacity: 1; }
        100% { transform: scale(0.95); opacity: 0.8; }
      }
    `;
    document.head.appendChild(style);
  }

  return `
    <div style="display:inline-flex; items-align:center; padding:4px 12px; border-radius:16px; background:${config.bg}; border:1px solid ${config.color}40; color:${config.color}; font-size:12px; font-weight:600; text-transform:capitalize; white-space:nowrap; align-items:center;">
      ${pulseHtml}
      ${text || status.replace('_', ' ')}
    </div>
  `;
}
