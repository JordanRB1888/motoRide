/**
 * Entrada de pasajera.
 *
 * El armazón de acceso, no el acceso terminado. Wave 1 conecta el inicio de
 * sesión real contra el backend existente, que sigue siendo la única autoridad:
 * aquí no se validará nada por nuestra cuenta ni se creará un sistema de
 * autenticación paralelo.
 *
 * Está montada sobre `Pantalla`, así que el teclado y las áreas seguras ya
 * funcionan cuando lleguen los campos del formulario.
 */

import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '../components/Boton';
import { Pantalla } from '../components/Pantalla';
import { colores, espaciado, radios, tipografia } from '../theme/tokens';

export default function EntradaDePasajera() {
  return (
    <Pantalla desplazable testID="entrada-pasajera">
      <View style={estilos.cabecera}>
        <Text style={estilos.saludo} accessibilityRole="header">
          Bienvenida a bordo
        </Text>
        <Text style={estilos.subtitulo}>
          Entra o crea tu cuenta para pedir tu primera carrera.
        </Text>
      </View>

      <View style={estilos.cuerpo}>
        <View style={estilos.marcador}>
          <Text style={estilos.marcadorTitulo}>Acceso de pasajera</Text>
          <Text style={estilos.marcadorTexto}>
            El formulario de acceso llega en la siguiente entrega. La pantalla ya
            gestiona el teclado y las áreas seguras.
          </Text>
        </View>
      </View>

      <Boton
        titulo="Cambiar de modo"
        variante="secundario"
        onPress={() => { router.replace('/rol'); }}
        etiquetaAccesible="Volver a elegir cómo continuar"
      />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { paddingTop: espaciado.xxl, gap: espaciado.sm },
  saludo: {
    color: colores.textoPrimario,
    fontSize: tipografia.titulo.tamano,
    lineHeight: tipografia.titulo.alto,
    fontWeight: '700'
  },
  subtitulo: {
    color: colores.textoSecundario,
    fontSize: tipografia.cuerpo.tamano,
    lineHeight: tipografia.cuerpo.alto
  },
  cuerpo: { flex: 1, justifyContent: 'center', paddingVertical: espaciado.xl },
  marcador: {
    backgroundColor: colores.superficie,
    borderColor: colores.borde,
    borderWidth: 1,
    borderRadius: radios.lg,
    padding: espaciado.xl,
    gap: espaciado.sm
  },
  marcadorTitulo: {
    color: colores.textoPrimario,
    fontSize: tipografia.subtitulo.tamano,
    lineHeight: tipografia.subtitulo.alto,
    fontWeight: '600'
  },
  marcadorTexto: {
    color: colores.textoSecundario,
    fontSize: tipografia.cuerpo.tamano,
    lineHeight: tipografia.cuerpo.alto
  }
});
