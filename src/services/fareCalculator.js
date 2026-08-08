import { db } from './mockDatabase.js';

// Fallback constants if db setting is missing
const DEFAULT_PRICING = {
  minFare: 1.50,
  baseFare: 0.50,
  rateKm: 0.30,
  rateMin: 0.05,
  surge: 1.0,
  bcvRate: 874.50,
  vehicleTypes: {
    MOTO: { minFare: 2.50, baseFare: 1.50, rateKm: 0.45, rateMin: 0.04 },
    CAR: { minFare: 3.50, baseFare: 2.50, rateKm: 0.70, rateMin: 0.06 }
  }
};

export const fareCalculator = {
  getPricingConfig() {
    const settings = db.findById('settings', 'pricing_config');
    return settings || DEFAULT_PRICING;
  },

  async calculateRoute(originLat, originLng, destLat, destLng) {
    try {
      // OSRM coordinates are in lng,lat format
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`);
      const data = await response.json();
      
      if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
        throw new Error('No route found');
      }

      const route = data.routes[0];
      return {
        distanceKm: route.distance / 1000,
        durationMin: route.duration / 60,
        geometry: route.geometry
      };
    } catch (error) {
      console.error('[FareCalculator] Error fetching route:', error);
      // Fallback rough estimate using Haversine if API fails
      const R = 6371; // km
      const dLat = (destLat - originLat) * Math.PI / 180;
      const dLon = (destLng - originLng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(originLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c * 1.3; // 1.3 road factor multiplier
      return {
        distanceKm: distance,
        durationMin: distance * 2.5, // roughly 24km/h average in city
        geometry: null
      };
    }
  },

  calculateFare(distanceKm, durationMin, rideType = 'MOTO') {
    const config = this.getPricingConfig();
    const normalizedType = rideType === 'CAR' ? 'CAR' : 'MOTO';
    const vehicleConfig = { ...DEFAULT_PRICING.vehicleTypes[normalizedType], ...(config.vehicleTypes?.[normalizedType] || {}) };
    
    const distanceCost = distanceKm * vehicleConfig.rateKm;
    const timeCost = durationMin * vehicleConfig.rateMin;
    let subtotal = vehicleConfig.baseFare + distanceCost + timeCost;
    
    // Apply surge multiplier
    subtotal = subtotal * config.surge;
    
    // Check min fare
    const finalFareUSD = Math.max(vehicleConfig.minFare, subtotal);
    const finalFareVES = finalFareUSD * config.bcvRate;

    return {
      fareUSD: Number(finalFareUSD.toFixed(2)),
      fareVES: Number(finalFareVES.toFixed(2)),
      rideType: normalizedType,
      breakdown: {
        baseFare: vehicleConfig.baseFare,
        distanceCost: Number(distanceCost.toFixed(2)),
        timeCost: Number(timeCost.toFixed(2)),
        surge: config.surge
      }
    };
  },

  async estimateFare(originLat, originLng, destLat, destLng) {
    const route = await this.calculateRoute(originLat, originLng, destLat, destLng);
    const fareInfo = this.calculateFare(route.distanceKm, route.durationMin);
    
    return {
      ...route,
      ...fareInfo
    };
  }
};
