/**
 * Entrar con Google o con Apple. La única puerta a sus bibliotecas.
 *
 * POR QUÉ UNA SOLA PUERTA
 *
 * Igual que `media/captura.ts` con la cámara: ninguna pantalla importa
 * `@react-native-google-signin/google-signin` ni `expo-apple-authentication`.
 * Así las decisiones que importan —qué se pide, qué se devuelve, qué cuenta
 * como cancelación— están en un sitio, y cambiar de biblioteca mañana no
 * obliga a tocar la interfaz. Hay una prueba que lo vigila.
 *
 * LO ÚNICO QUE SALE DE AQUÍ ES UN TOKEN
 *
 * Ni el correo, ni el nombre, ni el identificador de la cuenta del proveedor
 * viajan como prueba de nada: el servidor no los aceptaría. Lo único que vale
 * es el token firmado por Google o por Apple, que el backend verifica contra
 * las claves públicas del proveedor. Lo demás, cuando llega, es relleno para
 * la ficha —y Apple sólo lo manda la primera vez.
 *
 * CANCELAR NO ES UN ERROR
 *
 * Cerrar el selector es una decisión legítima y frecuente. Se devuelve como
 * `CANCELADO`, no como fallo, para que la pantalla vuelva en silencio en vez
 * de enseñar un aviso rojo por algo que la persona hizo a propósito.
 *
 * LAS BIBLIOTECAS SE CARGAN CUANDO SE USAN
 *
 * Con `import()` y sólo al pulsar. Son módulos nativos: importarlos arriba
 * rompería el paquete de web, donde no existen, y cargarlos al abrir la
 * aplicación cuesta arranque a quien entra con su contraseña.
 *
 * NADA SE REGISTRA. Ni el token, ni el identificador de la cuenta, ni el
 * error del proveedor tal cual.
 */

import { Platform } from 'react-native';

export type ProveedorSocial = 'GOOGLE' | 'APPLE';

/** Lo que la pantalla recibe al terminar. Nunca lleva datos sin firmar. */
export type ResultadoDelProveedor =
  | {
      readonly estado: 'TOKEN';
      readonly proveedor: ProveedorSocial;
      readonly token: string;
      /** Sólo para rellenar la ficha; el servidor no lo cree como prueba. */
      readonly nombre?: string;
      readonly apellido?: string;
    }
  | { readonly estado: 'CANCELADO' }
  | { readonly estado: 'NO_DISPONIBLE' }
  | { readonly estado: 'FALLO_DEL_PROVEEDOR' };

/**
 * Los client ID de Google. Son públicos por definición: identifican a la
 * aplicación, no la autorizan. El *client secret* de Google no existe en el
 * móvil ni hace falta para este flujo.
 *
 * Sin `webClientId` no hay entrada con Google: es el que produce el `aud` del
 * token que el servidor acepta.
 */
export const CLIENTES_DE_GOOGLE = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''
} as const;

/** Si esta plataforma puede ofrecer cada proveedor, mirando sólo al cliente. */
export function soportadoEnEstaPlataforma(proveedor: ProveedorSocial): boolean {
  if (proveedor === 'GOOGLE') {
    // Hace falta el client ID de web en las dos plataformas nativas.
    if (Platform.OS === 'web') return false;
    return CLIENTES_DE_GOOGLE.web !== '';
  }
  // Apple sólo en iOS. En Android y en web haría falta un Service ID y un
  // flujo con redirección, que esta fase no implementa: fingir el botón sería
  // prometer algo que no existe.
  return Platform.OS === 'ios';
}

let googlePreparado = false;

async function prepararGoogle() {
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  if (!googlePreparado) {
    GoogleSignin.configure({
      // El que decide el `aud` del ID token, y por tanto el que el servidor
      // comprueba. En iOS hace falta además el suyo para el flujo nativo.
      webClientId: CLIENTES_DE_GOOGLE.web,
      ...(CLIENTES_DE_GOOGLE.ios ? { iosClientId: CLIENTES_DE_GOOGLE.ios } : {}),
      // No se piden ámbitos extra: para demostrar quién es alguien basta con
      // su perfil básico. Pedir de más es pedir permiso para lo que no se usa.
      scopes: ['profile', 'email'],
      offlineAccess: false
    });
    googlePreparado = true;
  }
  return GoogleSignin;
}

