import type { RepositorioWeb } from "@/lib/datos";

/**
 * Límite de peticiones, reutilizable.
 *
 * Se apoya en el almacén y **no en memoria**. En un despliegue sin servidor cada
 * petición puede caer en una instancia distinta y recién arrancada: un contador
 * en memoria protegería de un robot que tuviera la mala suerte de repetir
 * instancia, es decir, de ninguno. Una protección que sólo funciona a veces es
 * peor que ninguna, porque se cree que está.
 */

export const LIMITES = {
  /** Altas en la lista: 5 por hora y por huella de IP. */
  waitlistPorIp: { limite: 5, ventanaMs: 60 * 60 * 1000 },
  /** Reenvío del correo de confirmación: 1 cada 10 minutos por dirección. */
  confirmacionPorEmail: { ventanaMs: 10 * 60 * 1000 },
  /** Comercios: 5 por hora y por huella de IP, el mismo criterio. */
  aliadosPorIp: { limite: 5, ventanaMs: 60 * 60 * 1000 },
} as const;

export async function superaLimite(
  repo: RepositorioWeb,
  clave: string,
  { limite, ventanaMs }: { limite: number; ventanaMs: number },
  ahora: number = Date.now(),
): Promise<boolean> {
  const intentos = await repo.contarIntentos(clave, ventanaMs, ahora);
  return intentos > limite;
}

/**
 * ¿Se le mandó un correo hace demasiado poco?
 *
 * Protege dos cosas a la vez: que nadie use el formulario para bombardear un
 * buzón ajeno, y la reputación del dominio, que es lo que se quema cuando un
 * servidor manda de más.
 */
export async function envioDemasiadoReciente(
  repo: RepositorioWeb,
  email: string,
  ahora: number = Date.now(),
): Promise<boolean> {
  const ultimo = await repo.ultimoEnvioDeConfirmacion(email);
  if (!ultimo) return false;
  return ahora - new Date(ultimo).getTime() < LIMITES.confirmacionPorEmail.ventanaMs;
}
