/**
 * Inicio de pasajera.
 *
 * Con guardia de sesión: sin sesión confirmada por el backend, aquí no se
 * entra. La comprobación mira el ESTADO real, no la ruta ni la preferencia
 * guardada — un enlace profundo no puede saltársela.
 */

import { Redirect, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Boton } from '../components/Boton';
import { Pantalla } from '../components/Pantalla';
import { colores, espaciado, radios, tipografia } from '../theme/tokens';
import { useSesion } from '../context/AuthContext';

export default function InicioDePasajera() {
  const { sesion, salir } = useSesion();

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    return (
      <Pantalla>
        <View style={estilos.centro}>
          <ActivityIndicator color={colores.acento} size="large" />
        </View>
      </Pantalla>
    );
  }

  // Sin autoridad fresca no se entra. `SIN_VERIFICAR` incluido: hay token, pero
  // nadie ha confirmado que valga.
  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  const { usuario } = sesion;

  return (
    <Pantalla desplazable testID="inicio-pasajera">
      <View style={estilos.cabecera}>
        <Text style={estilos.saludo} accessibilityRole="header">
          Hola, {usuario.firstName || 'bienvenida'}
        </Text>
        <Text style={estilos.subtitulo}>Tu cuenta está lista.</Text>
      </View>

      <View style={estilos.cuerpo}>
        <View style={estilos.tarjeta}>
          <Text style={estilos.tarjetaTitulo}>Pedir una carrera</Text>
          <Text style={estilos.tarjetaTexto}>
            El mapa y la solicitud de viaje llegan en la siguiente entrega.
          </Text>
        </View>
      </View>

      {/* La puerta al perfil NUEVO, ya conectado a datos reales. Sin ella la
          pantalla existe y no se puede alcanzar.

          Cerrar sesión se queda también aquí: es la salida de emergencia
          mientras el resto de la aplicación sigue sin conectar. */}
      <Boton
        titulo="Tu perfil"
        onPress={() => { router.push('/perfil'); }}
        testID="boton-perfil"
      />

      <Boton
        titulo="Tu historial"
        variante="secundario"
        onPress={() => { router.push('/historial'); }}
        testID="boton-historial"
      />

      <Boton
        titulo="Cerrar sesión"
        variante="secundario"
        onPress={() => { void salir().then(() => { router.replace('/rol'); }); }}
        testID="boton-cerrar-sesion"
      />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  tarjeta: {
    backgroundColor: colores.superficie,
    borderColor: colores.borde,
    borderWidth: 1,
    borderRadius: radios.lg,
    padding: espaciado.xl,
    gap: espaciado.sm
  },
  tarjetaTitulo: {
    color: colores.textoPrimario,
    fontSize: tipografia.subtitulo.tamano,
    lineHeight: tipografia.subtitulo.alto,
    fontWeight: '600'
  },
  tarjetaTexto: {
    color: colores.textoSecundario,
    fontSize: tipografia.cuerpo.tamano,
    lineHeight: tipografia.cuerpo.alto
  }
});
