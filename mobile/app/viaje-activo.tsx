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

import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { C2BuscandoVehiculo, C2Viaje } from '../preview/pantallasC2';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { useTema } from '../theme/ThemeContext';
import { useSesion } from '../context/AuthContext';
import { useViajeActivo } from '../realtime/ViajeActivo';
import {
  datosDelViaje,
  tipoQueSeBusca,
  usaLaPantallaDelViaje
} from '../domain/superficieDelViaje';

export default function PantallaDelViajeActivo() {
  const tema = useTema();
  const { sesion } = useSesion();
  const { estado, viaje } = useViajeActivo();

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

  if (viaje.estado === 'SEARCHING') {
    return (
      <ProveedorDeNavegacion ir={irA}>
        {/* Cancelar todavía no está conectado: emitir `rideCancelled` es
            despacho, y esta fase sólo consume estado. Sin manejador, el botón
            se queda como en el recorrido de diseño. */}
        <C2BuscandoVehiculo tipo={tipoQueSeBusca(viaje)} />
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
      <C2Viaje datos={datos} />
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
