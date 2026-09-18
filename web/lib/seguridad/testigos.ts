import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 48 horas: tiempo de sobra para abrir un correo, poco para que el enlace ande suelto. */
export const VIGENCIA_CONFIRMACION_MS = 48 * 60 * 60 * 1000;

/**
 * Testigo criptográficamente seguro.
 *
 * 32 bytes de `randomBytes` en base64url: 256 bits de entropía, imposible de
 * adivinar y seguro de poner en una URL sin escapar nada. `Math.random()` no
 * sirve aquí ni de lejos —es predecible— y un identificador secuencial dejaría
 * que cualquiera confirmara la inscripción de otro probando números.
 */
export function nuevoTestigo(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Huella de la dirección IP.
 *
 * La IP es un dato personal y no hace falta guardarla: lo único que se necesita
 * es saber si dos peticiones vienen del mismo sitio. Un HMAC con sal secreta da
 * exactamente eso y nada más — y sin la sal, la huella no se puede revertir ni
 * comparando contra el espacio entero de direcciones, que es lo que sí permitiría
 * un SHA-256 pelado.
 */
export function huellaDeIp(ip: string, sal: string | undefined): string | null {
  if (!ip || !sal) return null;
  return createHmac("sha256", sal).update(ip).digest("base64url").slice(0, 32);
}

/**
 * Comparación de testigos en tiempo constante.
 *
 * Comparar con `===` filtra por el tiempo de respuesta cuántos caracteres
 * coinciden, y eso permite reconstruir un testigo a fuerza de intentos.
 */
export function testigosIguales(a: string, b: string): boolean {
  const A = Buffer.from(a ?? "", "utf8");
  const B = Buffer.from(b ?? "", "utf8");
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

/** La IP de quien pide, según las cabeceras que pone Vercel. */
export function ipDeLaPeticion(cabeceras: Headers): string {
  const reenviada = cabeceras.get("x-forwarded-for");
  if (reenviada) return reenviada.split(",")[0].trim();
  return cabeceras.get("x-real-ip") ?? "";
}
