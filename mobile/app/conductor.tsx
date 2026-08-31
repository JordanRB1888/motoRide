/**
 * Entrada de conductor.
 *
 * ELEGIR «CONDUCTOR» NO ABRE LA INTERFAZ DE CONDUCTOR
 *
 * Esta pantalla enseña la SITUACIÓN de la persona respecto a su solicitud, que
 * decide el backend. Sin sesión no hay situación que consultar, así que lo que
 * se muestra es la entrada de acceso; con sesión, Wave 1 traerá el estado real y
 * esta pantalla lo pintará.
 *
 * En ningún caso se deduce el permiso desde el cliente: `puedeConducir` exige la
 * aprobación explícita, y cualquier estado desconocido cae en el más
 * restrictivo.
 */

import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '../components/Boton';
import { Pantalla } from '../components/Pantalla';
import { colores, espaciado, radios, tipografia } from '../theme/tokens';
import { describirSituacion, SIN_SOLICITUD } from '../domain/driverApplication';

export default function EntradaDeConductor() {
  // Sin sesión todavía no hay solicitud que consultar. Wave 1 sustituye esto por
  // la situación real que devuelva el backend.
  const situacion = describirSituacion(SIN_SOLICITUD);

  return (
    <Pantalla desplazable testID="entrada-conductor">
      <View style={estilos.cabecera}>
        <Text style={estilos.saludo} accessibilityRole="header">
          Modo conductor
        </Text>
        <Text style={estilos.subtitulo}>
          Entra con tu cuenta para ver el estado de tu solicitud.
        </Text>
      </View>

      <View style={estilos.cuerpo}>
        <View style={estilos.tarjeta}>
          <Text style={estilos.tarjetaTitulo}>{situacion.titulo}</Text>
          <Text style={estilos.tarjetaTexto}>{situacion.explicacion}</Text>
          {situacion.accion !== null && (
            <Text style={estilos.tarjetaAccion}>{situacion.accion}</Text>
          )}
        </View>

        <Text style={estilos.aviso}>
          Recibir carreras requiere que administración apruebe tus documentos.
        </Text>
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
  cuerpo: { flex: 1, justifyContent: 'center', gap: espaciado.lg, paddingVertical: espaciado.xl },
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
  },
  tarjetaAccion: {
    color: colores.acento,
    fontSize: tipografia.cuerpoFuerte.tamano,
    lineHeight: tipografia.cuerpoFuerte.alto,
    fontWeight: '600',
    marginTop: espaciado.xs
  },
  aviso: {
    color: colores.textoTenue,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto,
    textAlign: 'center'
  }
});
