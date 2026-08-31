// `reflect-metadata` tiene que cargarse ANTES que nada de Nest: la inyeccion
// por tipos se apoya en la metadata que emite el compilador, y sin este
// import los decoradores no tienen donde guardarla.
import 'reflect-metadata';

import { pathToFileURL } from 'node:url';

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from './app.module.js';

/**
 * ARRANQUE SEPARADO — NO es el de produccion.
 *
 * Railway sigue arrancando `server/index.js`, que no ha cambiado ni una linea.
 * Este fichero existe para poder ejecutar y probar la fundacion NestJS sin
 * tocar el servicio real, y no se ejecuta en ningun despliegue.
 *
 * `crearAplicacionNest()` va SEPARADO de `listen()` a proposito: asi las
 * pruebas montan la aplicacion entera, la interrogan y la cierran sin abrir un
 * puerto. Una prueba que necesita un puerto libre es una prueba que falla sola
 * en cuanto alguien mas lo ocupa.
 */
export async function crearAplicacionNest(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    // Silencioso por defecto: el registro de arranque de Nest no aporta nada a
    // una prueba y ensucia la salida.
    logger: false
  });
  return app;
}

/**
 * Levanta el arranque de Nest en un puerto propio, distinto del backend real.
 *
 * Solo se usa a mano (`npm run dev:nest`). Nunca en produccion, y nunca a la
 * vez que el servidor legacy en el mismo puerto.
 */
export async function iniciarServidorNest(): Promise<INestApplication> {
  const puerto = Number(process.env.NEST_PORT ?? 4100);
  const app = await crearAplicacionNest();
  await app.listen(puerto);
  // Sin secretos: solo el puerto.
  console.log(`[+58express Nest] fundacion escuchando en http://localhost:${puerto}`);
  return app;
}

// Solo arranca si se ejecuta este fichero directamente, no al importarlo.
// `pathToFileURL` es la comparacion correcta: comparar cadenas de ruta falla
// en Windows por las barras y por las mayusculas de la unidad.
const ejecutadoDirectamente = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (ejecutadoDirectamente) {
  iniciarServidorNest().catch(error => {
    console.error('[+58express Nest] no se pudo arrancar:', error?.message ?? error);
    process.exitCode = 1;
  });
}
