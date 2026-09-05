/**
 * La superficie del viaje activo.
 *
 * Un solo sitio decide qué pantalla toca, a partir del estado real:
 *
 *   SEARCHING        →  C2BuscandoVehiculo
 *   DRIVER_ASSIGNED  →  C2Viaje, «En camino»
 *   ARRIVED          →  C2Viaje, «Tu conductor llegó»
 *   IN_PROGRESS      →  C2Viaje, «Viaje en curso»
 *
 * Repartir esa decisión entre varias pantallas obligaría a que cada una
 * conociera los estados del backend, que es justo lo que el presenter evita.
 *
 * NO PARPADEA AL RESINCRONIZAR
 *
 * Mientras se vuelve a preguntar se sigue enseñando el último viaje conocido.
 * Enseñar «no tienes ningún viaje» durante el ida y vuelta —o peor, durante un
 * fallo de red— sería mentirle a alguien que va montado en la moto.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { C2BuscandoVehiculo, C2Viaje } from '../preview/pantallasC2';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { useViajeActivo } from '../realtime/ViajeActivo';
import { cancelarViaje, escuchar } from '../realtime/socket';
import { useUbicacion } from '../ubicacion/UbicacionDelDispositivo';
import { useUbicacionEnVivo } from '../realtime/UbicacionEnVivo';
import { mapaDelViaje } from '../domain/mapaDelViaje';
import {
  datosDelViaje,
  tipoQueSeBusca,
  usaLaPantallaDelViaje
} from '../domain/superficieDelViaje';

export default function PantallaDelViajeActivo() {
  const tema = useTema();
  const { sesion } = useSesion();
  const { estado, viaje } = useViajeActivo();
  const { estado: ubicacion, pedirUbicacion, refrescar } = useUbicacion();
  const { conductor } = useUbicacionEnVivo();

  // Se pide el permiso AQUI y no al abrir la aplicacion.
  //
  // Con un viaje en curso, ver donde estas respecto a la moto es justo lo que
  // hace falta, asi que el momento se explica solo. Un permiso que salta nada
  // mas abrir, sin nada en pantalla que lo justifique, se deniega casi
  // siempre — y una vez denegado el sistema deja de preguntar.
  useEffect(() => { void pedirUbicacion(); }, [pedirUbicacion]);

  // CENTRAR ES UN EVENTO, NO UN MODO
  //
  // Se guarda la posicion del INSTANTE en que se pulsa. Mientras no se vuelva
  // a pulsar, ese valor no cambia y la camara se queda donde este: si siguiera
  // a la posicion viva, el mapa se moveria solo cada dos pasos y le quitaria
  // el mapa de las manos a quien lo esta arrastrando para mirar otra calle.
  const [centrarEn, setCentrarEn] = useState<{ lat: number; lng: number } | null>(null);

  const centrar = useCallback(() => {
    void refrescar();
    const donde = ubicacion.posicion;
    if (donde !== null) setCentrarEn({ lat: donde.lat, lng: donde.lng });
  }, [refrescar, ubicacion.posicion]);

  // ---------------------------------------------------------------------
  // Cancelar la busqueda
  // ---------------------------------------------------------------------
  //
  // EL VIAJE NO SE LIMPIA HASTA QUE EL SERVIDOR LO DIGA
  //
  // Se pide la cancelacion y se espera. Borrarlo aqui de forma optimista seria
  // ensenar que ya no hay viaje mientras el servidor sigue buscandole un
  // conductor: si la cancelacion se rechaza —porque alguien acaba de aceptarlo,
  // o porque la base no pudo escribir— quien mira la pantalla creeria que no va
  // nadie a recogerlo, y si que va.
  //
  // Mientras tanto el boton se apaga. Un segundo `rideCancelled` no rompe nada
  // en el servidor, pero deja a alguien pulsando sin respuesta.
  const [cancelando, setCancelando] = useState(false);
  const viajeId = viaje?.id ?? null;

  const cancelar = useCallback(() => {
    if (viajeId === null || cancelando) return;
    if (!cancelarViaje(viajeId)) return;
    setCancelando(true);
  }, [viajeId, cancelando]);

  // La respuesta del servidor, en sus dos formas.
  useEffect(() => {
    if (!cancelando) return;

    // Aceptada: el almacen vuelve a preguntar y la pantalla se va sola cuando
    // el estado real deje de ser un viaje activo.
    const dejarDeEscucharHecho = escuchar('rideCancelled', () => setCancelando(false));

    // Rechazada: el viaje SIGUE. Se vuelve a habilitar el boton para poder
    // intentarlo otra vez.
    const dejarDeEscucharFallo = escuchar('rideCancellationRejected', () => setCancelando(false));

    return () => {
      dejarDeEscucharHecho();
      dejarDeEscucharFallo();
    };
  }, [cancelando]);

  // Cuando el servidor deja de dar el viaje —completado, cancelado, o fuera de
  // su ventana— esta pantalla ya no tiene nada que enseñar. Se vuelve al
  // inicio en vez de quedarse en blanco.
  //
  // `replace` y no `push`: el viaje que terminó no debe quedar en la pila.
  useEffect(() => {
    if (estado.fase === 'SIN_VIAJE') router.replace('/pasajero');
  }, [estado.fase]);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return <Centro><ActivityIndicator color={tema.color.acento} size="large" /></Centro>;
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  // Todavía no se sabe. Sólo al arrancar: al resincronizar hay viaje conocido.
  if (viaje === null) {
    return <Centro><ActivityIndicator color={tema.color.acento} size="large" /></Centro>;
  }

  // El mapa REAL, con las coordenadas que traiga el viaje. Sin conductor
  // todavía: su posición no viaja en `/api/trips/active/me`.
  //
  // La tuya sí, cuando el GPS la sepa. Si no hay permiso o todavía no llegó,
  // `posicion` es null y el marcador sencillamente no se pinta.
  // La moto de verdad, cuando el servidor dice donde esta. `conductor` ya
  // viene filtrado por conductor asignado y por viaje, y desaparece solo
  // cuando su posicion deja de ser reciente: enseniar la de hace cinco minutos
  // mandaria a alguien a una esquina donde la moto ya no esta.
  const mapa = mapaDelViaje(viaje, {
    usuarioEn: ubicacion.posicion === null
      ? null
      : { lat: ubicacion.posicion.lat, lng: ubicacion.posicion.lng },
    conductorEn: conductor?.en ?? null,
    rumboDelConductor: conductor?.rumbo ?? null,
    centrarEn
  });

  if (viaje.estado === 'SEARCHING') {
    return (
      <ProveedorDeNavegacion ir={irA}>
        <C2BuscandoVehiculo
          tipo={tipoQueSeBusca(viaje)}
          mapa={mapa}
          onCancelar={cancelando ? undefined : cancelar}
        />
      </ProveedorDeNavegacion>
    );
  }

  const datos = usaLaPantallaDelViaje(viaje.estado) ? datosDelViaje(viaje) : null;
  if (datos === null) {
    // Un estado que no tiene superficie —terminal, o uno nuevo que el servidor
    // empiece a mandar—. No se inventa una pantalla: se vuelve al inicio.
    return <Redirect href="/pasajero" />;
  }

  return (
    <ProveedorDeNavegacion ir={irA}>
      {/* El botón de mensaje de la tarjeta del conductor ya estaba dibujado; ahora
          lleva a la conversación del viaje. `push`, no `replace`: se vuelve a
          esta pantalla al cerrar el chat. */}
      <C2Viaje datos={datos} mapa={mapa} onCentrar={centrar} onMensaje={() => router.push('/chat')} />
    </ProveedorDeNavegacion>
  );
}

function irA(clave: string) {
  if (clave === 'inicio') router.replace('/pasajero');
  if (clave === 'historial') router.replace('/historial');
  if (clave === 'perfil') router.replace('/perfil');
}

function Centro({ children }: { readonly children: React.ReactNode }) {
  const tema = useTema();
  return (
    <View style={{
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tema.color.fondo
    }}>
      {children}
    </View>
  );
}
