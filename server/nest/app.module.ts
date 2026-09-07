import { Module } from '@nestjs/common';

import { HealthModule } from './health/health.module.js';

/**
 * La raiz de la aplicacion NestJS.
 *
 * Contiene UN modulo. No es minimalismo por pereza: BACKEND-ARCH-1 demuestra
 * que Nest puede convivir con el backend actual, no reemplaza nada. Cada
 * modulo que entre despues tendra su propia fase, sus pruebas de contrato y su
 * traspaso de trafico.
 */
@Module({
  imports: [HealthModule]
})
export class AppModule {}
