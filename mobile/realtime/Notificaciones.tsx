/**
 * Los avisos push, vivos en la aplicación (PUSH-1 · Firebase).
 *
 * LA PUERTA ÚNICA
 *
 * Es el único fichero que importa `expo-notifications`, igual que
 * `media/captura.ts` es el único que importa el selector de imágenes. Hay
 * una prueba que lo vigila. Todo lo que se puede decidir sin el módulo nativo
 * --qué dice un aviso, a dónde lleva, si conviene pedir permiso-- vive en
 * `domain/notificaciones.ts`, que es puro y se prueba sin emulador.
 *
 * EL PUSH COMPLEMENTA, NO SUSTITUYE
 *
 * El socket sigue siendo el canal principal: con la aplicación abierta, un
 * cambio del viaje llega por él y la pantalla ya lo pinta. El aviso es para el
 * teléfono guardado. Por eso, al tocar un aviso, aquí no se «aplica» nada de lo
 * que trae: se abre la pantalla correcta, y esa pantalla vuelve a preguntar al
 * servidor. Un aviso viejo, ajeno o falsificado abre una puerta que dirá que no
 * hay nada. Nunca pinta un estado.
 *
 * EL PERMISO, CUANDO HAY SESIÓN
 *
 * Ni al arrancar ni en la bienvenida: un permiso que salta antes de que la
 * persona haya hecho nada se deniega casi siempre, y Android no vuelve a
 * preguntar. Se pide cuando la sesión está confirmada, que es el primer momento
 * en que un aviso puede tener sentido, y sólo si nunca se decidió. Si se
 * deniega, no se insiste, y la aplicación funciona igual.
 *
 * EL TELÉFONO NO ES LA PERSONA
 *
 * El token de FCM identifica al aparato. Al cerrar sesión se da de baja la
 * suscripción --mejor esfuerzo-- y al entrar se registra a nombre de quien
 * entró. Si la suscripción guardada era de otra cuenta, se vuelve a registrar
 * sin fiarse de ella. Y el servidor, por su lado, reasigna la fila del mismo
 * token a quien lo registre último: dos cerrojos, ninguno depende del otro.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { router, usePathname } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { useSesion } from '../context/AuthContext';
import {
  CANAL_DE_CARRERAS,
  TEXTO_DE_AVISO,
  convienePedirPermiso,
  destinoDeAviso,
  estadoDePermiso,
  leerAviso,
  type EstadoDePermiso,
  type RolDeSesion
} from '../domain/notificaciones';
import { alCerrarSesion } from '../services/antesDeSalir';
import { darDeBajaDispositivo, registrarDispositivo } from '../services/push';
import {
  borrarSuscripcionPush,
  guardarSuscripcionPush,
  leerSuscripcionPush,
  marcarPermisoPushPedido,
  sePidioPermisoPush
} from '../services/session';


// Trazas sólo en desarrollo, como las del tiempo real. NUNCA el token: es la
// dirección del teléfono y no tiene que estar en ningún registro.
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;
function trazar(mensaje: string): void {
  if (EN_DESARROLLO) console.log(`[+58express avisos] ${mensaje}`);
}

// Con la aplicación ABIERTA presenta la propia aplicación, con su tabla de
// textos. Este manejador decide cómo se muestran las notificaciones LOCALES
// que la aplicación programa (ver `presentarConLaAplicacionAbierta`): expo no
// le pregunta por los mensajes remotos solo-datos, por coherencia con iOS.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  }),
  handleSuccess: () => trazar('aviso presentado con la aplicación abierta'),
  handleError: (_id, error) => trazar(`no se pudo presentar con la aplicación abierta: ${error instanceof Error ? error.message.slice(0, 80) : 'error'}`)
});

interface ValorDeNotificaciones {
  readonly permiso: EstadoDePermiso;
}

const Contexto = createContext<ValorDeNotificaciones>({ permiso: 'sin_decidir' });

export function useNotificaciones(): ValorDeNotificaciones {
  return useContext(Contexto);
}

/**
 * Un aviso remoto que llega con la aplicación abierta.
 *
 * Con la aplicación cerrada lo presenta Android con lo que manda el servidor.
 * Abierta, expo entrega el mensaje solo-datos al oyente de recepción y NO lo
 * presenta ni consulta al manejador (por coherencia con iOS). Así que lo
 * presenta la propia aplicación, con SU tabla --que es espejo de la del
 * servidor-- y con los MISMOS datos, para que tocarlo abra la misma puerta.
 *
 * Sólo los remotos (`trigger.type === 'push'`): la notificación local que se
 * programa aquí vuelve a pasar por el mismo oyente, y sin esta guarda se
 * presentaría a sí misma sin final.
 */
