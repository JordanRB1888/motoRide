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

import { useState } from 'react';
import { Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { configuracion } from '../config/environment';
import { ProveedorDeSesion } from '../context/AuthContext';
import { ProveedorDeTiempoReal } from '../realtime/ProveedorDeTiempoReal';
import { ProveedorDeTema } from '../theme/ThemeContext';
import { colores, espaciado, radios, tipografia } from '../theme/tokens';
import { Pantalla } from '../components/Pantalla';
import LaboratorioVisual from './preview';

/** `true` sólo cuando Metro sirve la aplicación. En release, `false`. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

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
          <Stack
            screenOptions={{
              headerShown: false,
              // Sin color aquí: lo pone `Pantalla`, que sí lee el tema. Un
              // color fijo en el Stack se vería un instante al navegar, con el
              // tono del tema contrario.
              contentStyle: undefined,
              // Transición nativa: la que espera cada plataforma, sin imitarla.
              animation: 'slide_from_right'
            }}
          />
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
