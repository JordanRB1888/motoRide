/**
 * Los avisos: pedirlos y marcarlos como leídos.
 *
 * Mismo cliente, mismo token, misma sesión. Aquí no se decide nada: el servidor
 * es quien marca leído y quien filtra qué avisos son de quién —por `userId` o
 * por `targetRole`—, y esa decisión no se puede replicar en el teléfono.
 *
 * NO ES PUSH
 *
 * Esto son las notificaciones DE DENTRO de la aplicación. Las del sistema
 * operativo necesitan `expo-notifications` y son otra fase.
 */

import { leerAvisos, type Aviso } from '../domain/avisos';
import type { Resultado } from '../domain/apiResult';
import { llamar } from './api';

/** Los avisos de quien tiene la sesión abierta, los más nuevos primero. */
export async function pedirAvisos(): Promise<Resultado<readonly Aviso[]>> {
  const respuesta = await llamar<unknown>('/api/notifications/me');
  if (!respuesta.ok) return respuesta;
  // El servidor ya los ordena y los corta en 150. No se reordena aquí: dos
  // criterios de orden acaban discrepando y nadie sabe cuál manda.
  return { ok: true, datos: leerAvisos(respuesta.datos) };
}

/**
 * Marca uno como leído.
 *
 * El servidor responde con la notificación entera, pero aquí sólo importa que
 * saliera bien: el estado local lo aplica `conAvisoLeido`, que es puro y no
 * depende de la respuesta.
 */
export async function marcarLeido(id: string): Promise<Resultado<void>> {
  const respuesta = await llamar<unknown>(`/api/notifications/${encodeURIComponent(id)}/read`, {
    metodo: 'PATCH'
  });
  return respuesta.ok ? { ok: true, datos: undefined } : respuesta;
}

/** Marca todos los de esta persona. El servidor decide cuáles son suyos. */
export async function marcarTodosLeidos(): Promise<Resultado<void>> {
  const respuesta = await llamar<unknown>('/api/notifications/me/read-all', { metodo: 'PATCH' });
  return respuesta.ok ? { ok: true, datos: undefined } : respuesta;
}
