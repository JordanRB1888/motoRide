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
import { shellDelRol } from '../domain/shellDeRol';
import { ControlCentralDelRol } from '../navegacion/controlCentral';

export default function PantallaDeConfiguracion() {
  const { sesion } = useSesion();
  const barraDelRol = shellDelRol(sesion.estado === 'AUTENTICADO' ? sesion.usuario.role : null) === 'conductor' ? 'conductor' : 'pasajera';

  // Aquí no hace falta estado de carga: no se pide nada al servidor. La
  // preferencia de apariencia ya está leída cuando el tema se monta.
  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    if (barraDelRol === 'conductor') {
      return <C2Configuracion real barra="conductor" />;
    }
    return <C2Configuracion real />;
  }
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  function irA(clave: string) {
    if (clave === 'inicio') router.replace(barraDelRol === 'conductor' ? '/conductor' : '/pasajero');
    if (clave === 'historial') router.replace('/historial');
    if (clave === 'saldo') router.replace(barraDelRol === 'conductor' ? '/conductor-saldo' : '/saldo');
    if (clave === 'perfil') router.replace('/perfil');
  }

  const controlCentral = <ControlCentralDelRol barra={barraDelRol} />;

  if (barraDelRol === 'conductor') {
    return (
      <ProveedorDeNavegacion ir={irA}>
        <C2Configuracion real barra="conductor" control={controlCentral} />
      </ProveedorDeNavegacion>
    );
  }

  return (
    <ProveedorDeNavegacion ir={irA}>
      <C2Configuracion real control={controlCentral} />
    </ProveedorDeNavegacion>
  );
}
