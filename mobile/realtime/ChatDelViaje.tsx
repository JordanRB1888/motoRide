/**
 * La conversación de un viaje, en vivo.
 *
 * DE DÓNDE SALEN LOS MENSAJES
 *
 * De dos sitios, y hay que casarlos. El historial se pide por HTTP al abrir y
 * al reconectar: es la fuente durable, la que sobrevive a cerrar la aplicación.
 * Los nuevos caen por el socket, y ese mismo evento es también el ACUSE de los
 * propios: un mensaje no se da por enviado hasta que vuelve por ahí.
 *
 * Juntarlos sin duplicar es cosa de `domain/chatDelViaje`; aquí sólo se
 * decide cuándo pedir y cuándo escuchar.
 *
 * NI UNA COPIA DEL VIAJE
 *
 * El viaje viene de `useViajeActivo`, que ya lo tiene y ya se recarga con el
 * servidor. Si el chat guardara el suyo, habría dos verdades sobre en qué
 * estado está la carrera, y la que decidiría si se puede escribir sería la
 * equivocada justo cuando termina.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  conHistorial,
  conMensaje,
  enPantalla,
  estadoDeLaPantalla,
  marcarFallida,
  motivoDelFallo,
  pendienteDe,
  reactivarPendiente,
  sePuedeEscribir,
  sinPendiente,
  textoParaEnviar,
  type EstadoDeLaPantalla,
  type MensajeEnPantalla
} from '../domain/chatDelViaje';
import { leerMensajes, type DetalleReal, type MensajeReal } from '../domain/viajes';
import { pedirMensajes } from '../services/viajes';
import type { ImagenDeChat } from '../domain/imagenDeChat';
import { enviarMensajeDeChat } from './socket';
import { useEvento, useResync, useTiempoReal } from './ProveedorDeTiempoReal';
import { useViajeActivo } from './ViajeActivo';

export interface ChatDelViaje {
  /** El viaje del que se habla, o `null` si no hay ninguno. */
  readonly viaje: DetalleReal | null;
  readonly estado: EstadoDeLaPantalla;
  readonly mensajes: readonly MensajeEnPantalla[];
  /** Con contenido en pantalla y sin red, o recargando: se avisa sin borrar. */
  readonly aviso: string | null;
  readonly sePuedeEscribir: boolean;
  readonly hayConexion: boolean;
  /** Qué rechazó el servidor la última vez, en castellano, o `null`. */
  readonly fallo: string | null;
  readonly enviar: (texto: string) => void;
  /** Manda una imagen ya elegida y validada por `services/imagenDeChat`. */
  readonly enviarImagen: (imagen: ImagenDeChat) => void;
  /** Reintenta una imagen fallida por su clave, sin volver a elegirla. */
  readonly reintentarImagen: (claveDeIntento: string) => void;
  readonly reintentar: () => void;
}

