/**
 * El saldo del conductor. Pantalla REAL.
 *
 * POR QUÉ EL BOTÓN NO HACÍA NADA
 *
 * «Saldo» estaba en `DESTINOS_DE_CONDUCTOR` desde que la barra se rediseñó, y
 * la superficie estaba dibujada y aprobada en `preview/pantallaSaldoConductor`
 * —con su cabecera, sus filtros y sus movimientos—. Lo que faltaba eran las
 * dos piezas del medio: **una ruta** que montara esa superficie y **la clave
 * `saldo` en la tabla de navegación del conductor**. Sin ellas, pulsar la
 * pestaña caía al final de la función sin hacer nada.
 *
 * Es el mismo hueco que tenía la pasajera y se arregla igual.
 *
 * QUÉ ENSEÑA HOY
 *
 * La superficie que el dueño aprobó, tal cual: **ninguna cifra inventada**.
 * La cartera del conductor sigue apagada en el servidor, así que aquí no se
 * pinta un saldo que no existe; cuando el backend la encienda, este es el
 * sitio donde entran sus datos.
 *
 * LA GUARDA ES LA DEL CONDUCTOR
 *
 * Sólo un conductor aprobado ve esto. Un pasajero que llegue por un enlace va
 * a la postulación, igual que en `/conductor`.
 */

import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { C2SaldoConductor } from '../preview/pantallaSaldoConductor';
import { ControlCentralDelRol } from '../navegacion/controlCentral';
import { ShellCompartido } from '../navegacion/shellCompartido';
import { useSesion } from '../context/AuthContext';
import { puedeOperarComoConductor } from '../domain/authState';
import { useTema } from '../theme/ThemeContext';

function Cargando() {
  const tema = useTema();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tema.color.fondo }}>
      <ActivityIndicator color={tema.color.acento} size="large" />
    </View>
  );
}

export default function SaldoDelConductor() {
  const { sesion } = useSesion();

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') return <Cargando />;
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;
  // Quien todavía no es conductor aprobado no tiene cuenta operativa que ver.
  if (!puedeOperarComoConductor(sesion)) return <Redirect href="/postulacion" />;

  return (
    <ShellCompartido cargando={<Cargando />}>
      <C2SaldoConductor control={<ControlCentralDelRol barra="conductor" />} />
    </ShellCompartido>
  );
}
