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
import { AccessibilityInfo } from 'react-native';

export function useMovimientoReducido(): boolean {
  const [quieto, setQuieto] = useState(false);

  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(activo => { if (vigente) setQuieto(activo); })
      .catch(() => { /* si no se puede consultar, se anima */ });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setQuieto);
    return () => { vigente = false; suscripcion.remove(); };
  }, []);

  return quieto;
}
