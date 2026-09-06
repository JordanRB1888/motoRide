/**
 * La raíz de la aplicación.
 *
 * Monta el proveedor de áreas seguras, fija el tema oscuro de la marca y —antes
 * que nada— comprueba que hay una configuración válida.
 *
 * EL AVISO DE CONFIGURACIÓN NO ES UN DETALLE
 *
 * Si falta `EXPO_PUBLIC_API_BASE_URL`, la aplicación **enseña el problema** en
 * lugar de arrancar. La alternativa habitual —caer a la URL de producción— hace
 * que alguien depure contra la base real sin enterarse: crea viajes de prueba y
 * mueve saldos de personas reales. Se descubre tarde o no se descubre.
 *
 * Aquí se ve en la primera pantalla, dice qué falta y no llama a ningún sitio.
 *
 * EL LABORATORIO VISUAL SÍ SE PUEDE ABRIR SIN SERVIDOR
 *
 * Y hay que poder abrirlo: no llama a ninguna API —hay una prueba que lo
 * comprueba—, así que exigirle un backend configurado era una traba inventada.
 * Quien quiere ver cómo va quedando el diseño no debería tener que levantar el
 * servidor primero.
 *
 * La guarda no se toca: sin servidor NO se monta el proveedor de sesión, ni las
 * pantallas reales, ni se llama a nada. Sólo se ofrece la puerta al laboratorio,
 * y sólo en desarrollo, porque el propio laboratorio se apaga en release.
 */

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

import { procedenciaDelBundle } from '../dev/procedenciaDelBundle';

import { configuracion } from '../config/environment';
import { ProveedorDeSesion } from '../context/AuthContext';
import { ProveedorDeTiempoReal } from '../realtime/ProveedorDeTiempoReal';
import { ProveedorDeViajeActivo } from '../realtime/ViajeActivo';
import { ProveedorDeUbicacion } from '../ubicacion/UbicacionDelDispositivo';
import { ProveedorDeSeguimiento } from '../ubicacion/SeguimientoDelConductor';
import { ProveedorDePermisoDeSegundoPlano } from '../ubicacion/PermisoDeSegundoPlano';
import { ProveedorDeDisponibilidad } from '../realtime/Disponibilidad';
import { ProveedorDeUbicacionEnVivo } from '../realtime/UbicacionEnVivo';
import { ProveedorDeNotificaciones } from '../realtime/Notificaciones';
import { ProveedorDeTema } from '../theme/ThemeContext';
import { colores, espaciado, radios, tipografia } from '../theme/tokens';
import { Pantalla } from '../components/Pantalla';
import LaboratorioVisual from './preview';

/** `true` sólo cuando Metro sirve la aplicación. En release, `false`. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * De qué carpeta salió este código, dicho en voz alta al arrancar.
 *
 * Con varios worktrees abiertos, el bundler que responde en el puerto por
 * omisión puede ser el de otra rama, y entonces se depura código ajeno sin
 * enterarse. El porqué completo está en `dev/procedenciaDelBundle.ts`.
 *
 * VA EN UN EFECTO, Y NO AL CARGAR EL MÓDULO, PORQUE SI NO NO SE LEE. Un
 * `console.log` de nivel de módulo se emite antes de que el canal de registro
 * llegue a la consola de Metro: se ejecuta, no falla, y no aparece en ningún
 * sitio. Comprobado en el emulador. Al montar ya está el canal abierto.
 *
 * LOS DOS DATOS SALEN DEL MANIFIESTO, que es quien arranca la aplicación. En
 * el uso normal el manifiesto y el bundle vienen del mismo Metro, así que la
 * línea describe el código en ejecución. Si alguien cambia a mano la ubicación
 * del bundle sin reiniciar —el menú de desarrollo lo permite—, el JavaScript
 * puede venir de otro sitio y esta línea seguirá hablando del manifiesto.
 *
 * La alternativa —preguntarle al módulo nativo por la URL del script— hoy sólo
 * responde por un import profundo que React Native ya marca como obsoleto, y
 * no vale la pena un aviso de obsolescencia en cada arranque a cambio de
 * cubrir un apaño de depuración.
 *
 * Nunca en release: `EN_DESARROLLO` es `false` y `app.config.js` tampoco
 * escribe el nombre de la carpeta.
 */
function useAvisoDeProcedencia() {
  useEffect(() => {
    if (!EN_DESARROLLO) return;
    const linea = procedenciaDelBundle({
      worktree: Constants.expoConfig?.extra?.worktreeDeDesarrollo as string | undefined,
      urlDelBundle: Constants.expoConfig?.hostUri
    });
    if (linea !== null) console.log(`[+58express dev] ${linea}`);
  }, []);
}

