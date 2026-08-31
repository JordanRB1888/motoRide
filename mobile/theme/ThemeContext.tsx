/**
 * Qué se está pintando: qué dirección visual y si es de día o de noche.
 *
 * DOS COSAS DISTINTAS EN EL MISMO SITIO
 *
 * La DIRECCIÓN —A, B, C, C2— es el carácter: cuánto aire, qué radios, qué
 * escala tipográfica. Sólo el laboratorio la cambia; la aplicación real usa la
 * recomendada y no ofrece elegir.
 *
 * El ESQUEMA —claro u oscuro— es de la persona, y sí se elige: en Configuración
 * hay Automático, Día y Noche.
 *
 * Van juntos porque un componente necesita las dos cosas a la vez, y separarlos
 * en dos proveedores obligaría a leer dos contextos en cada pantalla.
 *
 * CÓMO SE DECIDE EL AUTOMÁTICO
 *
 * Por la hora de Venezuela, no la del teléfono. El porqué está en
 * `horaVenezuela.ts`; aquí sólo se usa.
 *
 * NO SE PREGUNTA LA HORA CADA MINUTO
 *
 * Se calcula cuándo es el próximo amanecer o anochecer y se programa UN aviso.
 * La aplicación pasa la tarde entera sin hacer nada y despierta a las 18:00
 * clavadas. Preguntar cada minuto para que algo cambie dos veces al día es
 * gastar batería en no enterarse de nada.
 *
 * Y se vuelve a mirar al volver del segundo plano: un temporizador no corre con
 * el teléfono bloqueado, así que quien deja la aplicación a las 17:30 y vuelve
 * a las 19:00 la encontraría en claro.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  CATALOGO,
  DIRECCION_RECOMENDADA,
  type ClaveDeDireccion,
  type Direccion
} from './directions';
import { ESQUEMA_CLARO, ESQUEMA_OSCURO, SOMBRA_POR_ESQUEMA } from './esquemas';
import {
  esquemaEfectivo,
  proximoCambio,
  type Apariencia,
  type Esquema
} from './horaVenezuela';
import { guardarApariencia, leerApariencia } from '../services/preferencias';

/** El tema completo: el carácter de la dirección con los colores del esquema. */
export type Tema = Direccion;

interface ValorDelTema {
  readonly tema: Tema;
  readonly clave: ClaveDeDireccion;
  /** Lo que la persona eligió: automático, día o noche. */
  readonly apariencia: Apariencia;
  /** Lo que se está pintando de verdad, ya resuelto. */
  readonly esquema: Esquema;
  readonly cambiarApariencia: (apariencia: Apariencia) => void;
  /** Sólo el laboratorio la usa. */
  readonly cambiarDireccion: (clave: ClaveDeDireccion) => void;
}

const Contexto = createContext<ValorDelTema | null>(null);

/** Junta el carácter de una dirección con los colores de un esquema. */
export function componerTema(clave: ClaveDeDireccion, esquema: Esquema): Tema {
  const direccion = CATALOGO[clave];
  return {
    ...direccion,
    color: esquema === 'claro' ? ESQUEMA_CLARO : ESQUEMA_OSCURO,
    superficie: {
      ...direccion.superficie,
      sombra: SOMBRA_POR_ESQUEMA[esquema]
    }
  };
}

