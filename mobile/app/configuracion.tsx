/**
 * La configuración REAL.
 *
 * Es la pantalla que menos trabajo necesitaba: la apariencia ya era de verdad
 * —`useApariencia` guarda la preferencia en el dispositivo y el automático mira
 * la hora de Venezuela— desde THEME-DAY-NIGHT-1.
 *
 * Lo que aporta esta fase es la guarda de sesión y el `real`, que hace que las
 * filas sin función dejen de anunciar un estado que no existe.
 */

import { Redirect, router } from 'expo-router';

import { C2Configuracion } from '../preview/pantallaConfiguracion';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { useSesion } from '../context/AuthContext';

export default function PantallaDeConfiguracion() {
  const { sesion } = useSesion();

  // Aquí no hace falta estado de carga: no se pide nada al servidor. La
  // preferencia de apariencia ya está leída cuando el tema se monta.
  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return <C2Configuracion real />;
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  return (
    <ProveedorDeNavegacion ir={irA}>
      <C2Configuracion real />
    </ProveedorDeNavegacion>
  );
}

function irA(clave: string) {
  if (clave === 'inicio') router.replace('/pasajero');
  if (clave === 'perfil') router.replace('/perfil');
}
