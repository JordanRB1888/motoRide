import { DEFAULT_BUSINESS_TIME_ZONE, getBusinessHour, resolveBusinessTimeZone } from './businessTime.js';

export const DEFAULT_PRICING = Object.freeze({
  vehicleTypes: {
    MOTO: { baseFareUSD: 1.5, pricePerKmUSD: 0.45, pricePerMinuteUSD: 0.04, minimumFareUSD: 2.5 },
    CAR: { baseFareUSD: 2.5, pricePerKmUSD: 0.7, pricePerMinuteUSD: 0.06, minimumFareUSD: 3.5 }
  },
  nightMultiplier: 1.2,
  peakMultiplier: 1.15,
  bcvRate: 0,
  parallelRate: 0
});

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calculateFare({ distanceKm, durationMin, requestedAt = new Date(), exchangeRateType = 'BCV', rideType = 'MOTO' }, config = {}) {
  const pricing = { ...DEFAULT_PRICING, ...config };
  const normalizedRideType = rideType === 'CAR' ? 'CAR' : 'MOTO';
  const vehiclePricing = { ...DEFAULT_PRICING.vehicleTypes[normalizedRideType], ...(pricing.vehicleTypes?.[normalizedRideType] || {}) };
  const date = new Date(requestedAt);
  // La franja nocturna y la hora pico son reglas comerciales de Venezuela: se
  // evalúan siempre en la zona del negocio, nunca en la del servidor.
  const timeZone = resolveBusinessTimeZone(pricing.timeZone || process.env.BUSINESS_TIME_ZONE || DEFAULT_BUSINESS_TIME_ZONE);
  const hour = getBusinessHour(date, timeZone);
  const isNight = hour >= 21 || hour < 6;
  const isPeak = (hour >= 7 && hour < 9) || (hour >= 16 && hour < 19);
  const subtotal = vehiclePricing.baseFareUSD + Math.max(0, distanceKm) * vehiclePricing.pricePerKmUSD + Math.max(0, durationMin) * vehiclePricing.pricePerMinuteUSD;
  const multiplier = (isNight ? pricing.nightMultiplier : 1) * (isPeak ? pricing.peakMultiplier : 1);
  const fareUSD = roundMoney(Math.max(vehiclePricing.minimumFareUSD, subtotal * multiplier));
  const exchangeRate = exchangeRateType === 'PARALLEL' ? pricing.parallelRate : pricing.bcvRate;
  return {
    fareUSD,
    fareVES: roundMoney(fareUSD * exchangeRate),
    exchangeRate,
    exchangeRateType,
    distanceKm: Number(distanceKm),
    durationMin: Number(durationMin),
    rideType: normalizedRideType,
    isNight,
    isPeak,
    timeZone,
    localHour: hour,
    multiplier: roundMoney(multiplier),
    calculatedAt: new Date().toISOString()
  };
}