export function ProveedorDeTema({
  children,
  inicial = DIRECCION_RECOMENDADA,
  esquemaForzado
}: {
  readonly children: ReactNode;
  readonly inicial?: ClaveDeDireccion;
  /**
   * Fuerza un esquema y desactiva la hora.
   *
   * Es para el laboratorio y las pruebas: deja comparar día y noche sin tocar
   * el reloj del equipo. No existe en la aplicación real.
   */
  readonly esquemaForzado?: Esquema;
}) {
  const [clave, setClave] = useState<ClaveDeDireccion>(inicial);
  const [apariencia, setApariencia] = useState<Apariencia>('auto');
  const [ahora, setAhora] = useState(() => new Date());

  // Lo que se guardó la última vez. Se lee una sola vez, al arrancar.
  useEffect(() => {
    let vigente = true;
    leerApariencia()
      .then(guardada => { if (vigente && guardada) setApariencia(guardada); })
      .catch(() => { /* sin preferencia guardada se queda en automático */ });
    return () => { vigente = false; };
  }, []);

  const cambiarApariencia = useCallback((siguiente: Apariencia) => {
    setApariencia(siguiente);
    // Al volver a automático hay que recalcular ya: si se eligió «día» de noche
    // y ahora se vuelve a automático, la pantalla tiene que oscurecerse en ese
    // momento y no en el próximo amanecer.
    setAhora(new Date());
    void guardarApariencia(siguiente);
  }, []);

  const esquema: Esquema = esquemaForzado ?? esquemaEfectivo(apariencia, ahora);

  // El aviso para el próximo amanecer o anochecer.
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (esquemaForzado !== undefined || apariencia !== 'auto') {
      // Con un esquema elegido a mano la hora deja de importar: no hay nada que
      // esperar y el temporizador sólo gastaría batería.
      return;
    }

    const faltan = Math.max(0, proximoCambio(ahora).getTime() - Date.now());

    // `setTimeout` guarda el retardo en 32 bits: por encima de unos 24,8 días
    // desborda y dispara al instante. Aquí nunca pasa de 24 horas, pero el
    // tope se pone igual, porque el día que alguien toque las horas esto
    // fallaría de una forma muy difícil de encontrar.
    const espera = Math.min(faltan, 2_147_000_000);

    temporizador.current = setTimeout(() => setAhora(new Date()), espera);
    return () => { if (temporizador.current) clearTimeout(temporizador.current); };
  }, [apariencia, ahora, esquemaForzado]);

  // Volver del segundo plano: el temporizador no corre con el teléfono
  // bloqueado, así que hay que mirar la hora otra vez.
  useEffect(() => {
    if (esquemaForzado !== undefined) return;

    const suscripcion = AppState.addEventListener('change', (estado: AppStateStatus) => {
      if (estado === 'active') setAhora(new Date());
    });
    return () => suscripcion.remove();
  }, [esquemaForzado]);

  const valor = useMemo<ValorDelTema>(
    () => ({
      tema: componerTema(clave, esquema),
      clave,
      apariencia,
      esquema,
      cambiarApariencia,
      cambiarDireccion: setClave
    }),
    [clave, esquema, apariencia, cambiarApariencia]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * El tema activo.
 *
 * Sin proveedor devuelve la dirección recomendada en oscuro, que es lo que la
 * aplicación tenía antes de haber temas. Así una pantalla suelta —una prueba,
 * un componente aislado— no revienta por no estar envuelta.
 */
export function useTema(): Tema {
  return useContext(Contexto)?.tema ?? componerTema(DIRECCION_RECOMENDADA, 'oscuro');
}

/** Qué esquema se está pintando. Para los pocos sitios que necesitan saberlo. */
export function useEsquema(): Esquema {
  return useContext(Contexto)?.esquema ?? 'oscuro';
}

/** La preferencia y cómo cambiarla. Lo usa Configuración. */
export function useApariencia(): {
  readonly apariencia: Apariencia;
  readonly esquema: Esquema;
  readonly cambiarApariencia: (apariencia: Apariencia) => void;
} {
  const valor = useContext(Contexto);
  if (valor === null) {
    return { apariencia: 'auto', esquema: 'oscuro', cambiarApariencia: () => undefined };
  }
  return {
    apariencia: valor.apariencia,
    esquema: valor.esquema,
    cambiarApariencia: valor.cambiarApariencia
  };
}

/** El control del laboratorio. Lanza fuera de él, que es donde no debe usarse. */
export function useControlDeTema(): ValorDelTema {
  const valor = useContext(Contexto);
  if (valor === null) {
    throw new Error('useControlDeTema sólo funciona dentro del laboratorio visual');
  }
  return valor;
}
