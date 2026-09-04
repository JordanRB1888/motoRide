/**
 * El servicio de desafios: `sendVerification` y `verifyChallenge`.
 *
 * Es la unica puerta a `database.authChallenges`. Compone el dominio puro de
 * `domain/otpChallenge.js` con la autoridad de normalizacion de contactos y
 * con los adaptadores de envio, y anade lo que solo tiene sentido aqui: que
 * haya UN desafio vivo por destino+canal+proposito+usuario, el enfriamiento
 * de reenvio, los limites de tasa y el barrido de vencidos.
 *
 * LA BASE DE DATOS ES LA AUTORIDAD
 *
 * Los intentos, el vencimiento y el consumo viven en el registro del desafio,
 * que se persiste. Si el servidor se reinicia, un codigo ya usado sigue
 * usado. Lo unico que vive solo en memoria son los CONTADORES de tasa por
 * destino y por origen, y esa es precisamente la parte que un dia iria a
 * Redis: perderlos en un reinicio relaja el limite unos minutos, no rompe la
 * seguridad del codigo.
 *
 * NUNCA, EN NINGUNA RAMA, SE REGISTRA EL CODIGO.
 */
import { randomUUID } from 'node:crypto';
import {
  TIPO_DE_CONTACTO_POR_CANAL,
  RESULTADO,
  crearDesafio,
  desafioPublico,
  esCanalConocido,
  esPropositoConocido,
  esperaParaReenviar,
  estaVivo,
  invalidar,
  verificarCodigo
} from '../domain/otpChallenge.js';
import { valorNormalizadoDeContacto } from '../domain/contactos.js';

/**
 * Limites de tasa, por ventana de quince minutos. Son distintos del limitador
 * HTTP por direccion: aqui la clave es el DESTINO, porque lo que hay que
 * impedir es bombardear un telefono ajeno desde muchas direcciones.
 */
export const LIMITES = Object.freeze({
  VENTANA_MS: 15 * 60 * 1000,
  POR_DESTINO: 5,
  POR_ORIGEN: 10,
  /** Cuanto se conserva un desafio muerto antes de barrerlo. */
  RETENCION_TRAS_VENCER_MS: 60 * 60 * 1000
});

/** Un contador deslizante en memoria. Candidato a Redis: ver el informe. */
function crearContador({ ventanaMs, limite, now }) {
  const marcas = new Map();
  return {
    /** Devuelve 0 si cabe, o cuantos ms faltan para que quepa. */
    consumir(clave) {
      const ahora = now().getTime();
      const vivas = (marcas.get(clave) ?? []).filter(t => t > ahora - ventanaMs);
      if (vivas.length >= limite) {
        marcas.set(clave, vivas);
        return vivas[0] + ventanaMs - ahora;
      }
      vivas.push(ahora);
      marcas.set(clave, vivas);
      return 0;
    }
  };
}

