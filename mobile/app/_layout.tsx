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
 */

import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { configuracion } from '../config/environment';
import { ProveedorDeSesion } from '../context/AuthContext';
import { colores, espaciado, radios, tipografia } from '../theme/tokens';
import { Pantalla } from '../components/Pantalla';

function AvisoDeConfiguracion({ detalle }: { readonly detalle: string }) {
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
      </View>
    </Pantalla>
  );
}

export default function DisposicionRaiz() {
  return (
    <SafeAreaProvider>
      {configuracion.ok ? (
        // El proveedor va DENTRO de la comprobación de configuración: sin
        // servidor al que preguntar, arrancar la sesión no tendría sentido y
        // sólo produciría un fallo de red confuso.
        <ProveedorDeSesion>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colores.fondo },
              // Transición nativa: la que espera cada plataforma, sin imitarla.
              animation: 'slide_from_right'
            }}
          />
        </ProveedorDeSesion>
      ) : (
        <AvisoDeConfiguracion detalle={configuracion.detalle} />
      )}
    </SafeAreaProvider>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center' },
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
  }
});
