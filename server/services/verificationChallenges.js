/**
 * El servicio de desafios: `sendVerification` y `verifyChallenge`.
 *
 * Es la unica puerta a `database.authChallenges`. Compone el dominio puro de
 * `domain/otpChallenge.js` con la autoridad de normalizacion de contactos y
 * con los adaptadores de envio, y anade lo que solo tiene sentido aqui: la
 * atadura por destino, el enfriamiento, la guardia de envios simultaneos, los
 * limites de tasa, la clasificacion de la entrega y el barrido de vencidos.
 *
 * LA ATADURA ES POR DESTINO Y PROPOSITO, NO POR CANAL (AUTH-FINAL-2)
 *
 * Antes habia un desafio vivo por destino+canal+proposito+usuario. Eso dejaba
 * dos agujeros: pedir por WhatsApp y acto seguido por SMS creaba DOS codigos
 * validos a la vez para lo mismo, y encadenar canales esquivaba los sesenta
 * segundos de enfriamiento. Ahora la clave no incluye el canal: cambiar de
 * canal invalida el codigo anterior y respeta el mismo enfriamiento.
 *
 * DOS ENVIOS A LA VEZ SON UN SOLO ENVIO
 *
 * Entre comprobar el enfriamiento y guardar el desafio hay un `await`: el
 * envio real. Dos peticiones simultaneas pasaban las dos la comprobacion y
 * mandaban dos mensajes --dos veces el coste y dos mensajes al telefono de
 * alguien. La reserva de `enviosEnVuelo` se toma ANTES del await, de forma
 * sincrona, y se libera siempre.
 *
 * LA BASE DE DATOS ES LA AUTORIDAD
 *
 * Intentos, vencimiento y consumo viven en el registro persistido. Lo unico en
 * memoria son los contadores de tasa y la reserva de envios en vuelo, y esa es
 * justamente la parte que un dia iria a Redis.
 *
 * NUNCA, EN NINGUNA RAMA, SE REGISTRA EL CODIGO NI EL DESTINO COMPLETO.
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
import { enmascararContacto, valorNormalizadoDeContacto } from '../domain/contactos.js';
import { RESULTADO_DE_ENVIO } from './verificationTransport.js';

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
    },
    /** Devuelve el consumo sin gastarlo. Para decidir sin penalizar. */
    devolver(clave) {
      const marcas_ = marcas.get(clave);
      if (marcas_?.length) marcas_.pop();
    }
  };
}

