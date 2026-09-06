/**
 * El registro REAL de un viaje.
 *
 * LA AUTORIZACIÓN LA DECIDE EL SERVIDOR
 *
 * Aquí no se comprueba si esta persona participó en este viaje: el backend lo
 * hace y responde 403. Repetirlo en el teléfono no añadiría seguridad —se
 * desmonta la aplicación y desaparece— y sí una segunda regla que puede
 * discrepar de la de verdad. Lo que sí se hace es enseñar bien ese 403.
 *
 * DOS LLAMADAS, UNA PANTALLA
 *
 * El viaje y su conversación son endpoints distintos. La conversación se pide
 * después y por separado: el registro se puede leer sin ella, y un fallo al
 * traer los mensajes no puede dejar la pantalla en blanco.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { C2DetalleDeViaje, type DatosDelViaje } from '../../preview/pantallaDetalleDeViaje';
import { Boton, Txt } from '../../ui/componentes';
import { ShellCompartido } from '../../navegacion/shellCompartido';
import { ControlCentralDelRol } from '../../navegacion/controlCentral';
import { shellDelRol } from '../../domain/shellDeRol';
import { useTema } from '../../theme/ThemeContext';
import { useSesion } from '../../context/AuthContext';
import { fuenteDeAdjunto, pedirMensajes, pedirViaje } from '../../services/viajes';
import {
  duracionEntre,
  fechaDe,
  horaDe,
  importeDe,
  nombreDeEstado,
  type DetalleReal,
  type MensajeReal
} from '../../domain/viajes';

/** Cómo se llama cada paso en pantalla. El orden es el de la máquina real. */
const PASOS = [
  { estado: 'SEARCHING', titulo: 'Pediste el viaje' },
  { estado: 'DRIVER_ASSIGNED', titulo: 'Conductor asignado' },
  { estado: 'ARRIVED', titulo: 'Llegó al punto de recogida' },
  { estado: 'IN_PROGRESS', titulo: 'Empezó el viaje' },
  { estado: 'COMPLETED', titulo: 'Llegó al destino' }
] as const;

const QUIEN_CANCELO: Readonly<Record<string, string>> = Object.freeze({
  passenger: 'Cancelado por la pasajera',
  driver: 'Cancelado por el conductor',
  system: 'Cancelado por el sistema'
});

type Adjunto = { readonly uri: string; readonly headers?: Record<string, string> };

export default function PantallaDeViaje() {
  const tema = useTema();
  const { sesion } = useSesion();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [viaje, setViaje] = useState<DetalleReal | null>(null);
  const [mensajes, setMensajes] = useState<readonly MensajeReal[]>([]);
  const [adjuntos, setAdjuntos] = useState<Record<string, Adjunto>>({});
  const [cargandoChat, setCargandoChat] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (id === undefined || id === '') return;
    setError(null);

    const respuesta = await pedirViaje(id);
    if (!respuesta.ok) {
      setError(
        respuesta.codigo === 'FORBIDDEN' || respuesta.codigo === 'TRIP_NOT_FOUND'
          ? 'Este viaje no es tuyo o ya no está.'
          : respuesta.mensaje
      );
      return;
    }
    setViaje(respuesta.datos);

    setCargandoChat(true);
    const conversacion = await pedirMensajes(id);
    if (conversacion.ok) {
      setMensajes(conversacion.datos);
      // Los adjuntos se resuelven uno a uno: cada uno necesita el token, y la
      // imagen sigue viajando por el endpoint privado con su cabecera.
      const fuentes: Record<string, Adjunto> = {};
      for (const mensaje of conversacion.datos) {
        if (mensaje.adjuntoId === '') continue;
        const fuente = await fuenteDeAdjunto(mensaje.adjuntoId);
        if (fuente !== null) fuentes[mensaje.id] = fuente;
      }
      setAdjuntos(fuentes);
    }
    setCargandoChat(false);
  }, [id]);

  useEffect(() => {
    if (sesion.estado === 'AUTENTICADO') void cargar();
  }, [sesion.estado, cargar]);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return <Centro><ActivityIndicator color={tema.color.acento} size="large" /></Centro>;
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  if (error !== null) {
    return (
      <Centro>
        <Txt nivel="cuerpo" centrado>{error}</Txt>
        <Boton titulo="Reintentar" onPress={() => { void cargar(); }} />
        <Boton titulo="Volver al historial" variante="secundario" onPress={() => router.back()} />
      </Centro>
    );
  }
  if (viaje === null) {
    return <Centro><ActivityIndicator color={tema.color.acento} size="large" /></Centro>;
  }

  const soyPasajera = sesion.usuario.role !== 'driver';
  // De quién es la barra de abajo: la decide el ROL que devuelve el servidor,
  // igual que en el historial del que se llega. Nunca la ruta ni una caché.
  const barraDelRol = shellDelRol(sesion.usuario.role) === 'conductor' ? 'conductor' : 'pasajera';

  // `ShellCompartido` trae la navegación del rol REAL. Antes había aquí una
  // tabla propia que sólo entendía las claves de la pasajera y mandaba
  // «inicio» a `/pasajero`: un conductor salía del detalle al shell ajeno.
  return (
    <ShellCompartido cargando={<Centro><ActivityIndicator color={tema.color.acento} size="large" /></Centro>}>
      <C2DetalleDeViaje
        datos={enPantalla(viaje, mensajes, adjuntos, sesion.usuario.id, soyPasajera)}
        cargandoConversacion={cargandoChat}
        barra={barraDelRol}
        control={<ControlCentralDelRol barra={barraDelRol} />}
      />
    </ShellCompartido>
  );
}

