import { Inject, Injectable } from '@nestjs/common';

import { RELOJ, type Reloj } from '../system/clock.provider.js';

/**
 * Las capacidades que el backend declara estar sirviendo.
 *
 * Se reproduce EXACTAMENTE lo que devuelve hoy `/api/health` en
 * `server/index.js`. No se añade, no se quita y no se renombra nada: el
 * objetivo de este módulo es demostrar que NestJS puede servir un contrato ya
 * existente sin alterarlo, no proponer uno mejor.
 */
export interface CaracteristicasDeSalud {
  readonly livePassengerGpsOrigin: boolean;
  readonly idempotentWalletRideSettlement: boolean;
  readonly resilientDriverApplications: boolean;
  readonly driverCommissionDebtLedger: boolean;
}

/** La forma completa de la respuesta de salud, tal cual la conoce el cliente. */
export interface RespuestaDeSalud {
  readonly status: 'ok';
  readonly message: string;
  readonly features: CaracteristicasDeSalud;
  readonly timestamp: number;
}

/**
 * El estado de salud del servicio.
 *
 * Es deliberadamente PURO: no toca la base de datos, no lee variables de
 * entorno, no abre sockets y no publica nada sensible. Esa pureza es lo que lo
 * hace un buen primer módulo — se puede probar de verdad sin infraestructura,
 * y no hay forma de que filtre un secreto.
 *
 * La única dependencia es el reloj, y está inyectada a propósito: es lo que
 * convierte `timestamp` en algo comprobable en una prueba en vez de un valor
 * que solo se puede mirar de reojo.
 */
@Injectable()
export class HealthService {
  constructor(@Inject(RELOJ) private readonly reloj: Reloj) {}

  obtenerEstado(): RespuestaDeSalud {
    return {
      status: 'ok',
      message: '+58express Real Backend Server Active 🇻🇪',
      features: {
        livePassengerGpsOrigin: true,
        idempotentWalletRideSettlement: true,
        resilientDriverApplications: true,
        driverCommissionDebtLedger: true
      },
      timestamp: this.reloj.ahora()
    };
  }
}
