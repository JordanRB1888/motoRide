/**
 * Cómo se va de una pantalla a otra, sin que la interfaz sepa de rutas.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * La barra inferior, las casillas del inicio y las filas del perfil tienen que
 * llevar a algún sitio. La forma directa —importar `router` de `expo-router` y
 * escribir la ruta en cada componente— ata la interfaz a la forma de las rutas:
 * mover una pantalla obligaría a tocar quince ficheros, y estos mismos
 * componentes tienen que poder montarse en dos sitios distintos (el recorrido
 * de diseño hoy, las rutas con sesión mañana) con rutas distintas.
 *
 * Aquí los componentes piden ir a una CLAVE —`saldo`, `historial`— y quien los
 * monta decide qué significa eso.
 *
 * SIN PROVEEDOR NO PASA NADA
 *
 * `useIr()` devuelve una función que no hace nada si nadie provee navegación.
 * Es deliberado: el laboratorio antiguo monta estas mismas pantallas sueltas,
 * sin router, y no puede reventar porque alguien toque una pestaña.
 */

import { createContext, useContext, type ReactNode } from 'react';

/** Llevar a un sitio, nombrado por su clave. */
export type Ir = (clave: string, parametros?: Record<string, string>) => void;

const NO_HACER_NADA: Ir = () => undefined;

const Contexto = createContext<Ir>(NO_HACER_NADA);

export function ProveedorDeNavegacion({ ir, children }: {
  readonly ir: Ir;
  readonly children: ReactNode;
}) {
  return <Contexto.Provider value={ir}>{children}</Contexto.Provider>;
}

/**
 * La función para ir a un destino.
 *
 * Devuelve siempre algo llamable: los componentes no tienen que comprobar si
 * hay navegación antes de usarla.
 */
export function useIr(): Ir {
  return useContext(Contexto);
}
