/**
 * Qué dirección visual está activa.
 *
 * Existe para que el laboratorio pueda cambiar entre A, B y C con los MISMOS
 * datos en pantalla. Sin esto, comparar exigiría tres copias de cada pantalla y
 * la comparación dejaría de ser justa: se estaría eligiendo entre contenidos.
 *
 * FUERA DEL LABORATORIO SÓLO HAY UNA
 *
 * La aplicación real usa la dirección recomendada y no ofrece cambiarla. El
 * selector vive únicamente en el laboratorio, que sólo existe en desarrollo.
 */

import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  CATALOGO,
  DIRECCION_RECOMENDADA,
  type ClaveDeDireccion,
  type Direccion
} from './directions';

interface ValorDelTema {
  readonly tema: Direccion;
  readonly clave: ClaveDeDireccion;
  /** Sólo el laboratorio la usa. */
  readonly cambiarDireccion: (clave: ClaveDeDireccion) => void;
}

const Contexto = createContext<ValorDelTema | null>(null);

export function ProveedorDeTema({
  children,
  inicial = DIRECCION_RECOMENDADA
}: {
  readonly children: ReactNode;
  readonly inicial?: ClaveDeDireccion;
}) {
  const [clave, setClave] = useState<ClaveDeDireccion>(inicial);

  const valor = useMemo<ValorDelTema>(
    () => ({ tema: CATALOGO[clave], clave, cambiarDireccion: setClave }),
    [clave]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * El tema activo.
 *
 * Sin proveedor devuelve la dirección recomendada en lugar de fallar: una
 * pantalla de la aplicación real no tiene por qué estar envuelta en el
 * laboratorio para saber de qué color es un botón.
 */
export function useTema(): Direccion {
  return useContext(Contexto)?.tema ?? CATALOGO[DIRECCION_RECOMENDADA];
}

/** El control del laboratorio. Lanza fuera de él, que es donde no debe usarse. */
export function useControlDeTema(): ValorDelTema {
  const valor = useContext(Contexto);
  if (valor === null) {
    throw new Error('useControlDeTema sólo funciona dentro del laboratorio visual');
  }
  return valor;
}
