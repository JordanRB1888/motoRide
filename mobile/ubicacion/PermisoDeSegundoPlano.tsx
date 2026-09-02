/**
 * El permiso para seguir midiendo con la aplicación cerrada.
 *
 * POR QUÉ ESTO VIVE SOLO, Y ARRIBA DEL TODO
 *
 * El permiso es una propiedad del TELÉFONO, no del conductor ni de su jornada.
 * Existe —o no— antes de que nadie inicie sesión, y sobrevive a cerrar la
 * aplicación.
 *
 * Y va por encima de la disponibilidad porque el dueño decidió que ponerse en
 * servicio EXIGE tenerlo:
 *
 *   permiso concedido  ──▶  pedir AVAILABLE  ──▶  el servidor confirma
 *
 * y no al revés. Para que la disponibilidad pueda exigirlo antes de pedir nada
 * al servidor, tiene que poder preguntarle a alguien que ya esté montado. Ese
 * alguien es esto.
 *
 * QUÉ NO HACE
 *
 * No arranca ni para el seguimiento —eso mira además el estado de servicio, y lo
 * decide `SeguimientoDelConductor`— y no pide nada por su cuenta: sólo responde
 * cuando alguien se lo pide, que es cuando el conductor acaba de pulsar
 * «ponerse en servicio» y la explicación se sostiene sola.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

import { type PermisoDeFondo } from '../domain/seguimientoEnSegundoPlano';

export type { PermisoDeFondo };

interface ValorDelPermiso {
  /** Lo último que dijo el sistema. */
  readonly permiso: PermisoDeFondo;
  /**
   * Pide el permiso, explicando antes por qué hace falta.
   *
   * Devuelve si quedó concedido. Quien llama decide qué hacer con el «no»: aquí
   * no se bloquea ni se navega a ningún sitio.
   */
  readonly pedirPermiso: () => Promise<boolean>;
  /** Abre los ajustes del teléfono. Para cuando el sistema ya no pregunta. */
  readonly abrirAjustes: () => Promise<void>;
  /** Vuelve a mirar qué dice el sistema AHORA. */
  readonly refrescar: () => Promise<PermisoDeFondo>;
}

const APAGADO: ValorDelPermiso = {
  permiso: 'DESCONOCIDO',
  pedirPermiso: async () => false,
  abrirAjustes: async () => undefined,
  refrescar: async () => 'DESCONOCIDO'
};

const Contexto = createContext<ValorDelPermiso>(APAGADO);

/** Lo que el sistema dice, traducido. */
async function leerDelSistema(): Promise<PermisoDeFondo> {
  if (Platform.OS === 'web') return 'NO_DISPONIBLE';

  const fondo = await Location.getBackgroundPermissionsAsync();
  if (fondo.granted) return 'CONCEDIDO';

  // Sin el de primer plano, el de segundo plano no se puede ni pedir: Android e
  // iOS lo rechazan de entrada. Se cuenta como denegado —no como bloqueado—
  // porque pedir el primero sigue siendo posible.
  const primerPlano = await Location.getForegroundPermissionsAsync();
  if (!primerPlano.granted) return primerPlano.canAskAgain ? 'DENEGADO' : 'BLOQUEADO';

  // `canAskAgain` en falso es Android diciendo que el diálogo ya no aparecerá.
  // Insistir ahí es pedirle a alguien que responda a una pregunta que nunca ve.
  return fondo.canAskAgain ? 'DENEGADO' : 'BLOQUEADO';
}

/**
 * La explicación, antes del diálogo del sistema.
 *
 * Android recomienda contar por qué se pide, y aquí no es una formalidad: el
 * diálogo del sistema dice «permitir todo el tiempo» sin decir para qué, y a esa
 * pregunta sin contexto casi todo el mundo dice que no. Una vez dicho que no,
 * el sistema deja de preguntar y sólo queda el camino largo por los ajustes.
 *
 * Se resuelve a `true` si quiere continuar.
 */