export function createVerificationService({
  database,
  secreto,
  proveedores,
  now = () => new Date(),
  nuevoId = () => randomUUID()
}) {
  if (!database) throw new Error('VERIFICATION_REQUIRES_DATABASE');
  if (typeof secreto !== 'string' || secreto.length < 16) throw new Error('VERIFICATION_REQUIRES_SECRET');
  if (!proveedores) throw new Error('VERIFICATION_REQUIRES_PROVIDERS');
  database.authChallenges ??= [];

  const porDestino = crearContador({ ventanaMs: LIMITES.VENTANA_MS, limite: LIMITES.POR_DESTINO, now });
  const porOrigen = crearContador({ ventanaMs: LIMITES.VENTANA_MS, limite: LIMITES.POR_ORIGEN, now });

  function reemplazar(desafio) {
    const indice = database.authChallenges.findIndex(d => d.id === desafio.id);
    if (indice === -1) database.authChallenges.push(desafio);
    else database.authChallenges[indice] = desafio;
    return desafio;
  }

  function vivoPara({ destination, channel, purpose, userId }) {
    const ahora = now();
    return (
      database.authChallenges.find(
        d =>
          d.destination === destination &&
          d.channel === channel &&
          d.purpose === purpose &&
          (d.userId ?? null) === (userId ?? null) &&
          estaVivo(d, ahora)
      ) ?? null
    );
  }

  /** Quita los desafios muertos hace mas de una hora. Se llama al enviar. */
  function barrer() {
    const limite = now().getTime() - LIMITES.RETENCION_TRAS_VENCER_MS;
    const antes = database.authChallenges.length;
    database.authChallenges = database.authChallenges.filter(d => new Date(d.expiresAt).getTime() > limite);
    return antes - database.authChallenges.length;
  }

  /**
   * Crea y envia un desafio. Devuelve `{ ok: true, desafio }` con la vista
   * publica, o `{ ok: false, error, retryAfterMs? }`.
   *
   * `origen` es la clave del limite por quien pide: `user:<id>` si hay sesion,
   * `ip:<direccion>` si no. La decide el router; aqui solo se cuenta.
   *
   * Solo muta `database` si todo salio bien; si el proveedor no entrega, el
   * desafio no se guarda, para que un envio fallido no deje un desafio vivo
   * que bloquee el reintento por enfriamiento.
   */
  async function sendVerification({ channel, destination, purpose, userId = null, origen }) {
    if (!esCanalConocido(channel)) return { ok: false, error: 'INVALID_CHANNEL' };
    if (!esPropositoConocido(purpose)) return { ok: false, error: 'INVALID_PURPOSE' };

    const tipo = TIPO_DE_CONTACTO_POR_CANAL[channel];
    const destino = valorNormalizadoDeContacto(tipo, destination);
    if (!destino) return { ok: false, error: 'INVALID_DESTINATION' };

    const proveedor = proveedores[channel];
    if (!proveedor?.configurado()) return { ok: false, error: 'VERIFICATION_PROVIDER_NOT_CONFIGURED' };

    // El enfriamiento se comprueba ANTES que los limites: un reintento
    // demasiado pronto no debe gastar cupo.
    const previo = vivoPara({ destination: destino, channel, purpose, userId });
    const espera = esperaParaReenviar(previo, now());
    if (espera > 0) return { ok: false, error: 'RESEND_COOLDOWN', retryAfterMs: espera };

    const esperaDestino = porDestino.consumir(`${channel}:${destino}`);
    if (esperaDestino > 0) return { ok: false, error: 'RATE_LIMITED', scope: 'destination', retryAfterMs: esperaDestino };
    if (origen) {
      const esperaOrigen = porOrigen.consumir(origen);
      if (esperaOrigen > 0) return { ok: false, error: 'RATE_LIMITED', scope: 'origin', retryAfterMs: esperaOrigen };
    }

    barrer();

    const ahora = now();
    const { registro, codigo } = crearDesafio({
      id: `chal_${nuevoId()}`,
      secreto,
      channel,
      purpose,
      destination: destino,
      userId,
      now: ahora
    });

    const entrega = await proveedor.enviar({ destination: destino, codigo, purpose });
    if (!entrega.delivered) {
      return { ok: false, error: 'VERIFICATION_SEND_FAILED', reason: entrega.reason };
    }

    // Un solo desafio vivo por atadura: el anterior, si sobrevivio al
    // enfriamiento, se cierra. Su codigo deja de valer.
    if (previo) reemplazar(invalidar(previo, ahora));
    reemplazar(registro);
    return { ok: true, desafio: desafioPublico(registro, ahora) };
  }

  /**
   * Verifica un codigo. `esperado` ata la verificacion al proposito (siempre)
   * y, si se dan, al destino, al canal y al usuario. Devuelve el resultado del
   * dominio y, con `OK`, el desafio consumido --con su `destination` y su
   * `channel`, que es lo que el router necesita para marcar el contacto.
   */
  function verifyChallenge({ challengeId, code, esperado }) {
    if (!esperado || !esPropositoConocido(esperado.purpose)) return { ok: false, resultado: RESULTADO.NO_COINCIDE };
    const desafio = database.authChallenges.find(d => d.id === challengeId) ?? null;
    const { resultado, desafio: actualizado } = verificarCodigo({ desafio, codigo: code, secreto, esperado, now: now() });
    if (actualizado && actualizado !== desafio) reemplazar(actualizado);
    return { ok: resultado === RESULTADO.OK, resultado, desafio: actualizado };
  }

  return { sendVerification, verifyChallenge, barrer, vivoPara };
}
