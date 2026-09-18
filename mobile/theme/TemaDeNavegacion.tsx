/**
 * El tema de la NAVEGACIÓN, que no es el mismo que el de los componentes.
 *
 * POR QUÉ HACE FALTA, Y QUÉ SE VEÍA SIN ÉL
 *
 * React Navigation tiene su propio tema, y si nadie se lo da usa
 * `DefaultTheme` —el claro—, cuyo `colors.background` es literalmente
 * `rgb(242, 242, 242)`. Ese color lo pinta el contenedor nativo de cada
 * pantalla del Stack: es lo que se ve durante los milisegundos en que la
 * pantalla entrante todavía no ha dibujado nada.
 *
 * En una aplicación grafito eso es un fogonazo gris claro en mitad de cada
 * transición. Se midió sobre un vídeo de dispositivo real: los fotogramas del
 * fogonazo dan un brillo medio de **242**, exactamente ese gris. No era el
 * fondo de la ventana de Android —que sí es grafito— ni un fondo blanco
 * heredado: era el tema por omisión de la navegación, que nunca se sustituyó.
 *
 * QUÉ HACE ESTE COMPONENTE
 *
 * Le da a la navegación los mismos colores que ya usa el resto de la
 * aplicación, leídos del tema propio. Así el contenedor de cada pantalla nace
 * del color correcto y no hay nada que tapar después.
 *
 * Y sigue el esquema: en claro parte de `DefaultTheme` y en oscuro de
 * `DarkTheme`, de modo que lo que cambia son los colores de marca, no la
 * naturaleza del tema. Por eso el Stack puede seguir sin `contentStyle` fijo,
 * que era justo lo que se quería evitar: un color escrito a mano se vería con
 * el tono del esquema contrario al cambiar de apariencia.
 */

import { useMemo, type ReactNode } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';

import { useEsquema, useTema } from './ThemeContext';

export function TemaDeNavegacion({ children }: { readonly children: ReactNode }) {
  const tema = useTema();
  const esquema = useEsquema();

  const valor = useMemo(() => {
    const base = esquema === 'claro' ? DefaultTheme : DarkTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        /* El que importaba: es el que pinta el contenedor de la pantalla. */
        background: tema.color.fondo,
        card: tema.color.superficie,
        text: tema.color.textoPrimario,
        border: tema.color.borde,
        primary: tema.color.acento
      }
    };
  }, [esquema, tema]);

  return <ThemeProvider value={valor}>{children}</ThemeProvider>;
}