function explicarYPreguntar(): Promise<boolean> {
  return new Promise(resolver => {
    Alert.alert(
      'Para ponerte en línea',
      'Necesitamos tu ubicación aunque tengas la pantalla apagada. Es lo que permite '
      + 'que te lleguen viajes con el teléfono guardado en el bolsillo.\n\n'
      + 'En la siguiente pantalla elige «Permitir todo el tiempo».\n\n'
      + 'Deja de compartirse en cuanto sales de servicio.',
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolver(false) },
        { text: 'Continuar', onPress: () => resolver(true) }
      ],
      { cancelable: false }
    );
  });
}

/** Cuando el sistema ya no pregunta, el único camino son los ajustes. */
function ofrecerLosAjustes(abrir: () => Promise<void>): Promise<void> {
  return new Promise(resolver => {
    Alert.alert(
      'Falta un permiso',
      'Tu teléfono ya no nos deja preguntarte por la ubicación en segundo plano. '
      + 'Para ponerte en línea, actívala tú en los ajustes:\n\n'
      + 'Ubicación → Permitir todo el tiempo.',
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolver() },
        { text: 'Abrir ajustes', onPress: () => { void abrir(); resolver(); } }
      ],
      { cancelable: false }
    );
  });
}

export function ProveedorDePermisoDeSegundoPlano({ children }: { readonly children: ReactNode }) {
  const [permiso, setPermiso] = useState<PermisoDeFondo>('DESCONOCIDO');

  const refrescar = useCallback(async (): Promise<PermisoDeFondo> => {
    const actual = await leerDelSistema();
    setPermiso(actual);
    return actual;
  }, []);

  // Al montar se pregunta al SISTEMA. Suponerlo sería creerse una respuesta que
  // pudo cambiar desde los ajustes del teléfono mientras la aplicación no
  // estaba, que es justo el caso que hay que detectar.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      const actual = await leerDelSistema();
      if (vigente) setPermiso(actual);
    })();
    return () => { vigente = false; };
  }, []);

  // Y cada vez que se vuelve a la aplicación. Es como se entera de que acaba de
  // volver de los ajustes —sin sondear nada— y también de que alguien le quitó
  // el permiso mientras miraba otra cosa.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const suscripcion = AppState.addEventListener('change', siguiente => {
      if (siguiente !== 'active') return;
      void (async () => setPermiso(await leerDelSistema()))();
    });

    return () => suscripcion.remove();
  }, []);

  const abrirAjustes = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'web') return;
    await Linking.openSettings();
  }, []);

  const pedirPermiso = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      setPermiso('NO_DISPONIBLE');
      return false;
    }

    const antes = await leerDelSistema();
    if (antes === 'CONCEDIDO') {
      setPermiso('CONCEDIDO');
      return true;
    }

    // El sistema ya no pregunta. Se ofrece el camino oficial y se para aquí: no
    // se abre nada por sorpresa ni se insiste con un diálogo invisible.
    if (antes === 'BLOQUEADO') {
      setPermiso('BLOQUEADO');
      await ofrecerLosAjustes(abrirAjustes);
      return false;
    }

    if (!await explicarYPreguntar()) {
      // Ha dicho «ahora no» a la explicación. No se ha gastado el intento del
      // sistema: la próxima vez que pulse el botón se le vuelve a explicar.
      setPermiso(antes);
      return false;
    }

    // El de primer plano va SIEMPRE antes: los dos sistemas rechazan el de
    // segundo plano sin el primero, y pedirlos al revés gasta el único intento.
    const primerPlano = await Location.getForegroundPermissionsAsync();
    if (!primerPlano.granted) {
      const pedido = await Location.requestForegroundPermissionsAsync();
      if (!pedido.granted) {
        const despues = await leerDelSistema();
        setPermiso(despues);
        return false;
      }
    }

    await Location.requestBackgroundPermissionsAsync();

    // Lo que cuenta es lo que el sistema dice DESPUÉS, no lo que devolvió la
    // llamada: en Android el diálogo puede mandar a los ajustes y volver con
    // una respuesta que no refleja lo que el usuario acabó eligiendo.
    const despues = await leerDelSistema();
    setPermiso(despues);
    return despues === 'CONCEDIDO';
  }, [abrirAjustes]);

  const valor = useMemo(
    () => ({ permiso, pedirPermiso, abrirAjustes, refrescar }),
    [permiso, pedirPermiso, abrirAjustes, refrescar]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePermisoDeSegundoPlano(): ValorDelPermiso {
  return useContext(Contexto);
}
