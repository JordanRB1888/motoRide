/**
 * Arranque.
 *
 * NO SE ENTRA POR TENER UNA CADENA GUARDADA
 *
 * Que exista un token en el almacén seguro sólo demuestra que alguien entró
 * alguna vez. Puede haber caducado —duran siete días—, la cuenta puede estar
 * deshabilitada o el rol puede haber cambiado. Por eso el proveedor de sesión
 * PREGUNTA al backend antes de dar a nadie por autenticado.
 *
 * Esta pantalla sólo mira el resultado y decide a dónde ir:
 *
 *   ARRANCANDO      esperando la respuesta
 *   SIN_SESION      a la bienvenida oficial
 *   AUTENTICADO     a la experiencia que dice la identidad REAL
 *   SIN_VERIFICAR   hay token y no se pudo preguntar: se ofrece reintentar
 *
 * Lo que NO hace: pedir permisos, y conceder nada por el rol recordado.
 */

import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '../components/Boton';
import { Pantalla } from '../components/Pantalla';
import { CargandoDeMarca } from '../ui/CargandoDeMarca';
import { colores, espaciado, radios, tipografia } from '../theme/tokens';
import { useSesion } from '../context/AuthContext';
import { experienciaDeLaIdentidad } from '../domain/authState';

export default function Arranque() {
  const { sesion, revalidar, salir } = useSesion();

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') {
    // LA MISMA ESPERA QUE LA WEB, NO LA RUEDA DEL SISTEMA.
    //
    // Esto es lo PRIMERO que ve quien abre la aplicacion, y una rueda gris es
    // lo que enseña cualquier aplicacion a medio hacer. La web ya tenia su
    // pantalla de marca --los anillos girando y el logo volteando-- y no habia
    // motivo para que la aplicacion, que es el producto de verdad, enseñara
    // menos que ella.
    //
    // `AUTENTICANDO` dice otra cosa que `ARRANCANDO`: en el primero se esta
    // comprobando una sesion guardada, y decir «entrando» es mas honesto que
    // «preparando tu viaje», que sugiere que ya se entro.
    return (
      <Pantalla testID="arranque">
        <CargandoDeMarca
          mensaje={sesion.estado === 'AUTENTICANDO' ? 'Entrando' : 'Preparando tu viaje'}
        />
      </Pantalla>
    );
  }

  if (sesion.estado === 'AUTENTICADO') {
    const destino = experienciaDeLaIdentidad(sesion.usuario);
    return <Redirect href={destino === 'driver' ? '/conductor' : '/pasajero'} />;
  }

  if (sesion.estado === 'SIN_VERIFICAR') {
    // Hay una sesión guardada y no se pudo comprobar. NO se borra —cerrarle la
    // sesión a alguien porque iba en el metro es un fallo que se nota— y NO se
    // le deja entrar: nadie ha confirmado que siga valiendo.
    return (
      <Pantalla testID="sin-verificar">
        <View style={estilos.centro}>
          <View style={estilos.tarjeta}>
            <Text style={estilos.titulo} accessibilityRole="header">
              Sin conexión
            </Text>
            <Text style={estilos.texto}>
              Tienes una sesión guardada, pero no pudimos comprobarla con el
              servidor. No la hemos cerrado.
            </Text>
          </View>

          <View style={estilos.acciones}>
            <Boton
              titulo="Reintentar"
              onPress={() => { void revalidar(); }}
              testID="boton-reintentar"
            />
            <Boton
              titulo="Cerrar sesión"
              variante="secundario"
              onPress={() => { void salir(); }}
            />
          </View>
        </View>
      </Pantalla>
    );
  }

  // SIN SESIÓN, A LA BIENVENIDA OFICIAL
  //
  // «¿Cómo quieres continuar?», Pasajero o Conductor, y de ahí al acceso.
  // Es la pantalla oficial de entrada, no el selector de desarrollo que
  // hacía de raíz antes de REAL-APP-BOOT-GATE: sin atajos al laboratorio y
  // sin que la elección sea autoridad de nada. El rol lo sigue diciendo el
  // backend cuando la persona entra.
  return <Redirect href="/bienvenida" />;
}

const estilos = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', gap: espaciado.xl },
  tarjeta: {
    backgroundColor: colores.superficie,
    borderColor: colores.borde,
    borderWidth: 1,
    borderRadius: radios.lg,
    padding: espaciado.xl,
    gap: espaciado.sm
  },
  titulo: {
    color: colores.aviso,
    fontSize: tipografia.subtitulo.tamano,
    lineHeight: tipografia.subtitulo.alto,
    fontWeight: '600'
  },
  texto: {
    color: colores.textoSecundario,
    fontSize: tipografia.cuerpo.tamano,
    lineHeight: tipografia.cuerpo.alto
  },
  acciones: { gap: espaciado.md }
});
