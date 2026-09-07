/**
 * Buscar el destino escribiéndolo.
 *
 * LA BÚSQUEDA LA HACE EL SERVIDOR
 *
 * Aquí no hay ninguna credencial de Google, y no puede haberla: cualquier
 * `EXPO_PUBLIC_*` viaja dentro del APK y se lee descompilándolo, así que una
 * clave de Places puesta aquí sería una factura abierta para quien la sacara.
 * El servidor la firma con su cuenta de servicio y esta pantalla sólo ve
 * resultados. Todo el porqué está en `server/services/placesClient.js`.
 */

import { llamar } from './api';

export interface LugarEncontrado {
  readonly id: string;
  readonly nombre: string;
  readonly direccion: string | null;
  readonly lat: number;
  readonly lng: number;
}

/** Por qué no hay resultados. Cada motivo se enseña distinto. */
export type FalloDeBusqueda = 'SIN_RED' | 'CORTA' | 'NO_DISPONIBLE' | 'ERROR';

export type ResultadoDeBusqueda =
  | { readonly ok: true; readonly lugares: readonly LugarEncontrado[] }
  | { readonly ok: false; readonly motivo: FalloDeBusqueda };

/** Menos de esto no es una búsqueda: es una tecla a medio escribir. */
export const MINIMO_PARA_BUSCAR = 3;

/**
 * Busca lugares por texto, sesgando hacia dónde está quien pregunta.
 *
 * `cerca` es opcional a propósito: quien todavía no tiene ubicación —permiso
 * denegado, GPS frío— tiene que poder buscar igual, aunque los resultados
 * salgan menos ordenados.
 */
export async function buscarLugares(
  texto: string,
  cerca?: { readonly lat: number; readonly lng: number } | null
): Promise<ResultadoDeBusqueda> {
  const consulta = texto.trim();
  if (consulta.length < MINIMO_PARA_BUSCAR) return { ok: false, motivo: 'CORTA' };

  const parametros = new URLSearchParams({ q: consulta });
  if (cerca && Number.isFinite(cerca.lat) && Number.isFinite(cerca.lng)) {
    parametros.set('lat', String(cerca.lat));
    parametros.set('lng', String(cerca.lng));
  }

  const respuesta = await llamar<{ results: LugarEncontrado[] }>(
    `/api/places/search?${parametros.toString()}`
  );

  if (!respuesta.ok) {
    if (respuesta.motivo === 'SIN_RED' || respuesta.motivo === 'TIEMPO_AGOTADO') {
      return { ok: false, motivo: 'SIN_RED' };
    }
    // 503: el servidor no tiene con qué buscar. No es culpa de quien escribe y
    // se dice distinto, porque insistir no lo va a arreglar.
    if (respuesta.estadoHttp === 503) return { ok: false, motivo: 'NO_DISPONIBLE' };
    return { ok: false, motivo: 'ERROR' };
  }

  return { ok: true, lugares: respuesta.datos.results ?? [] };
}