function presentarConLaAplicacionAbierta(notificacion: Notifications.Notification): void {
  const aviso = leerAviso(notificacion.request.content.data);
  trazar(`aviso recibido con la aplicación abierta: ${aviso?.tipo ?? 'ajeno'}`);
  const disparador = notificacion.request.trigger;
  const esRemoto = disparador !== null && typeof disparador === 'object' && 'type' in disparador && disparador.type === 'push';
  if (aviso === null || !esRemoto) return;
  const texto = TEXTO_DE_AVISO[aviso.tipo] ?? TEXTO_DE_AVISO.por_omision;
  void Notifications.scheduleNotificationAsync({
    content: { title: texto.title, body: texto.body, data: notificacion.request.content.data },
    trigger: { channelId: CANAL_DE_CARRERAS }
  }).then(
    () => trazar('aviso presentado por la aplicación'),
    () => trazar('no se pudo presentar el aviso con la aplicación abierta')
  );
}

async function leerPermiso(): Promise<EstadoDePermiso> {
  const [p, yaSePidio] = await Promise.all([Notifications.getPermissionsAsync(), sePidioPermisoPush()]);
  return estadoDePermiso(p.granted, p.canAskAgain, p.status, yaSePidio);
}

async function pedirPermiso(): Promise<EstadoDePermiso> {
  const p = await Notifications.requestPermissionsAsync();
  // Se anota DESPUÉS de la respuesta: «se pidió» quiere decir «se contestó».
  // Si la aplicación muere con el diálogo abierto, nadie contestó, y volver a
  // preguntar es lo correcto. Marcar antes convertiría esa muerte en negativa.
  await marcarPermisoPushPedido();
  return estadoDePermiso(p.granted, p.canAskAgain, p.status, true);
}