/** Una clave por intento. No es un id: es lo que reconoce el reintento. */
function claveDeIntento(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function useChatDelViaje({ miId, miNombre }: {
  readonly miId: string;
  readonly miNombre: string;
}): ChatDelViaje {
  const { viaje } = useViajeActivo();
  const { estado: conexion } = useTiempoReal();
  const hayConexion = conexion === 'conectado';
  const viajeId = viaje?.id ?? null;

  const [mensajes, setMensajes] = useState<readonly MensajeEnPantalla[]>([]);
  const [cargando, setCargando] = useState(true);
  const [falloDeCarga, setFalloDeCarga] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  // El viaje del que son los mensajes en pantalla. Si cambia, la lista es de
  // otra conversación y se empieza de cero.
  const viajeEnPantalla = useRef<string | null>(null);

  // Los intentos de imagen que aún se pueden reintentar, por su clave. Se guarda
  // la data URL —lo que hay que reenviar— y el `file://` de la vista previa. Se
  // vacía al cambiar de viaje: la data URL es lo más pesado que hay en memoria,
  // y arrastrarla de una conversación a otra sería una fuga.
  const intentosDeImagen = useRef<Map<string, { readonly dataUrl: string; readonly uri: string }>>(new Map());

  // ---------------------------------------------------------------------
  // El historial: la fuente durable
  // ---------------------------------------------------------------------
  const cargar = useCallback(async () => {
    if (viajeId === null) return;
    setCargando(true);
    const respuesta = await pedirMensajes(viajeId);
    setCargando(false);
    if (!respuesta.ok) { setFalloDeCarga(true); return; }
    setFalloDeCarga(false);
    const durables = respuesta.datos.map(m => enPantalla(m as MensajeReal & { clientId?: string }, miId));
    setMensajes(previos => conHistorial(previos, durables));
  }, [viajeId, miId]);

  useEffect(() => {
    if (viajeEnPantalla.current !== viajeId) {
      viajeEnPantalla.current = viajeId;
      intentosDeImagen.current.clear();
      setMensajes([]);
      setFallo(null);
    }
    void cargar();
  }, [viajeId, cargar]);

  // Al reconectar se vuelve a pedir: lo que cayó mientras no había socket no
  // llega solo. Los pendientes se conservan.
  useResync(useCallback(() => { void cargar(); }, [cargar]));

  // ---------------------------------------------------------------------
  // Lo que cae por el socket
  // ---------------------------------------------------------------------
  useEvento('chat:message', useCallback((cuerpo: unknown) => {
    const dato = cuerpo as { tripId?: unknown } | null;
    if (typeof dato?.tripId !== 'string' || dato.tripId !== viajeEnPantalla.current) return;
    const [leido] = leerMensajes([cuerpo]);
    if (leido === undefined) return;
    const clave = (dato as { clientId?: string }).clientId;
    // Ya es durable: su reintento sobra. Se suelta la data URL guardada.
    if (typeof clave === 'string' && clave !== '') intentosDeImagen.current.delete(clave);
    const durable = enPantalla({ ...leido, clientId: clave }, miId);
    setMensajes(previos => conMensaje(previos, durable));
  }, [miId]));

  // El servidor no aceptó uno de los nuestros. Se dice, y el pendiente se
  // resuelve: el texto se quita —volver a escribirlo es barato—; la imagen se
  // marca fallida y se conserva, porque volver a elegirla no lo es y su data URL
  // sigue guardada para el reintento.
  //
  // `chat:error` no dice CUÁL falló —no trae la clave—, así que se resuelve el
  // último intento, que es el caso real: se manda de a uno.
  const ultimaClave = useRef<string | null>(null);
  useEvento('chat:error', useCallback((cuerpo: unknown) => {
    const dato = cuerpo as { tripId?: unknown; error?: unknown } | null;
    if (typeof dato?.tripId === 'string' && dato.tripId !== viajeEnPantalla.current) return;
    setFallo(motivoDelFallo(dato?.error));
    const clave = ultimaClave.current;
    if (clave === null) return;
    setMensajes(previos => intentosDeImagen.current.has(clave)
      ? marcarFallida(previos, clave)
      : sinPendiente(previos, clave));
  }, []));

  // ---------------------------------------------------------------------
  // Escribir
  // ---------------------------------------------------------------------
  const puedeEscribir = sePuedeEscribir(viaje?.estado);

  const enviar = useCallback((crudo: string) => {
    if (viajeId === null || !puedeEscribir) return;
    const texto = textoParaEnviar(crudo);
    if (texto === null) return;

    const clave = claveDeIntento();
    ultimaClave.current = clave;
    setFallo(null);

    if (!enviarMensajeDeChat(viajeId, texto, clave)) {
      // Sin socket no sale. No se inventa un pendiente que nadie va a acusar.
      setFallo('Sin conexión. Vuelve a intentarlo cuando tengas señal.');
      return;
    }
    setMensajes(previos => conMensaje(previos, pendienteDe(texto, clave, miNombre, Date.now())));
  }, [viajeId, puedeEscribir, miNombre]);

  const enviarImagen = useCallback((imagen: ImagenDeChat) => {
    if (viajeId === null || !puedeEscribir) return;
    const clave = claveDeIntento();
    ultimaClave.current = clave;
    intentosDeImagen.current.set(clave, { dataUrl: imagen.dataUrl, uri: imagen.uri });
    setFallo(null);

    const salio = enviarMensajeDeChat(viajeId, '', clave, imagen.dataUrl);
    // El pendiente se pinta con la vista previa local. Si el socket no pudo
    // mandarlo, nace ya marcado fallido: nunca se enseña como enviado sin acuse,
    // y queda a un toque de reintentarse cuando vuelva la señal.
    setMensajes(previos => {
      const conPendiente = conMensaje(previos, pendienteDe('', clave, miNombre, Date.now(), imagen.uri));
      return salio ? conPendiente : marcarFallida(conPendiente, clave);
    });
    if (!salio) setFallo('Sin conexión. La imagen se reintenta cuando vuelva la señal.');
  }, [viajeId, puedeEscribir, miNombre]);

  const reintentarImagen = useCallback((clave: string) => {
    const intento = intentosDeImagen.current.get(clave);
    if (viajeId === null || intento === undefined) return;
    ultimaClave.current = clave;
    setFallo(null);
    const salio = enviarMensajeDeChat(viajeId, '', clave, intento.dataUrl);
    setMensajes(previos => salio ? reactivarPendiente(previos, clave) : marcarFallida(previos, clave));
    if (!salio) setFallo('Sin conexión. La imagen se reintenta cuando vuelva la señal.');
  }, [viajeId]);

  const reintentar = useCallback(() => { setFallo(null); void cargar(); }, [cargar]);

  const estado = estadoDeLaPantalla({ cargando, fallo: falloDeCarga, hayConexion, mensajes });

  const aviso = mensajes.length === 0
    ? null
    : !hayConexion
      ? 'Sin conexión. Verás lo nuevo en cuanto vuelva.'
      : falloDeCarga
        ? 'No se pudo actualizar la conversación.'
        : null;

  return useMemo(() => ({
    viaje,
    estado,
    mensajes,
    aviso,
    sePuedeEscribir: puedeEscribir && hayConexion,
    hayConexion,
    fallo,
    enviar,
    enviarImagen,
    reintentarImagen,
    reintentar
  }), [viaje, estado, mensajes, aviso, puedeEscribir, hayConexion, fallo, enviar, enviarImagen, reintentarImagen, reintentar]);
}
