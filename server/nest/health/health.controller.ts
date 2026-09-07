import { Controller, Get } from '@nestjs/common';

import { HealthService, type RespuestaDeSalud } from './health.service.js';

/**
 * El mismo camino que sirve hoy `server/index.js`: `GET /api/health`.
 *
 * Se reproduce el contrato EXACTO —mismo estado, misma forma, misma
 * semantica— para poder compararlos en una prueba. No se registra en el
 * servidor de produccion: vive en el arranque separado de Nest, que Railway no
 * usa.
 */
@Controller('api/health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  obtener(): RespuestaDeSalud {
    return this.health.obtenerEstado();
  }
}