function AvisoDeConfiguracion({ detalle }: { readonly detalle: string }) {
  const [verLaboratorio, setVerLaboratorio] = useState(false);

  // El laboratorio se monta tal cual, sin router y sin sesión: no necesita ni
  // una cosa ni la otra. Su propia guarda `__DEV__` sigue mandando dentro.
  if (verLaboratorio && EN_DESARROLLO) return <LaboratorioVisual />;

  return (
    <Pantalla testID="aviso-configuracion">
      <View style={estilos.centro}>
        <View style={estilos.tarjeta}>
          <Text style={estilos.titulo} accessibilityRole="header">
            Falta configurar el servidor
          </Text>
          <Text style={estilos.detalle}>{detalle}</Text>
          <Text style={estilos.nota}>
            La aplicación no elige un servidor por su cuenta, y nunca usa producción
            por omisión.
          </Text>
        </View>

        {/* Aquí NO se puede usar `AtajoAlLaboratorio`: ese navega con el router,
            y sin configuración el Stack no está montado. Este monta el
            laboratorio directamente, que es lo único que funciona sin router. */}
        {EN_DESARROLLO ? (
          <Pressable
            onPress={() => setVerLaboratorio(true)}
            accessibilityRole="button"
            accessibilityLabel="Ver el laboratorio visual, que no necesita servidor"
            testID="abrir-laboratorio"
            style={({ pressed }) => [estilos.atajo, pressed && estilos.atajoPulsado]}
          >
            <Text style={estilos.atajoTitulo}>Ver el laboratorio visual</Text>
            <Text style={estilos.atajoNota}>
              No necesita servidor: son pantallas de muestra, sin datos reales.
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pantalla>
  );
}

export default function DisposicionRaiz() {
  useAvisoDeProcedencia();

  return (
    <SafeAreaProvider>
      {/* El tema envuelve TODO, incluida la pantalla de configuración
          faltante: si un aviso de error se pintara con otros colores que el
          resto, se leería como si viniera de otra aplicación.

          Y va por FUERA de la sesión: el tema no depende de quién haya
          entrado, así que cerrar sesión no tiene por qué remontarlo. */}
      <ProveedorDeTema>
      {configuracion.ok ? (
        // El proveedor va DENTRO de la comprobación de configuración: sin
        // servidor al que preguntar, arrancar la sesión no tendría sentido y
        // sólo produciría un fallo de red confuso.
        <ProveedorDeSesion>
          {/* El tiempo real va DENTRO de la sesión y una sola vez, aquí.
              Es lo que garantiza «una sesión, un socket»: montarlo en cada
              pantalla abriría una conexión por pantalla, y navegar entre
              pestañas sería abrir y cerrar conexiones.

              No conecta solo: espera a que la sesión esté confirmada, y se
              queda apagado en el recorrido de diseño. */}
          <ProveedorDeTiempoReal>
          {/* El viaje activo va DENTRO del tiempo real: se apoya en su resync
              y en sus eventos. Y una sola vez, como él: dos autoridades del
              mismo viaje acabarían discrepando. */}
          <ProveedorDeViajeActivo>
          {/* El GPS del telefono, uno para toda la aplicacion.

              Va aqui dentro para que solo exista con sesion: no tiene sentido
              pedirle la ubicacion a alguien que todavia no ha entrado, y en el
              recorrido de diseño no se monta.

              No pide permiso al arrancar. Espera a que una pantalla lo pida,
              cuando el usuario esta haciendo algo que lo justifica: un permiso
              que salta nada mas abrir la aplicacion se deniega casi siempre. */}
          {/* El permiso para medir con la aplicacion cerrada. Va POR ENCIMA de
              la disponibilidad porque ponerse en servicio lo EXIGE: primero el
              permiso, y solo entonces se le pide el estado al servidor. Al
              reves quedaria una ventana en la que el despacho ya cuenta con un
              conductor que quiza no pueda decir donde esta.

              Es una propiedad del TELEFONO, no de la jornada: existe antes de
              que nadie entre y sobrevive a cerrar la aplicacion. */}
          <ProveedorDePermisoDeSegundoPlano>
          {/* Si el conductor esta en servicio. Va ANTES de la ubicacion en vivo
              porque esta le pregunta: fuera de servicio no se emite nada. */}
          <ProveedorDeDisponibilidad>
          {/* El seguimiento en segundo plano. Va DENTRO de disponibilidad
              porque su unica condicion es estar en servicio, y FUERA de la
              ubicacion en vivo porque no depende de ella: la tarea corre
              aunque React no este montado. */}
          <ProveedorDeSeguimiento>
          <ProveedorDeUbicacion>
          {/* La ubicacion saliendo y entrando por el socket. Va DENTRO del
              proveedor de ubicacion y del viaje activo porque necesita a los
              dos: de uno saca que mandar, del otro a que conductor escuchar. */}
          <ProveedorDeUbicacionEnVivo>
          {/* Los avisos push. Van DENTRO de la sesion porque el dispositivo se
              registra a nombre de quien entro y se da de baja al salir, y
              DENTRO del tiempo real porque el push lo COMPLEMENTA: cuando el
              socket esta vivo el servidor ya no manda el aviso del chat. No
              pide permiso al arrancar ni en la bienvenida: lo pide cuando hay
              sesion confirmada, que es el primer momento en que un aviso puede
              tener sentido. Y si se deniega, no vuelve a preguntar. */}
          <ProveedorDeNotificaciones>
          <Stack
            screenOptions={{
              headerShown: false,
              // Sin color aquí: lo pone `Pantalla`, que sí lee el tema. Un
              // color fijo en el Stack se vería un instante al navegar, con el
              // tono del tema contrario.
              contentStyle: undefined,
              // Transición nativa: la que espera cada plataforma, sin imitarla.
              // Es la de ENTRAR EN PROFUNDIDAD —abrir un viaje, los ajustes, lo
              // legal—, donde el deslizamiento significa «vas hacia dentro» y el
              // gesto de volver lo deshace.
              animation: 'slide_from_right'
            }}
          >
            {/*
              LAS PESTAÑAS NO SE DESLIZAN

              Inicio, Seguro, Historial y Perfil están a la misma altura de la
              aplicación: moverse entre ellas no es ir hacia dentro. Con la
              transición del Stack se veía un «pasar página» de derecha a
              izquierda que el dueño rechazó, y con razón: promete una
              profundidad que no existe y hace lento algo que debería ser
              inmediato.

              Aquí se apaga SOLO para ellas. `animation: 'none'` no es renunciar
              a un adorno: es que el contenido cambie en cuanto se toca, como en
              cualquier barra de pestañas. El resto de pantallas conserva la
              transición de arriba.
            */}
            <Stack.Screen name="pasajero" options={{ animation: 'none' }} />
            <Stack.Screen name="seguro" options={{ animation: 'none' }} />
            <Stack.Screen name="historial" options={{ animation: 'none' }} />
            <Stack.Screen name="perfil" options={{ animation: 'none' }} />
            <Stack.Screen name="conductor" options={{ animation: 'none' }} />
            <Stack.Screen name="conductor-saldo" options={{ animation: 'none' }} />
            {/* `saldo` NO está en esta lista, y es deliberado. Dejó de ser
                pestaña de la pasajera: ahora se entra desde una fila del perfil,
                o sea hacia dentro, así que le corresponde la transición normal
                del Stack. `conductor-saldo` sí sigue arriba porque para el
                conductor su cartera SÍ es una pestaña. */}
          </Stack>
          </ProveedorDeNotificaciones>
          </ProveedorDeUbicacionEnVivo>
          </ProveedorDeUbicacion>
          </ProveedorDeSeguimiento>
          </ProveedorDeDisponibilidad>
          </ProveedorDePermisoDeSegundoPlano>
          </ProveedorDeViajeActivo>
          </ProveedorDeTiempoReal>
        </ProveedorDeSesion>
      ) : (
        <AvisoDeConfiguracion detalle={configuracion.detalle} />
      )}
      </ProveedorDeTema>
    </SafeAreaProvider>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', gap: espaciado.lg },
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radios.lg,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: espaciado.xl,
    gap: espaciado.md
  },
  titulo: {
    color: colores.aviso,
    fontSize: tipografia.subtitulo.tamano,
    lineHeight: tipografia.subtitulo.alto,
    fontWeight: '600'
  },
  detalle: {
    color: colores.textoPrimario,
    fontSize: tipografia.cuerpo.tamano,
    lineHeight: tipografia.cuerpo.alto
  },
  nota: {
    color: colores.textoTenue,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto
  },
  atajo: {
    backgroundColor: colores.superficie,
    borderRadius: radios.lg,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: espaciado.lg,
    gap: espaciado.xs
  },
  atajoPulsado: { borderColor: colores.acento },
  atajoTitulo: {
    color: colores.acento,
    fontSize: tipografia.cuerpo.tamano,
    lineHeight: tipografia.cuerpo.alto,
    fontWeight: '600'
  },
  atajoNota: {
    color: colores.textoTenue,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto
  }
});