/** Los códigos con los que la biblioteca de Google dice qué pasó. */
const CANCELACIONES_DE_GOOGLE = new Set(['SIGN_IN_CANCELLED', '-5', '12501']);

function esCancelacionDeGoogle(error: unknown): boolean {
  const codigo = String((error as { code?: unknown })?.code ?? '');
  return CANCELACIONES_DE_GOOGLE.has(codigo);
}

function esCancelacionDeApple(error: unknown): boolean {
  // Apple usa `ERR_REQUEST_CANCELED`; alguna versión devuelve `ERR_CANCELED`.
  const codigo = String((error as { code?: unknown })?.code ?? '');
  return codigo === 'ERR_REQUEST_CANCELED' || codigo === 'ERR_CANCELED';
}

async function entrarConGoogle(): Promise<ResultadoDelProveedor> {
  if (!soportadoEnEstaPlataforma('GOOGLE')) return { estado: 'NO_DISPONIBLE' };
  try {
    const GoogleSignin = await prepararGoogle();
    // En Android, sin los servicios de Google actualizados no hay flujo
    // nativo. Se comprueba antes de abrir nada.
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Una sesión anterior en el dispositivo haría que el selector no
    // apareciera y se entrara con la última cuenta sin preguntar.
    await GoogleSignin.signOut().catch(() => {});
    const respuesta = await GoogleSignin.signIn();

    // La versión 13 en adelante envuelve la respuesta en `{ type, data }`.
    const envuelta = respuesta as { type?: string; data?: unknown };
    if (envuelta?.type === 'cancelled') return { estado: 'CANCELADO' };
    const datos = (envuelta?.data ?? respuesta) as {
      idToken?: string | null;
      user?: { givenName?: string | null; familyName?: string | null };
    };

    const token = datos?.idToken ?? null;
    // Sin token no hay nada que demostrar, y no se sigue con lo que el
    // proveedor cuente del usuario.
    if (typeof token !== 'string' || token === '') return { estado: 'FALLO_DEL_PROVEEDOR' };

    return {
      estado: 'TOKEN',
      proveedor: 'GOOGLE',
      token,
      nombre: datos.user?.givenName ?? undefined,
      apellido: datos.user?.familyName ?? undefined
    };
  } catch (error) {
    if (esCancelacionDeGoogle(error)) return { estado: 'CANCELADO' };
    // El error de la biblioteca puede arrastrar el token o la configuración:
    // no se propaga ni se registra, sólo su categoría.
    return { estado: 'FALLO_DEL_PROVEEDOR' };
  }
}

async function entrarConApple(): Promise<ResultadoDelProveedor> {
  if (!soportadoEnEstaPlataforma('APPLE')) return { estado: 'NO_DISPONIBLE' };
  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    // Un iPad viejo o un iOS anterior a 13 no lo tienen.
    if (!(await AppleAuthentication.isAvailableAsync())) return { estado: 'NO_DISPONIBLE' };

    const credencial = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL
      ]
    });

    const token = credencial.identityToken ?? null;
    if (typeof token !== 'string' || token === '') return { estado: 'FALLO_DEL_PROVEEDOR' };

    // Apple entrega el nombre SÓLO en el primer consentimiento. Si viene, se
    // usa; si no, no se inventa: el servidor pondrá el genérico.
    return {
      estado: 'TOKEN',
      proveedor: 'APPLE',
      token,
      nombre: credencial.fullName?.givenName ?? undefined,
      apellido: credencial.fullName?.familyName ?? undefined
    };
  } catch (error) {
    if (esCancelacionDeApple(error)) return { estado: 'CANCELADO' };
    return { estado: 'FALLO_DEL_PROVEEDOR' };
  }
}

/** Abre el selector del proveedor y devuelve su token, o por qué no lo hay. */
export async function entrarCon(proveedor: ProveedorSocial): Promise<ResultadoDelProveedor> {
  return proveedor === 'GOOGLE' ? entrarConGoogle() : entrarConApple();
}
