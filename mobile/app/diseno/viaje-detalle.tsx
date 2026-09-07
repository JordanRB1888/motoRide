/**
 * El registro completo de un viaje del historial.
 *
 * Lee de la ruta CUÁL viaje: sin eso enseñaría siempre el mismo y dejaría de
 * ser un detalle. Sin parámetro cae en el primero, que es lo que hace falta
 * para poder abrir la pantalla directamente y mirarla.
 */

import { useLocalSearchParams } from 'expo-router';
import { C2DetalleDeViaje } from '../../preview/pantallaDetalleDeViaje';

export default function Pantalla() {
  const { viaje } = useLocalSearchParams<{ viaje?: string }>();
  return <C2DetalleDeViaje clave={viaje ?? 'h1'} />;
}
