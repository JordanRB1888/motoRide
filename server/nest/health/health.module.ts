import { Module } from '@nestjs/common';

import { proveedorDeReloj } from '../system/clock.provider.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/** El primer modulo: salud del servicio, sin base de datos y sin secretos. */
@Module({
  controllers: [HealthController],
  providers: [proveedorDeReloj, HealthService],
  exports: [HealthService]
})
export class HealthModule {}
