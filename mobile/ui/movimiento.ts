/**
 * Si el sistema pide movimiento reducido.
 *
 * Existía la misma docena de líneas en el arranque, en la marca y en la
 * bienvenida. Aquí una vez: se pregunta al montar y se sigue escuchando,
 * porque el ajuste se puede cambiar con la aplicación abierta.
 *
 * Si no se puede consultar, se anima: es lo que hacía el código anterior y es
 * lo correcto, porque el ajuste apagado es lo normal.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing } from 'react-native';

export function useMovimientoReducido(): boolean {
  const [quieto, setQuieto] = useState(false);

  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(activo => { if (vigente) setQuieto(activo); })
      .catch(() => { /* si no se puede consultar, se anima: es lo que hacía el código anterior y es lo correcto */ });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setQuieto);
    return () => { vigente = false; suscripcion.remove(); };
  }, []);

  return quieto;
}

/**
 * Curvas de aceleración y desaceleración basadas en física y percepción.
 * Valores oficiales del catálogo de movimiento.
 */
export const curvaUI = Object.freeze({
  /** Desaceleración enérgica para entradas de UI y microinteracciones */
  easeOut: Easing.bezier(0.23, 1, 0.32, 1),
  /** Transición simétrica para cambios de posición o morphing en pantalla */
  easeInOut: Easing.bezier(0.77, 0, 0.175, 1),
  /** Disipación fluida para partículas y efectos de física ambiental */
  fluido: Easing.bezier(0.16, 1, 0.3, 1)
});

/**
 * Presupuesto temporal de interacción táctil (en milisegundos).
 * Ninguna animación de UI supera los 300ms.
 */
export const duracionUI = Object.freeze({
  /** Pulsación táctil, feedback de compresión (100–160ms) */
  rapida: 140,
  /** Transiciones de estado intermedias, pestañas y acordeones (150–250ms) */
  estandar: 220,
  /** Despliegue de hojas modales o pantallas completas (200–300ms) */
  pausada: 300
});

/** Configuraciones de resorte para retroalimentación táctil elástica */
export const resorteUI = Object.freeze({
  suave: Object.freeze({
    damping: 18,
    stiffness: 220,
    mass: 0.8
  }),
  rebote: Object.freeze({
    bounciness: 8,
    speed: 16
  })
});
