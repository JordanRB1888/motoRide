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
import { Boton } from '../components/Boton';
import { Txt } from '../ui/componentes';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { useViajeActivo } from '../realtime/ViajeActivo';
import { cancelarViaje, escuchar } from '../realtime/socket';
import { useUbicacion } from '../ubicacion/UbicacionDelDispositivo';
import { useUbicacionEnVivo } from '../realtime/UbicacionEnVivo';
import { mapaDelViaje } from '../domain/mapaDelViaje';
import { useRutaDelViaje } from '../realtime/rutaDelViaje';
import {
  datosDelViaje,
  tipoQueSeBusca,
  usaLaPantallaDelViaje
} from '../domain/superficieDelViaje';

export default function PantallaDelViajeActivo() {
  const tema = useTema();
  const { sesion } = useSesion();
  const { estado, viaje, sinConductores, olvidarSinConductores } = useViajeActivo();
  const { estado: ubicacion, pedirUbicacion, refrescar } = useUbicacion();
  const { conductor } = useUbicacionEnVivo();

  // LA RUTA, TRAZADA POR EL SERVIDOR.
  //
  // Aquí arriba con los demás ganchos, antes de cualquier salida condicional:
  // llamarlo más abajo lo saltaría en los estados que retornan antes, y React
  // exige que el orden de los ganchos no cambie entre fotogramas.
  //
  // No se le pasa origen ni destino: sólo el viaje, su estado y dónde está la
  // moto. Quién va a dónde en cada momento lo decide el servidor.
  const ruta = useRutaDelViaje(
    viaje?.id ?? null,
    viaje?.estado ?? '',
    conductor?.en ?? null
  );

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

  // ---------------------------------------------------------------------
  // Que no haya conductores NO es un fallo, pero hay que decirlo
  // ---------------------------------------------------------------------
  //
  // El despacho ofrece la carrera a cada candidato durante quince segundos. Si
  // ninguno acepta --o no habia ninguno cerca-- cancela el viaje y avisa por
  // `dispatch:no_drivers`. Ese evento estaba declarado en el cliente y no lo
  // escuchaba nadie: el viaje desaparecia, esta pantalla veia `SIN_VIAJE` y
  // devolvia al inicio sin una palabra. Quien acababa de pedir una carrera se
  // encontraba en la portada y pensaba que la aplicacion se habia roto.
  // Lo recuerda el proveedor: cuando no hay ningun conductor elegible el aviso
  // llega antes de que esta pantalla exista.
  // Cuando el servidor deja de dar el viaje —completado, cancelado, o fuera de
  // su ventana— esta pantalla ya no tiene nada que enseñar. Se vuelve al
  // inicio en vez de quedarse en blanco.
  //
  // `replace` y no `push`: el viaje que terminó no debe quedar en la pila.
  //
  // Salvo que sepamos POR QUE se acabo: si fue porque nadie podia venir, eso
  // se cuenta aqui y se ofrece volver a intentarlo. Sacar a alguien al inicio
  // en silencio no es una transicion, es dejarle sin explicacion.
  useEffect(() => {
    if (estado.fase === 'SIN_VIAJE' && !sinConductores) router.replace('/pasajero');
  }, [estado.fase, sinConductores]);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return <Centro><ActivityIndicator color={tema.color.acento} size="large" /></Centro>;
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  // NADIE PODIA VENIR, Y SE DICE
  //
  // No es un error de la aplicacion ni algo que se pueda reintentar solo: a esa
  // hora y en esa zona no habia conductores disponibles. Lo unico util es
  // contarlo y dejar pedir otra vez.
  if (sinConductores && estado.fase !== 'CON_VIAJE') {
    return (
      <Centro>
        <Txt nivel="titulo" centrado>No encontramos conductores disponibles</Txt>
        <Txt nivel="cuerpo" tono="secundario" centrado>
          Ninguno pudo tomar tu viaje ahora mismo. Puedes intentarlo de nuevo.
        </Txt>
        <Boton
          titulo="Pedir otra vez"
          onPress={() => { olvidarSinConductores(); router.replace('/pedir'); }}
        />
        <Boton
          titulo="Volver al inicio"
          variante="secundario"
          onPress={() => { olvidarSinConductores(); router.replace('/pasajero'); }}
        />
      </Centro>
    );
  }

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
    // Vacía mientras no haya ruta, y eso es lo normal al llegar, al terminar y
    // sin proveedor configurado. No se sustituye por una recta.
    ruta: ruta.puntos,
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
      backgroundColor: tema.color.fondo,
      gap: tema.ritmo.entreElementos,
      padding: tema.ritmo.margenPantalla
    }}>
      {children}
    </View>
  );
}
