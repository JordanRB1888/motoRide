// Etiqueta legible del método de pago de un viaje.
//
// El servidor devuelve los métodos en su forma canónica (WALLET, CASH,
// PAGO_MOVIL, ZELLE, ZINLI), mientras que los viajes antiguos y algunas
// pantallas todavía usan las variantes en minúscula (wallet, cash_usd,
// pago_movil). Se normaliza aquí para que ambas formas muestren lo mismo, en
// vez de repetir el mapa en cada componente.

const LABELS = Object.freeze({
  WALLET: 'Billetera +58Express',
  BILLETERA: 'Billetera +58Express',
  BILLETERA_EXPRESS: 'Billetera +58Express',
  WALLET_PENDING: 'Billetera +58Express',
  CASH: 'Efectivo USD',
  CASH_USD: 'Efectivo USD',
  EFECTIVO: 'Efectivo USD',
  CASH_VES: 'Efectivo Bs.',
  PAGO_MOVIL: 'Pago móvil',
  PAGOMOVIL: 'Pago móvil',
  ZELLE: 'Zelle',
  ZINLI: 'Zinli',
  TRANSFERENCIA: 'Transferencia'
});

export const DEFAULT_PAYMENT_LABEL = 'Efectivo USD';

export function paymentLabel(method) {
  if (typeof method !== 'string') return DEFAULT_PAYMENT_LABEL;
  const key = method.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return LABELS[key] || DEFAULT_PAYMENT_LABEL;
}

/** true cuando la carrera se cobra con la billetera de la plataforma. */
export function isWalletPaymentLabel(method) {
  if (typeof method !== 'string') return false;
  const key = method.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return key === 'WALLET' || key === 'BILLETERA' || key === 'BILLETERA_EXPRESS' || key === 'WALLET_PENDING';
}
