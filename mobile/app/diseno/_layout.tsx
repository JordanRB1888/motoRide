/**
 * El recorrido de diseño: la aplicación REAL, navegable sin servidor.
 *
 * QUÉ ES Y POR QUÉ EXISTE
 *
 * Hasta ahora el diseño se revisaba en un dibujo aparte: un generador que
 * escribía HTML a mano imitando las pantallas. Servía para mirar, pero era una
 * segunda interfaz, y toda segunda interfaz acaba divergiendo de la primera.
 *
 * Esto no es un dibujo. Son los componentes de verdad, con el router de verdad
 * —`expo-router`, el mismo que usa el teléfono—, el tema de verdad y los
 * activos de verdad. Lo único de mentira son los datos, que salen de
 * `preview/fixtures.ts`.
 *
 * POR QUÉ NO SE MONTA SOBRE LAS RUTAS CON SESIÓN
 *
 * `app/pasajero.tsx` y `app/conductor.tsx` exigen sesión confirmada por el
 * backend antes de dejar entrar, y esa guarda no se toca: es la que impide que
 * un enlace profundo se salte la autenticación. Sin servidor no se puede pasar
 * por ellas, y montar el diseño ahí obligaría a levantar el backend para mirar
 * una pantalla.
 *
 * Este grupo va por fuera de esa guarda por la misma razón por la que el
 * laboratorio ya podía abrirse sin servidor: NO LLAMA A NINGUNA API. Hay una
 * prueba que lo comprueba.
 *
 * Cuando las pantallas se conecten al backend de verdad, se montan dentro de
 * las rutas con guarda y este grupo desaparece o se queda sólo como recorrido
 * de revisión. Los componentes son los mismos: no hay que rehacer nada.
 *
 * SÓLO EN DESARROLLO
 *
 * En release, `__DEV__` es falso y el grupo redirige a la raíz. Un recorrido
 * que enseña saldos y viajes de ejemplo no puede quedar alcanzable en una
 * aplicación publicada.
 */

import { Redirect, Stack, router, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ProveedorDeTema } from '../../theme/ThemeContext';
import { ProveedorDeNavegacion } from '../../ui/navegar';
import { DESTINO_DE_SERVICIO, RUTA_DE_DESTINO, type DestinoDeDiseno } from '../../navegacion/rutas';

/** `true` sólo cuando Metro sirve la aplicación. En release, `false`. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * De clave a ruta.
 *
 * La clave especial `servicio` viene de las casillas del inicio: no todas
 * llevan al mismo sitio y la casilla no tiene por qué saber cuál. Aquí se mira
 * qué servicio es y se decide; las que no están construidas van a «pronto» con
 * su nombre, para que esa pantalla pueda decir de cuál habla.
 */
function irA(clave: string, parametros?: Record<string, string>) {
  if (clave === 'servicio') {
    const servicio = parametros?.servicio ?? '';
    const destino = DESTINO_DE_SERVICIO[servicio] ?? 'pronto';
    const ruta = RUTA_DE_DESTINO[destino];
    router.push((destino === 'pronto' ? `${ruta}?servicio=${servicio}` : ruta) as never);
    return;
  }

  const ruta = RUTA_DE_DESTINO[clave as DestinoDeDiseno];
  if (ruta === undefined) return;

  // Los demás parámetros viajan tal cual en la query. El detalle de un viaje
  // necesita saber DE CUÁL habla, y una pantalla que siempre enseña el mismo
  // registro no es un detalle: es un ejemplo.
  const consulta = new URLSearchParams(parametros ?? {}).toString();
  router.push((consulta === '' ? ruta : `${ruta}?${consulta}`) as never);
}

export default function RecorridoDeDiseno() {
  // `?tema=claro` y `?tema=oscuro` fuerzan el esquema para revisar.
  //
  // Sin esto habria que esperar a las seis de la tarde para ver el modo noche,
  // o cambiar el reloj del equipo. Es la misma comodidad que tenia el
  // laboratorio con su selector, y no toca la logica del tema: `esquemaForzado`
  // ya existia en el proveedor justo para esto.
  //
  // Sin el parametro manda la hora de Venezuela, como en el telefono.
  // GLOBALES y no locales: en un layout, `useLocalSearchParams` solo ve los
  // parametros de su propio segmento, y la query viaja con la ruta hija.
  const { tema } = useGlobalSearchParams<{ tema?: string }>();
  const forzado = tema === 'claro' || tema === 'oscuro' ? tema : undefined;

  if (!EN_DESARROLLO) return <Redirect href="/" />;

  return (
    <ProveedorDeTema esquemaForzado={forzado}>
      <ProveedorDeNavegacion ir={irA}>
      <StatusBar style="auto" />
      {/*
        Sin cabecera: cada pantalla trae la suya, y una barra de navegación
        encima de la cabecera de la aplicación se ve como lo que es, un marco
        de desarrollo colándose en el diseño.

        La animación se queda en la de la plataforma, que es lo que va a hacer
        el teléfono de verdad.
      */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { flex: 1 } }} />
      </ProveedorDeNavegacion>
    </ProveedorDeTema>
  );
}