export function createVerificationService({
  database,
  secreto,
  proveedores,
  now = () => new Date(),
  nuevoId = () => randomUUID(),
  /**
   * Diagnostico. Recibe SOLO metadata segura: canal, proveedor, proposito,
   * categoria del resultado, latencia y el destino ENMASCARADO. Nunca el
   * codigo, el destino completo ni credencial alguna.
   */
  registrar = () => {}
}) {
  if (!database) throw new Error('VERIFICATION_REQUIRES_DATABASE');
  if (typeof secreto !== 'string' || secreto.length < 16) throw new Error('VERIFICATION_REQUIRES_SECRET');
  if (!proveedores) throw new Error('VERIFICATION_REQUIRES_PROVIDERS');
  database.authChallenges ??= [];

  const porDestino = crearContador({ ventanaMs: LIMITES.VENTANA_MS, limite: LIMITES.POR_DESTINO, now });
  const porOrigen = crearContador({ ventanaMs: LIMITES.VENTANA_MS, limite: LIMITES.POR_ORIGEN, now });

  /** Claves con un envio en curso. Se toma y se suelta en la misma vuelta. */
  const enviosEnVuelo = new Set();

  /** La atadura: destino, proposito y usuario. El canal NO entra. */
  function claveDeAtadura({ destination, purpose, userId }) {
    return `${purpose}|${destination}|${userId ?? ''}`;
  }

  function reemplazar(desafio) {
    const indice = database.authChallenges.findIndex(d => d.id === desafio.id);
    if (indice === -1) database.authChallenges.push(desafio);
    else database.authChallenges[indice] = desafio;
    return desafio;
  }

  /** El desafio vivo de esa atadura, venga del canal que venga. */
  function vivoPara({ destination, purpose, userId }) {
    const ahora = now();
    return (
      database.authChallenges.find(
        d =>
          d.destination === destination &&
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
   * Crea y envia un desafio. Devuelve `{ ok, desafio }` con la vista publica,
   * o `{ ok: false, error, retryAfterMs? }`.
   *
   * `origen` es la clave del limite por quien pide: `user:<id>` con sesion,
   * `ip:<direccion>` sin ella. La decide el router; aqui solo se cuenta.
   */
  async function sendVerification({ channel, destination, purpose, userId = null, origen }) {
    if (!esCanalConocido(channel)) return { ok: false, error: 'INVALID_CHANNEL' };
    if (!esPropositoConocido(purpose)) return { ok: false, error: 'INVALID_PURPOSE' };

    const tipo = TIPO_DE_CONTACTO_POR_CANAL[channel];
    const destino = valorNormalizadoDeContacto(tipo, destination);
    if (!destino) return { ok: false, error: 'INVALID_DESTINATION' };

    const proveedor = proveedores[channel];
    if (!proveedor?.configurado()) {
      return { ok: false, error: 'VERIFICATION_PROVIDER_NOT_CONFIGURED', channel };
    }

    const atadura = { destination: destino, purpose, userId };
    const clave = claveDeAtadura(atadura);

    // La guardia va lo PRIMERO de todo lo que muta: si hay un envio en curso
    // para esta misma atadura, este no llega ni a mirar el enfriamiento.
    if (enviosEnVuelo.has(clave)) return { ok: false, error: 'SEND_IN_PROGRESS' };

    // El enfriamiento se comprueba antes que los limites: un reintento
    // demasiado pronto no debe gastar cupo.
    const previo = vivoPara(atadura);
    const espera = esperaParaReenviar(previo, now());
    if (espera > 0) return { ok: false, error: 'RESEND_COOLDOWN', retryAfterMs: espera };

    const esperaDestino = porDestino.consumir(`${destino}`);
    if (esperaDestino > 0) {
      return { ok: false, error: 'RATE_LIMITED', scope: 'destination', retryAfterMs: esperaDestino };
    }
    const claveDeOrigen = origen ?? null;
    if (claveDeOrigen) {
      const esperaOrigen = porOrigen.consumir(claveDeOrigen);
      if (esperaOrigen > 0) {
        porDestino.devolver(`${destino}`);
        return { ok: false, error: 'RATE_LIMITED', scope: 'origin', retryAfterMs: esperaOrigen };
      }
    }

    enviosEnVuelo.add(clave);
    try {
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
      const destinoEnmascarado = enmascararContacto(tipo, destino);
      registrar({
        evento: 'otp.send',
        channel,
        purpose,
        destino: destinoEnmascarado,
        resultado: entrega.resultado,
        motivo: entrega.motivo ?? null,
        latenciaMs: entrega.latenciaMs ?? 0
      });

      if (entrega.resultado === RESULTADO_DE_ENVIO.RECHAZADO) {
        // El mensaje NO salio: no se guarda desafio y no se gasta
        // enfriamiento. El usuario puede probar otro canal en el acto.
        porDestino.devolver(`${destino}`);
        if (claveDeOrigen) porOrigen.devolver(claveDeOrigen);
        return { ok: false, error: 'VERIFICATION_SEND_FAILED', reason: entrega.motivo, channel };
      }

      // Entregado o ambiguo: en los dos casos el codigo PUDO llegar, asi que
      // el desafio se guarda y el anterior --de este canal o de otro-- muere.
      // Solo la entrega confirmada activa el enfriamiento.
      const confirmada = entrega.resultado === RESULTADO_DE_ENVIO.ENTREGADO;
      registro.deliveryConfirmed = confirmada;
      if (previo) reemplazar(invalidar(previo, ahora));
      reemplazar(registro);

      return {
        ok: true,
        desafio: desafioPublico(registro, ahora),
        deliveryConfirmed: confirmada,
        destinoEnmascarado,
        ...(confirmada ? {} : { warning: 'DELIVERY_UNCONFIRMED', reason: entrega.motivo })
      };
    } finally {
      enviosEnVuelo.delete(clave);
    }
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
    if (actualizado) {
      registrar({
        evento: 'otp.verify',
        channel: actualizado.channel,
        purpose: actualizado.purpose,
        destino: enmascararContacto(TIPO_DE_CONTACTO_POR_CANAL[actualizado.channel], actualizado.destination),
        resultado,
        intentos: actualizado.attempts
      });
    }
    return { ok: resultado === RESULTADO.OK, resultado, desafio: actualizado };
  }

  /**
   * Que canales puede ofrecer la aplicacion. Un canal sin configurar NO se
   * ofrece: pintarlo seria un boton que no lleva a ninguna parte.
   */
  function canalesDisponibles() {
    return Object.keys(TIPO_DE_CONTACTO_POR_CANAL).map(canal => ({
      channel: canal,
      contactType: TIPO_DE_CONTACTO_POR_CANAL[canal],
      available: proveedores[canal]?.configurado() === true
    }));
  }

  return { sendVerification, verifyChallenge, canalesDisponibles, barrer, vivoPara };
}
