/**
 * El registro del dispositivo para push, con la sesión.
 *
 * EL PROPIETARIO LO PONE EL SERVIDOR
 *
 * Aquí no viaja ningún `userId`: el servidor lo saca del token de sesión y, si
 * llegara uno en el cuerpo, ni lo lee. Lo único que se manda es el token del
 * dispositivo y la plataforma.
 *
 * MISMO TELÉFONO, OTRA CUENTA
 *
 * El token de FCM identifica al aparato, no a la persona. Si en este teléfono
 * entra otra cuenta y registra el mismo token, el servidor REASIGNA la fila: es
 * su regla de «un teléfono que cambia de manos». Por eso al cerrar sesión se da
 * de baja la suscripción propia --mejor esfuerzo-- y al entrar se vuelve a
 * registrar. Entre las dos cosas no queda ventana en la que los avisos de la
 * cuenta anterior lleguen a la nueva.
 */

import { llamar } from './api';

export type PlataformaDePush = 'android' | 'ios';

export interface SuscripcionRegistrada {
  readonly id: string;
}

/** Alta o actualización. Devuelve `null` si push está apagado o falló la red. */
export async function registrarDispositivo(token: string, plataforma: PlataformaDePush): Promise<SuscripcionRegistrada | null> {
  if (token === '') return null;
  const respuesta = await llamar<{ id?: unknown }>('/api/push/subscriptions', {
    metodo: 'POST',
    cuerpo: { transport: 'fcm', token, platform: plataforma }
  });
  if (!respuesta.ok) return null;
  const id = respuesta.datos?.id;
  return typeof id === 'string' && id !== '' ? { id } : null;
}

/**
 * Baja de la suscripción propia. Mejor esfuerzo: si no hay red al cerrar
 * sesión, el servidor la reasignará igualmente cuando otra cuenta registre el
 * mismo token, y la cuenta que se fue ya no tiene sesión con la que abrir nada.
 */
export async function darDeBajaDispositivo(id: string): Promise<boolean> {
  if (id === '') return false;
  const respuesta = await llamar<unknown>(`/api/push/subscriptions/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
  return respuesta.ok;
}
