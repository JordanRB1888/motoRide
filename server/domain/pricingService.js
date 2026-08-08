export const DEFAULT_PRICING = Object.freeze({
  baseFareUSD: 1.5,
  pricePerKmUSD: 0.45,
  pricePerMinuteUSD: 0.04,
  minimumFareUSD: 2.5,
  nightMultiplier: 1.2,
  peakMultiplier: 1.15,
  bcvRate: 0,
  parallelRate: 0
});

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calculateFare({ distanceKm, durationMin, requestedAt = new Date(), exchangeRateType = 'BCV' }, config = {}) {
  const pricing = { ...DEFAULT_PRICING, ...config };
  const date = new Date(requestedAt);
  const hour = date.getHours();
  const isNight = hour >= 21 || hour < 6;
  const isPeak = (hour >= 7 && hour < 9) || (hour >= 16 && hour < 19);
  const subtotal = pricing.baseFareUSD + Math.max(0, distanceKm) * pricing.pricePerKmUSD + Math.max(0, durationMin) * pricing.pricePerMinuteUSD;
  const multiplier = (isNight ? pricing.nightMultiplier : 1) * (isPeak ? pricing.peakMultiplier : 1);
  const fareUSD = roundMoney(Math.max(pricing.minimumFareUSD, subtotal * multiplier));
  const exchangeRate = exchangeRateType === 'PARALLEL' ? pricing.parallelRate : pricing.bcvRate;
  return {
    fareUSD,
    fareVES: roundMoney(fareUSD * exchangeRate),
    exchangeRate,
    exchangeRateType,
    distanceKm: Number(distanceKm),
    durationMin: Number(durationMin),
    isNight,
    isPeak,
    multiplier: roundMoney(multiplier),
    calculatedAt: new Date().toISOString()
  };
}
