/**
 * El shell de las pantallas que son de los dos roles: Historial y Perfil.
 *
 * POR QUÉ NO PUEDEN TENER UNA SOLA NAVEGACIÓN
 *
 * Un pasajero y un conductor ven las mismas dos pantallas, pero **no la misma
 * barra**: una lleva Inicio / Historial / Saldo / Perfil con el botón amarillo
 * en medio, y la otra Mapa / Saldo / Historial / Perfil con el disco de
 * disponibilidad. Antes las dos pantallas daban por hecho el shell de pasajero,
 * así que un conductor en su historial veía la barra de pasajera y el botón de
 * pedir carreras.
 *
 * Aquí se elige por el ROL QUE DEVUELVE EL SERVIDOR, igual que en todas partes.
 */

import { useCallback } from 'react';
import { Redirect, router } from 'expo-router';

import { useSesion } from '../context/AuthContext';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { shellDelRol } from '../domain/shellDeRol';
import { crearNavegacionDePasajero } from './shellDePasajero';

/**
 * La navegación del conductor. Se queda como estaba —sus pestañas y su disco
 * no son el objeto de esta corrección— y sólo se traslada a un sitio para que
 * las pantallas compartidas puedan elegir.
 */
export function crearNavegacionDeConductor() {
  return (clave: string) => {
    if (clave === 'mapa') router.replace('/conductor');
    if (clave === 'historial') router.replace('/historial');
    if (clave === 'perfil') router.replace('/perfil');
    // El saldo del conductor. Su superficie estaba dibujada y aprobada, pero
    // sin ruta ni clave aqui: pulsar la pestaña caia al final sin hacer nada.
    // La cartera sigue apagada en el servidor, asi que la pantalla no inventa
    // ninguna cifra --eso ya lo garantiza una prueba sobre la superficie--.
    if (clave === 'saldo') router.replace('/conductor-saldo');
  };
}

export function ShellCompartido({
  children,
  cargando
}: {
  readonly children: React.ReactNode;
  readonly cargando: React.ReactNode;
}) {
  const { sesion } = useSesion();
  const rol = sesion.estado === 'AUTENTICADO' ? sesion.usuario.role : null;
  const shell = shellDelRol(rol);

  const ir = useCallback(
    shell === 'conductor' ? crearNavegacionDeConductor() : crearNavegacionDePasajero(),
    [shell]
  );

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') return <>{cargando}</>;
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;
  // Un rol que no conocemos no tiene shell al que pertenecer.
  if (shell === null) return <Redirect href="/" />;

  return <ProveedorDeNavegacion ir={ir}>{children}</ProveedorDeNavegacion>;
}
