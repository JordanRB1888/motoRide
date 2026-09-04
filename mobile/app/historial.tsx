/**
 * El historial REAL.
 *
 * EL MISMO ENDPOINT PARA LOS DOS ROLES
 *
 * `GET /api/trips/me/history` filtra por `passengerId` o por `driverId` según
 * quién pregunta. No hacen falta dos implementaciones ni dos llamadas: el
 * contrato es el mismo y el servidor decide qué viajes son de quién.
 *
 * Lo único que cambia con el rol es la PRESENTACIÓN del detalle —a la pasajera
 * se le enseña quién la llevó; al conductor, a quién llevó— y eso se resuelve
 * ahí, no aquí.
 */

import { useCallback, useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';

import { C2Historial, type ViajeEnPantalla } from '../preview/pantallasC2Secciones';
import { ShellCompartido } from '../navegacion/shellCompartido';
import { useSesion } from '../context/AuthContext';
import { shellDelRol } from '../domain/shellDeRol';
import { pedirHistorial } from '../services/viajes';
import { fechaDe, nombreDeEstado, type ViajeDeHistorial } from '../domain/viajes';

export default function PantallaDeHistorial() {
  const { sesion } = useSesion();
  // De quien es la barra de abajo: la decide el ROL que devuelve el servidor.
  const barraDelRol = shellDelRol(sesion.estado === 'AUTENTICADO' ? sesion.usuario.role : null) === 'conductor' ? 'conductor' : 'pasajera';

  const [viajes, setViajes] = useState<readonly ViajeDeHistorial[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');

  const cargar = useCallback(async () => {
    setEstado('cargando');
    const respuesta = await pedirHistorial();
    if (!respuesta.ok) {
      // Un fallo de red no cierra la sesión: se pinta el error y se reintenta.
      setEstado('error');
      return;
    }
    setViajes(respuesta.datos);
    setEstado('listo');
  }, []);

  useEffect(() => {
    if (sesion.estado === 'AUTENTICADO') void cargar();
  }, [sesion.estado, cargar]);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return <C2Historial estado="cargando" />;
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  const enPantalla: readonly ViajeEnPantalla[] = viajes.map(viaje => ({
    clave: viaje.id,
    fecha: fechaDe(viaje.cuando),
    origen: viaje.origen,
    destino: viaje.destino,
    estado: nombreDeEstado(viaje.estado),
    completado: viaje.estado === 'COMPLETED'
  }));

  return (
    <ShellCompartido cargando={<C2Historial estado="cargando" />}>
      <C2Historial
        barra={barraDelRol}
        viajes={enPantalla}
        estado={estado}
        // El identificador REAL del viaje, no una clave de ejemplo.
        onViaje={id => router.push(`/viaje/${encodeURIComponent(id)}` as never)}
        onReintentar={() => { void cargar(); }}
      />
    </ShellCompartido>
  );
}

// La tabla de navegacion ya no vive aqui: la trae `ShellCompartido`, que ademas
// elige la del rol real. Esta version entendia 'inicio', 'historial' y 'perfil'
// y nada mas, asi que el boton amarillo --que pide 'pedir'-- no hacia nada, y
// 'saldo' tampoco existia.
