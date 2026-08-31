/**
 * Inicio de conductor.
 *
 * LA COMPROBACIÓN QUE DE VERDAD IMPORTA
 *
 * Entrar aquí exige TRES cosas, y ninguna la decide el cliente:
 *
 *   1. sesión confirmada por el backend ahora mismo;
 *   2. que el backend diga que el rol es `driver`;
 *   3. que el backend lo dé por verificado (`isVerified`).
 *
 * Que el JWT lleve `role: 'driver'` no basta. El token se firmó en el pasado y
 * dura siete días: alguien suspendido ayer sigue teniendo un token con ese
 * claim. Por eso `requireApprovedDriver` del backend comprueba `isVerified` en
 * cada petición, y aquí se refleja lo mismo.
 *
 * Quien tenga sesión pero no la aprobación ve su SITUACIÓN, no una interfaz de
 * conductor a medias.
 */

import { Redirect, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Boton } from '../components/Boton';
import { Pantalla } from '../components/Pantalla';
import { colores, espaciado, radios, tipografia } from '../theme/tokens';
import { useSesion } from '../context/AuthContext';
import { puedeOperarComoConductor } from '../domain/authState';
import { describirSituacion, SIN_SOLICITUD } from '../domain/driverApplication';

export default function InicioDeConductor() {
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

  if (sesion.estado !== 'AUTENTICADO') return <Redirect href="/" />;

  const { usuario } = sesion;
  const operativo = puedeOperarComoConductor(sesion);

  // Alguien con sesión de pasajera que llega aquí —por un enlace, o volviendo
  // atrás— no ve nada de conductor. Se le manda a lo suyo.
  if (usuario.role !== 'driver') return <Redirect href="/pasajero" />;

  return (
    <Pantalla desplazable testID="inicio-conductor">
      <View style={estilos.cabecera}>
        <Text style={estilos.saludo} accessibilityRole="header">
          Hola, {usuario.firstName || 'conductor'}
        </Text>
        <Text style={estilos.subtitulo}>
          {operativo ? 'Tu cuenta está aprobada.' : 'Estado de tu cuenta de conductor.'}
        </Text>
      </View>

      <View style={estilos.cuerpo}>
        {operativo ? (
          <View style={estilos.tarjeta} testID="conductor-operativo">
            <Text style={estilos.tarjetaTitulo}>Todo listo</Text>
            <Text style={estilos.tarjetaTexto}>
              La disponibilidad y las carreras llegan en la siguiente entrega.
            </Text>
          </View>
        ) : (
          <SituacionSinAprobar />
        )}
      </View>

      <Boton
        titulo="Cerrar sesión"
        variante="secundario"
        onPress={() => { void salir().then(() => { router.replace('/rol'); }); }}
        testID="boton-cerrar-sesion"
      />
    </Pantalla>
  );
}

/**
 * Lo que ve quien tiene sesión de conductor sin aprobación.
 *
 * El detalle exacto de la solicitud lo trae el backend, y consultarlo es de la
 * siguiente entrega. Hasta entonces se enseña la situación más restrictiva, que
 * es la correcta cuando no se sabe.
 */
function SituacionSinAprobar() {
  const situacion = describirSituacion(SIN_SOLICITUD);
  return (
    <View style={estilos.tarjeta} testID="conductor-sin-aprobar">
      <Text style={estilos.tarjetaTitulo}>{situacion.titulo}</Text>
      <Text style={estilos.tarjetaTexto}>{situacion.explicacion}</Text>
      <Text style={estilos.aviso}>
        Recibir carreras requiere que administración apruebe tus documentos.
      </Text>
    </View>
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
  },
  aviso: {
    color: colores.textoTenue,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto,
    marginTop: espaciado.xs
  }
});