export function ProveedorDeNotificaciones({ children }: { readonly children: ReactNode }) {
  const { sesion } = useSesion();
  const permisoRef = useRef<EstadoDePermiso>('sin_decidir');
  // Qué aviso se abrió ya, para no navegar dos veces al mismo: el arranque en
  // frío y el oyente de respuestas pueden entregar el mismo toque.
  const ultimoAvisoAbierto = useRef<string | null>(null);

  const rol: RolDeSesion = sesion.estado === 'AUTENTICADO'
    ? (sesion.usuario.role === 'driver' ? 'driver' : 'passenger')
    : null;
  const usuarioId = sesion.estado === 'AUTENTICADO' ? sesion.usuario.id : null;
  // «/» es el índice decidiendo a dónde mandar a la persona. Ver `abrir`.
  const ruta = usePathname();

  // El canal de Android se declara una vez, exista o no sesión: es del
  // teléfono, y Android exige que esté antes del primer aviso.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void Notifications.setNotificationChannelAsync(CANAL_DE_CARRERAS, {
      name: 'Carreras y viajes',
      importance: Notifications.AndroidImportance.MAX,
      // Sin `sound`: el del sistema. Un nombre aqui es un fichero propio, y no hay.
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#ffd21f',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC
    });
  }, []);

  // REGISTRO Y BAJA, atados a la sesión.
  useEffect(() => {
    let vivo = true;

    if (usuarioId === null) {
      // Sin sesión. La baja de verdad ocurrió en la despedida (abajo), con el
      // token todavía vivo. Esto es la red de seguridad para cuando la sesión
      // se perdió por otro camino: si quedó algo guardado, se olvida y se
      // intenta la baja --que sin token no valdrá, y el servidor reasignará la
      // fila a quien registre el mismo token después--.
      void (async () => {
        const guardada = await leerSuscripcionPush();
        if (guardada === null) return;
        await borrarSuscripcionPush();
        await darDeBajaDispositivo(guardada.id).catch(() => false);
      })();
      return;
    }

    // LA DESPEDIDA: al cerrar sesión, dar de baja el dispositivo ANTES de que
    // se borre el token. Después ya no se puede: el DELETE saldría sin
    // autenticación y la fila quedaría viva a nombre de quien ya se fue.
    const retirarDespedida = alCerrarSesion(async () => {
      const guardada = await leerSuscripcionPush();
      if (guardada === null) {
        trazar('despedida: no había suscripción guardada');
        return;
      }
      const baja = await darDeBajaDispositivo(guardada.id);
      trazar(baja ? 'dispositivo dado de baja al cerrar sesión' : 'el servidor no aceptó la baja al cerrar sesión');
      await borrarSuscripcionPush();
    });

    void (async () => {
      let permiso = await leerPermiso();
      if (convienePedirPermiso(permiso)) permiso = await pedirPermiso();
      permisoRef.current = permiso;
      trazar(`permiso: ${permiso}`);
      if (!vivo || permiso !== 'concedido') return;

      // La suscripción guardada sólo vale si es de quien está delante.
      const guardada = await leerSuscripcionPush();
      if (guardada !== null && guardada.userId !== usuarioId) {
        await borrarSuscripcionPush();
        await darDeBajaDispositivo(guardada.id).catch(() => false);
      }

      let token = '';
      try {
        const dispositivo = await Notifications.getDevicePushTokenAsync();
        token = typeof dispositivo.data === 'string' ? dispositivo.data : '';
      } catch (error) {
        // Sin Play Services, o el emulador sin Google: no hay token y no pasa
        // nada. La aplicación sigue con el socket.
        trazar(`sin token del dispositivo (${error instanceof Error ? error.name : 'error'})`);
        return;
      }
      if (!vivo || token === '') return;
      trazar(`token del dispositivo obtenido (${token.length} caracteres)`);

      const plataforma = Platform.OS === 'ios' ? 'ios' : 'android';
      const registrada = await registrarDispositivo(token, plataforma);
      trazar(registrada === null ? 'el servidor no aceptó el registro' : 'dispositivo registrado');
      if (vivo && registrada !== null) await guardarSuscripcionPush({ userId: usuarioId, id: registrada.id });
    })();

    // Si el token rota mientras hay sesión, se vuelve a registrar.
    const rotacion = Notifications.addPushTokenListener(nuevo => {
      const token = typeof nuevo.data === 'string' ? nuevo.data : '';
      if (token === '' || usuarioId === null) return;
      void registrarDispositivo(token, Platform.OS === 'ios' ? 'ios' : 'android').then(registrada => {
        if (registrada !== null) void guardarSuscripcionPush({ userId: usuarioId, id: registrada.id });
      });
    });

    return () => {
      vivo = false;
      rotacion.remove();
      retirarDespedida();
    };
  }, [usuarioId]);

  // ABRIR DESDE UN AVISO: el toque, y el arranque en frío.
  useEffect(() => {
    const abrir = (respuesta: Notifications.NotificationResponse | null) => {
      if (respuesta === null) return;
      // En el arranque en frío la última respuesta llega ANTES de que se
      // conozca la sesión, y antes de que el índice («/») haya redirigido al
      // inicio de cada rol con un `replace` que se lleva por delante lo que
      // haya encima. Sin esto se abría «/» o se pisaba el destino, y el aviso
      // quedaba marcado como abierto. Se deja pendiente sin marcar: este
      // efecto vuelve a correr cuando cambie la sesión o la ruta, vuelve a
      // pedir la última respuesta, y entonces sí se abre, encima del inicio.
      if (rol === null || ruta === '/') {
        trazar('aviso a la espera de conocer la sesión y el inicio');
        return;
      }
      const identificador = respuesta.notification.request.identifier;
      if (identificador === ultimoAvisoAbierto.current) return;
      ultimoAvisoAbierto.current = identificador;

      const aviso = leerAviso(respuesta.notification.request.content.data);
      if (aviso === null) {
        trazar('aviso tocado que no es nuestro: se ignora');
        return;
      }
      // La pantalla destino vuelve a preguntar al servidor: aquí no se aplica
      // nada del payload, sólo se abre la puerta.
      //
      // Se NAVEGA, no se apila: `navigate` vuelve a la pantalla si ya está en
      // la pila y sólo la crea si no está. Con `push`, tocar la oferta con la
      // pantalla del conductor ya abierta montaba una segunda instancia cuyo
      // estado de oferta nacía vacío, y la tarjeta que sí estaba en la de
      // abajo no se veía. Se aprendió en el laboratorio.
      const destino = destinoDeAviso(aviso, rol);
      trazar(`aviso tocado: ${aviso.tipo} -> ${destino}`);
      router.navigate(destino as never);
    };

    const oyente = Notifications.addNotificationResponseReceivedListener(abrir);
    // Con la aplicación ABIERTA el aviso llega aquí y lo presenta la propia
    // aplicación, con su tabla. La pantalla ya lo sabe por el socket.
    const recibido = Notifications.addNotificationReceivedListener(presentarConLaAplicacionAbierta);
    void Notifications.getLastNotificationResponseAsync().then(respuesta => {
      trazar(respuesta === null ? 'arranque sin aviso pendiente' : 'arranque desde un aviso');
      abrir(respuesta);
    });
    return () => { oyente.remove(); recibido.remove(); };
  }, [rol, ruta]);

  return (
    <Contexto.Provider value={{ permiso: permisoRef.current }}>
      {children}
    </Contexto.Provider>
  );
}
