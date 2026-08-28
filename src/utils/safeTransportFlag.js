/**
 * Bandera de VISIBILIDAD del Transporte Seguro — SAFE-TRANSPORT-1F.
 *
 * Apagada (el valor por defecto), los puntos de entrada NO EXISTEN: no se
 * renderizan deshabilitados, simplemente no están. Es defensa en profundidad
 * junto a la bandera del backend (SAFE_TRANSPORT_ENABLED): la seguridad del
 * negocio JAMÁS depende de esta bandera de interfaz — sin la del servidor,
 * toda la API responde 404 aunque alguien fuerce la UI.
 */

const VALORES_VERDADEROS = new Set(['1', 'true', 'yes', 'on']);

export function isSafeTransportUiEnabled(value = import.meta.env?.VITE_SAFE_TRANSPORT_ENABLED) {
  return VALORES_VERDADEROS.has(String(value ?? '').trim().toLowerCase());
}
