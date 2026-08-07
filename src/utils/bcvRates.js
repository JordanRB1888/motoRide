/**
 * Centralized BCV Official Exchange Rate Service (Euro EUR / VES)
 */

// Official BCV Euro Rate fallback (updated to official BCV Euro reference)
export const BCV_EURO_RATE = 874.50; 

export function getBcvEuroRate() {
  return BCV_EURO_RATE;
}

export function eurToVes(amountEur) {
  return amountEur * getBcvEuroRate();
}

export function formatVes(amountEur) {
  const ves = eurToVes(amountEur);
  return `Bs. ${ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatEur(amountEur) {
  return `€${amountEur.toFixed(2)} EUR`;
}
