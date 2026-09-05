/**
 * El lenguaje de microinteracciones de la iconografía de +58Express.
 *
 * Inspirado en Its Hover: cada icono reacciona físicamente según su semántica
 * únicamente ante la interacción directa (press, select, focus).
 * En reposo (idle) permanece sereno y sin distracciones.
 */

import { useEffect } from 'react';
import Reanimated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';

import { Icono, type NombreDeIcono } from './Icono';
import { useMovimientoReducido } from './movimiento';

export type VarianteDeMovimientoDeIcono =
  | 'pulso'
  | 'elevar'
  | 'girar'
  | 'campana'
  | 'deslizar'
  | 'sacudir'
  | 'marcar'
  | 'subir'
  | 'bajar'
  | 'escudo'
  | 'vibrar'
  | 'inclinacion'
  | 'apertura'
  | 'mas'
  | 'candado'
  | 'ojo'
  | 'volante'
  | 'ninguna';

export function movimientoSugerido(nombre: NombreDeIcono): VarianteDeMovimientoDeIcono {
  if (nombre === 'campana') return 'campana';
  if (nombre === 'ajustes') return 'girar';
  if (nombre === 'volante') return 'volante';
  if (nombre === 'destino') return 'elevar';
  if (nombre === 'reloj' || nombre === 'viajes') return 'girar';
  if (nombre === 'dolar' || nombre === 'maletin') return 'elevar';
  if (nombre === 'mensaje' || nombre === 'rayo') return 'deslizar';
  if (nombre === 'escudo') return 'escudo';
  if (nombre === 'telefono') return 'vibrar';
  if (nombre === 'mas') return 'mas';
  if (nombre === 'lapiz') return 'inclinacion';
  if (nombre === 'billetera') return 'apertura';
  if (nombre === 'documento' || nombre === 'salir') return 'deslizar';
  if (nombre === 'buscar' || nombre === 'ayuda') return 'pulso';
  if (nombre === 'calendario') return 'girar';
  if (nombre === 'flecha-arriba') return 'subir';
  if (nombre === 'flecha-abajo') return 'bajar';
  if (nombre === 'papelera') return 'ninguna';
  if (nombre === 'perfil' || nombre === 'servicios' || nombre === 'estrella') return 'pulso';
  return 'pulso';
}

export function IconoAnimado({
  nombre,
  color,
  tamano = 22,
  activo = false,
  reaccionando = false,
  variante = movimientoSugerido(nombre)
}: {
  readonly nombre: NombreDeIcono;
  readonly color: string;
  readonly tamano?: number;
  readonly activo?: boolean;
  /** Cambia a true durante press/focus/selección. En reposo el icono queda quieto. */
  readonly reaccionando?: boolean;
  readonly variante?: VarianteDeMovimientoDeIcono;
}) {
  const quieto = useMovimientoReducido();
  const avance = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(avance);
    if (!reaccionando || quieto || variante === 'ninguna') {
      avance.set(withTiming(0, { duration: quieto ? 80 : 120 }));
      return;
    }
    avance.set(withSequence(
      withTiming(1, { duration: 110, easing: Easing.bezier(0.23, 1, 0.32, 1) }),
      withSpring(0, { duration: 180, dampingRatio: 1 })
    ));
  }, [avance, quieto, reaccionando, variante]);

  const estilo = useAnimatedStyle(() => {
    const t = avance.get();
    if (quieto) return { opacity: reaccionando ? 0.82 : 1 };

    switch (variante) {
      case 'elevar':
        return {
          transform: [
            { translateY: interpolate(t, [0, 1], [0, -3]) },
            { scale: interpolate(t, [0, 1], [1, 1.035]) }
          ]
        };
      case 'girar':
        return { transform: [{ rotate: `${interpolate(t, [0, 1], [0, 24])}deg` }] };
      case 'campana':
        return {
          transform: [
            { rotate: `${interpolate(t, [0, 0.25, 0.5, 0.75, 1], [0, -12, 10, -6, 0])}deg` }
          ]
        };
      case 'deslizar':
        return { transform: [{ translateX: interpolate(t, [0, 1], [0, 3.5]) }] };
      case 'sacudir':
        return { transform: [{ translateX: interpolate(t, [0, 0.35, 0.7, 1], [0, -2, 2, 0]) }] };
      case 'marcar':
        return { transform: [{ scale: interpolate(t, [0, 1], [1, 1.08]) }] };
      case 'escudo':
        return {
          transform: [
            { scale: interpolate(t, [0, 0.45, 1], [1, 1.15, 1]) },
            { translateY: interpolate(t, [0, 0.45, 1], [0, -2, 0]) }
          ]
        };
      case 'vibrar':
        return {
          transform: [
            { rotate: `${interpolate(t, [0, 0.2, 0.4, 0.6, 0.8, 1], [0, -9, 9, -7, 7, 0])}deg` }
          ]
        };
      case 'inclinacion':
        return {
          transform: [
            { rotate: `${interpolate(t, [0, 0.45, 1], [0, -14, 0])}deg` },
            { translateY: interpolate(t, [0, 0.45, 1], [0, -2, 0]) }
          ]
        };
      case 'apertura':
        return {
          transform: [
            { translateY: interpolate(t, [0, 0.45, 1], [0, -3.5, 0]) },
            { scale: interpolate(t, [0, 0.45, 1], [1, 1.08, 1]) }
          ]
        };
      case 'mas':
        return {
          transform: [
            { rotate: `${interpolate(t, [0, 1], [0, 90])}deg` },
            { scale: interpolate(t, [0, 0.5, 1], [1, 1.14, 1]) }
          ]
        };
      case 'candado':
        return { transform: [{ translateY: interpolate(t, [0, 0.45, 1], [0, -3, 0]) }] };
      case 'ojo':
        return { transform: [{ scaleY: interpolate(t, [0, 0.5, 1], [1, 0.15, 1]) }] };
      case 'subir':
        return { transform: [{ translateY: interpolate(t, [0, 1], [0, -3.5]) }] };
      case 'bajar':
        return { transform: [{ translateY: interpolate(t, [0, 1], [0, 3.5]) }] };
      case 'pulso':
        return { transform: [{ scale: interpolate(t, [0, 1], [1, 1.07]) }] };
      case 'volante':
        return {
          transform: [
            {
              rotate: `${interpolate(
                t,
                [0, 0.25, 0.5, 0.75, 1],
                [0, -12, 10, -4, 0]
              )}deg`
            }
          ]
        };
      default:
        return {};
    }
  });

  return (
    <Reanimated.View style={estilo}>
      <Icono nombre={nombre} color={color} tamano={tamano} activo={activo} />
    </Reanimated.View>
  );
}
