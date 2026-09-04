/**
 * El contexto de sesión.
 *
 * PEQUEÑO A PROPÓSITO
 *
 * Sesión, identidad, entrar, salir y revalidar. Nada más. Ni viajes, ni mapas,
 * ni cartera, ni despacho: un contexto que lo sabe todo obliga a que la
 * aplicación entera se vuelva a pintar cuando cambia cualquier cosa, y acaba
 * siendo el sitio donde se mete lo que no se sabe dónde poner.
 *
 * RESPUESTAS OBSOLETAS
 *
 * Cada operación lleva número. Si alguien pulsa dos veces, o entra, vuelve y
 * entra con otra cuenta, la respuesta de la petición vieja llega después y no
 * debe pisar a la nueva. Sin esto, el caso es fácil de reproducir con red lenta:
 * se acaba con la sesión de la cuenta equivocada.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  SESION_INICIAL,
  type IdentidadDeUsuario,
  type MotivoDeCierre,
  type Sesion
} from '../domain/authState';
import {
  crearCuenta,
  iniciarSesion as pedirAcceso,
  validarSesion,
  type CredencialesDeAcceso,
  type ResultadoDeLogin,
  type ResultadoDeRegistro
} from '../services/auth';
import type { DatosDeRegistro } from '../domain/registro';
import { borrarToken, guardarToken, leerToken } from '../services/session';

export interface ValorDelContexto {
  readonly sesion: Sesion;
  readonly entrar: (credenciales: CredencialesDeAcceso) => Promise<ResultadoDeLogin>;
  /**
   * Crea la cuenta y deja la sesión abierta, por el mismo camino que `entrar`.
   *
   * La cuenta nace como pasajera SIEMPRE: quien se registra para postularse a
   * conductor también. El rol lo concede la aprobación del expediente.
   */
  readonly registrar: (datos: DatosDeRegistro) => Promise<ResultadoDeRegistro>;
  readonly salir: (motivo?: MotivoDeCierre) => Promise<void>;
  /** Vuelve a preguntar al backend. Para reintentar tras un fallo de red. */
  readonly revalidar: () => Promise<void>;
}

const Contexto = createContext<ValorDelContexto | null>(null);

export function ProveedorDeSesion({ children }: { readonly children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion>(SESION_INICIAL);

  // El número de la operación en curso. Sólo la última puede escribir estado.
  const operacion = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  /** Escribe el estado sólo si esta operación sigue siendo la vigente. */
  const aplicar = useCallback((numero: number, siguiente: Sesion) => {
    if (!montado.current || numero !== operacion.current) return;
    setSesion(siguiente);
  }, []);

  /**
   * Arranque y revalidación.
   *
   * 1. ¿hay token? → si no, sin sesión;
   * 2. si lo hay, se PREGUNTA al backend. No se entra por tener una cadena
   *    guardada: eso sólo demuestra que alguien entró alguna vez;
   * 3. inválida → se borra el token;
   * 4. sin conexión → NO se borra, y se queda sin verificar.
   */
  const revalidar = useCallback(async () => {
    const numero = ++operacion.current;

    const token = await leerToken().catch(() => null);
    if (token === null || token === '') {
      aplicar(numero, { estado: 'SIN_SESION', motivo: null });
      return;
    }

    const validacion = await validarSesion();

    if (validacion.resultado === 'VALIDA') {
      aplicar(numero, { estado: 'AUTENTICADO', usuario: validacion.usuario });
      return;
    }

    if (validacion.resultado === 'INVALIDA') {
      // El backend dijo que no. Sólo AQUÍ se borra.
      await borrarToken().catch(() => {});
      aplicar(numero, { estado: 'SIN_SESION', motivo: 'SESION_INVALIDA' });
      return;
    }

    // Sin conexión: el token se CONSERVA. Cerrarle la sesión a alguien porque
    // iba en el metro es un fallo que se nota enseguida.
    aplicar(numero, { estado: 'SIN_VERIFICAR', usuario: null });
  }, [aplicar]);

  useEffect(() => { void revalidar(); }, [revalidar]);

  const registrar = useCallback(async (datos: DatosDeRegistro) => {
    const numero = ++operacion.current;
    aplicar(numero, { estado: 'AUTENTICANDO' });

    const resultado = await crearCuenta(datos);

    // Si mientras tanto empezó otra operación, esta respuesta ya no manda.
    if (numero !== operacion.current) return resultado;

    if (!resultado.ok) {
      aplicar(numero, { estado: 'SIN_SESION', motivo: null });
      return resultado;
    }

    // El token sale del servidor, como en el login. Aquí no se firma nada.
    await guardarToken(resultado.token);
    aplicar(numero, { estado: 'AUTENTICADO', usuario: resultado.usuario });
    return resultado;
  }, [aplicar]);

  const entrar = useCallback(async (credenciales: CredencialesDeAcceso) => {
    const numero = ++operacion.current;
    aplicar(numero, { estado: 'AUTENTICANDO' });

    const resultado = await pedirAcceso(credenciales);

    // Si mientras tanto empezó otra operación, esta respuesta ya no manda.
    if (numero !== operacion.current) return resultado;

    if (!resultado.ok) {
      aplicar(numero, { estado: 'SIN_SESION', motivo: null });
      return resultado;
    }

    await guardarToken(resultado.token);
    aplicar(numero, { estado: 'AUTENTICADO', usuario: resultado.usuario });
    return resultado;
  }, [aplicar]);

  /**
   * Cierra la sesión.
   *
   * Es una operación LOCAL: el backend no tiene endpoint de cierre ni
   * revocación —comprobado leyendo `server/index.js`— así que lo que se puede
   * hacer es borrar el token del dispositivo y olvidar la identidad en memoria.
   */
  const salir = useCallback(async (motivo: MotivoDeCierre = 'PETICION_DE_LA_PERSONA') => {
    const numero = ++operacion.current;
    await borrarToken().catch(() => {});
    aplicar(numero, { estado: 'SIN_SESION', motivo });
  }, [aplicar]);

  const valor = useMemo<ValorDelContexto>(
    () => ({ sesion, entrar, registrar, salir, revalidar }),
    [sesion, entrar, registrar, salir, revalidar]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ValorDelContexto {
  const valor = useContext(Contexto);
  if (valor === null) {
    throw new Error('useSesion necesita estar dentro de <ProveedorDeSesion>');
  }
  return valor;
}

/** Atajo de lectura para pintar. Nunca para autorizar. */
export function useUsuario(): IdentidadDeUsuario | null {
  const { sesion } = useSesion();
  if (sesion.estado === 'AUTENTICADO') return sesion.usuario;
  if (sesion.estado === 'SIN_VERIFICAR') return sesion.usuario;
  return null;
}
