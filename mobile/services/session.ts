/**
 * La sesión en el dispositivo.
 *
 * DÓNDE VIVE EL TOKEN
 *
 * En el almacén seguro del sistema —Keychain en iOS, Keystore en Android— a
 * través de `expo-secure-store`. **Nunca** en almacenamiento plano.
 *
 * La diferencia importa: el almacenamiento plano de una aplicación es un fichero
 * corriente del sandbox. En un teléfono con root, en una copia de seguridad sin
 * cifrar o con acceso físico al dispositivo, ese fichero se lee. El almacén
 * seguro está respaldado por el hardware y protegido por el desbloqueo del
 * dispositivo.
 *
 * SOBRE LAS PREFERENCIAS
 *
 * El último rol elegido NO es un secreto y su sitio natural sería un almacén
 * ligero (`AsyncStorage`). En esta fase va también al almacén seguro, por un
 * motivo concreto y verificado: `@react-native-async-storage/async-storage@2.2.0`
 * declara incompatibilidad con `react@19.2.3`, y no se ha querido forzar la
 * instalación de una dependencia que dice no soportar la versión de React que
 * usa el proyecto.
 *
 * Es una decisión conservadora, no un error: guardar un dato no sensible en un
 * sitio más protegido de lo necesario no rompe nada. Cuando AsyncStorage soporte
 * React 19, las preferencias se mueven allí — las dos funciones ya están
 * separadas para que sea un cambio local.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { UserRole } from '../../shared/contracts/domain';

/** Las claves del almacén. Estables: cambiarlas cierra la sesión de todo el mundo. */
const CLAVE_TOKEN = 'plus58express.session.token';
const CLAVE_ULTIMO_ROL = 'plus58express.preferencias.ultimoRol';

/**
 * Expo web no implementa SecureStore. El respaldo plano existe únicamente en
 * el laboratorio web de desarrollo para poder recorrer la UI autenticada; un
 * paquete nativo y cualquier build publicada siguen usando Keychain/Keystore.
 */
function almacenamientoDelLaboratorioWeb(): Storage | null {
  if (Platform.OS !== 'web' || typeof __DEV__ === 'undefined' || !__DEV__) return null;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

/** Los roles que la aplicación móvil ofrece elegir. */
export const ROLES_MOVILES = ['passenger', 'driver'] as const;
export type RolMovil = (typeof ROLES_MOVILES)[number];

/**
 * Comprueba en tiempo de compilación que los roles móviles son un subconjunto
 * de los roles del dominio compartido.
 *
 * Si alguien renombra un rol en `shared/contracts/domain.ts`, esto deja de
 * compilar. Es mejor que descubrirlo cuando la aplicación pida un rol que el
 * backend no reconoce.
 */
const _rolesValidos: readonly UserRole[] = ROLES_MOVILES;
void _rolesValidos;

export function esRolMovil(valor: unknown): valor is RolMovil {
  return typeof valor === 'string' && (ROLES_MOVILES as readonly string[]).includes(valor);
}

/**
 * Guarda el token de sesión.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: sólo accesible con el dispositivo
 * desbloqueado, y **no viaja en las copias de seguridad**. Una sesión
 * restaurada en otro teléfono desde un backup es una sesión que su dueño no
 * abrió ahí.
 */
export async function guardarToken(token: string): Promise<void> {
  const web = almacenamientoDelLaboratorioWeb();
  if (web !== null) {
    web.setItem(CLAVE_TOKEN, token);
    return;
  }
  await SecureStore.setItemAsync(CLAVE_TOKEN, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

export async function leerToken(): Promise<string | null> {
  const web = almacenamientoDelLaboratorioWeb();
  if (web !== null) return web.getItem(CLAVE_TOKEN);
  return SecureStore.getItemAsync(CLAVE_TOKEN);
}

/** Cierra la sesión. Borra el token; la preferencia de rol se conserva. */
export async function borrarToken(): Promise<void> {
  const web = almacenamientoDelLaboratorioWeb();
  if (web !== null) {
    web.removeItem(CLAVE_TOKEN);
    return;
  }
  await SecureStore.deleteItemAsync(CLAVE_TOKEN);
}

/**
 * Recuerda qué experiencia eligió la persona la última vez.
 *
 * ESTO NO ES UN PERMISO. Es una preferencia de navegación: decide qué pantalla
 * se muestra primero, nada más. No concede acceso, no salta la aprobación de
 * conductor y el backend no la mira nunca. Quien elija «Conductor» sin estar
 * aprobado verá la pantalla que le corresponda según su estado real.
 */
export async function guardarUltimoRol(rol: RolMovil): Promise<void> {
  const web = almacenamientoDelLaboratorioWeb();
  if (web !== null) {
    web.setItem(CLAVE_ULTIMO_ROL, rol);
    return;
  }
  await SecureStore.setItemAsync(CLAVE_ULTIMO_ROL, rol);
}

export async function leerUltimoRol(): Promise<RolMovil | null> {
  const web = almacenamientoDelLaboratorioWeb();
  const guardado = web !== null
    ? web.getItem(CLAVE_ULTIMO_ROL)
    : await SecureStore.getItemAsync(CLAVE_ULTIMO_ROL);
  return esRolMovil(guardado) ? guardado : null;
}

/** Borra todo lo de esta aplicación. Para «cerrar sesión y olvidar el dispositivo». */
export async function olvidarTodo(): Promise<void> {
  const web = almacenamientoDelLaboratorioWeb();
  if (web !== null) {
    web.removeItem(CLAVE_TOKEN);
    web.removeItem(CLAVE_ULTIMO_ROL);
    return;
  }
  await SecureStore.deleteItemAsync(CLAVE_TOKEN);
  await SecureStore.deleteItemAsync(CLAVE_ULTIMO_ROL);
}