/**
 * Traduce el viaje del servidor a lo que la pantalla pinta.
 *
 * Aquí está la decisión que más importa: **ningún hito se fabrica**. Cada paso
 * busca su entrada en `statusHistory`; si no la encuentra, se pinta apagado y
 * sin hora, que es la semántica que el diseño ya tenía.
 */
function enPantalla(
  viaje: DetalleReal,
  mensajes: readonly MensajeReal[],
  adjuntos: Record<string, Adjunto>,
  miId: string,
  soyPasajera: boolean
): DatosDelViaje {
  const cancelado = viaje.estado === 'CANCELLED';
  const completado = viaje.estado === 'COMPLETED';

  const hito = (estado: string) => viaje.hitos.find(paso => paso.estado === estado);

  const pasos = PASOS.map(paso => {
    const ocurrido = hito(paso.estado);
    return {
      clave: paso.estado.toLowerCase(),
      titulo: paso.titulo,
      hora: ocurrido === undefined ? '' : horaDe(ocurrido.cuando),
      detalle: paso.estado === 'DRIVER_ASSIGNED' ? viaje.conductor?.nombre : undefined,
      ocurrido: ocurrido !== undefined
    };
  });

  // La cancelación se cuela DESPUÉS del último paso que sí ocurrió, que es
  // donde ocurrió de verdad. Ponerla al final dejaría pasos apagados por
  // encima de ella, como si hubieran podido pasar después.
  const conCancelacion = cancelado && viaje.cancelacion !== null
    ? insertarCancelacion(pasos, viaje.cancelacion.cuando, viaje.cancelacion.quien, viaje.cancelacion.razon)
    : pasos;

  const inicio = hito('IN_PROGRESS')?.cuando ?? '';
  const espera = hito('ARRIVED')?.cuando ?? '';

  return {
    estado: nombreDeEstado(viaje.estado),
    completado,
    fecha: fechaDe(viaje.cuando),
    // La referencia de soporte es el identificador REAL del viaje.
    referencia: viaje.id,
    origen: viaje.origen,
    destino: viaje.destino,
    // Al conductor se le enseña a quién llevó; a la pasajera, quién la llevó.
    conductor: soyPasajera
      ? viaje.conductor
      : (viaje.pasajero === '' ? null : { nombre: viaje.pasajero, vehiculo: '', placa: '' }),
    hitos: conCancelacion,
    duracion: duracionEntre(inicio, viaje.cerradoEn),
    espera: duracionEntre(espera, inicio),
    cobro: {
      total: importeDe(viaje.importe),
      metodo: metodoLegible(viaje.metodoDePago),
      // El servidor no publica un desglose por conceptos: sólo el total. No se
      // inventa uno.
      desglose: []
    },
    conversacion: mensajes.map(mensaje => ({
      clave: mensaje.id,
      mia: mensaje.autorId === miId,
      autor: mensaje.autorId === miId ? 'Tú' : (mensaje.autorNombre || 'La otra persona'),
      hora: horaDe(mensaje.cuando),
      texto: mensaje.texto === '' ? undefined : mensaje.texto,
      adjunto: mensaje.adjuntoId === ''
        ? undefined
        : { rotulo: 'Imagen del chat', fuente: adjuntos[mensaje.id] }
    })),
    aviso: 'Esta conversación queda guardada con el viaje. Soporte puede leerla si abres un reclamo.',
    pendiente: 'Plazo de conservación: por definir.'
  };
}

/** Mete el paso de cancelación justo después del último que sí ocurrió. */
function insertarCancelacion(
  pasos: DatosDelViaje['hitos'],
  cuando: string,
  quien: string,
  razon: string
): DatosDelViaje['hitos'] {
  const paso = {
    clave: 'cancelled',
    titulo: 'Se canceló el viaje',
    hora: horaDe(cuando),
    // `reason` sólo lo apunta el servidor en algunos casos —la cancelación
    // automática por falta de conductores—. Cuando no está, se dice quién
    // canceló, que sí consta siempre.
    detalle: razon !== '' ? razonLegible(razon) : QUIEN_CANCELO[quien],
    ocurrido: true
  };

  const ultimo = pasos.reduce((tope, actual, indice) => (actual.ocurrido ? indice : tope), -1);
  return [...pasos.slice(0, ultimo + 1), paso, ...pasos.slice(ultimo + 1)];
}

function razonLegible(razon: string): string {
  return razon === 'NO_DRIVERS_AVAILABLE' ? 'No había conductores disponibles' : razon;
}

function metodoLegible(metodo: string): string {
  const normalizado = metodo.trim().replaceAll('_', ' ').toUpperCase();
  if (normalizado === 'CASH' || normalizado === 'EFECTIVO') return 'Efectivo al conductor';
  if (['WALLET', 'BILLETERA', 'BILLETERA EXPRESS'].includes(normalizado)) return 'Billetera Express';
  return metodo;
}


function Centro({ children }: { readonly children: React.ReactNode }) {
  const tema = useTema();
  return (
    <View style={{
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: tema.ritmo.entreElementos,
      padding: tema.ritmo.margenPantalla,
      backgroundColor: tema.color.fondo
    }}>
      {children}
    </View>
  );
}
