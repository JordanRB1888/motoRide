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
 *
 * Y quien SÍ está aprobado ve la pantalla de conductor aprobada, con el disco
 * de la barra conectado a su estado real. Ese estado lo decide el servidor:
 * tocar el disco lo PIDE, y lo que se pinta es lo que el servidor confirma.
 * Pintar el deseo del usuario dejaría a alguien viéndose «en línea» mientras
 * el servidor lo tiene fuera, esperando viajes que no van a llegar.
 */

import { Redirect, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { Boton } from '../components/Boton';
import { Pantalla } from '../components/Pantalla';
import { colores, espaciado, radios, tipografia } from '../theme/tokens';
import { useSesion } from '../context/AuthContext';
import { puedeOperarComoConductor } from '../domain/authState';
import { describirSituacion, SIN_SOLICITUD } from '../domain/driverApplication';
import { C2InicioConductor } from '../preview/pantallasC2';
import { ProveedorDeNavegacion } from '../ui/navegar';
import { useDisponibilidad } from '../realtime/Disponibilidad';

export default function InicioDeConductor() {
  const { sesion, salir } = useSesion();
  const {
    enLinea,
    alternar,
    faltaElPermisoDeFondo,
    sacadoDeServicioPorElPermiso,
    abrirAjustesDeUbicacion
  } = useDisponibilidad();

  // LO QUE HAY QUE CONTAR CUANDO FALTA EL PERMISO
  //
  // Dos situaciones distintas, y ninguna puede pasar en silencio. No se dibuja
  // nada nuevo en la pantalla: son avisos del sistema, que es lo mínimo que
  // hace falta para que el conductor se entere de algo que le afecta ahora.
  //
  // Cada uno aparece UNA vez por situación. Un aviso que reaparece en cada
  // repintado se cierra sin leerlo.
  const avisado = useRef({ sacado: false, enViaje: false });

  useEffect(() => {
    if (!sacadoDeServicioPorElPermiso) {
      avisado.current.sacado = false;
      return;
    }
    if (avisado.current.sacado) return;
    avisado.current.sacado = true;

    Alert.alert(
      'Te pusimos fuera de línea',
      'Sin el permiso de ubicación en segundo plano no sabemos dónde estás cuando '
      + 'guardas el teléfono, y el sistema dejaría de ofrecerte viajes.\n\n'
      + 'Actívalo y vuelve a ponerte en línea cuando quieras.',
      [
        { text: 'Entendido', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => { void abrirAjustesDeUbicacion(); } }
      ]
    );
  }, [sacadoDeServicioPorElPermiso, abrirAjustesDeUbicacion]);

  useEffect(() => {
    if (!faltaElPermisoDeFondo) {
      avisado.current.enViaje = false;
      return;
    }
    if (avisado.current.enViaje) return;
    avisado.current.enViaje = true;

    // El viaje NO se toca: romperlo con alguien subido a la moto sería mucho
    // peor que la falta de permiso. Pero mientras tanto su posición sólo viaja
    // con la pantalla encendida, y quien le espera necesita verla.
    Alert.alert(
      'Falta el permiso de ubicación',
      'Tu viaje sigue en marcha, pero sin el permiso en segundo plano tu pasajera '
      + 'deja de ver dónde estás en cuanto apagas la pantalla.\n\n'
      + 'Actívalo ahora, o mantén la pantalla encendida hasta terminar.',
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => { void abrirAjustesDeUbicacion(); } }
      ]
    );
  }, [faltaElPermisoDeFondo, abrirAjustesDeUbicacion]);

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
  // atrás— no ve nada de conductor: se le manda a la postulación, que es el
  // camino real para llegar a serlo. Allí se consulta al servidor y se decide
  // si empieza, continúa o mira el estado de lo que ya mandó.
  if (usuario.role !== 'driver') return <Redirect href="/postulacion" />;

  // APROBADO: su pantalla de verdad.
  //
  // La misma que se aprobó en el recorrido de diseño, con el disco de la barra
  // —que ya estaba dibujado y sin conectar— pidiendo el cambio de estado al
  // servidor. Nada nuevo dibujado aquí.
  if (operativo) {
    return (
      <ProveedorDeNavegacion ir={irA}>
        <C2InicioConductor enLinea={enLinea} onAlternar={alternar} />
      </ProveedorDeNavegacion>
    );
  }

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

      {/* Aquí sólo llega quien NO está aprobado: el aprobado se fue arriba a
          su pantalla. La tarjeta de «todo listo, la disponibilidad llega en la
          siguiente entrega» desaparece porque esa entrega es ésta. */}
      <View style={estilos.cuerpo}>
        <SituacionSinAprobar />
      </View>

      <Boton
        titulo="Cerrar sesión"
        variante="secundario"
        onPress={() => { void salir().then(() => { router.replace('/bienvenida'); }); }}
        testID="boton-cerrar-sesion"
      />
    </Pantalla>
  );
}

/**
 * A dónde lleva la barra del conductor.
 *
 * Sólo lo que ya existe conectado. Lo que todavía no tiene pantalla real no se
 * enlaza: un destino que no lleva a ninguna parte se lee como una avería.
 */
function irA(clave: string) {
  if (clave === 'perfil') router.replace('/perfil');
  if (clave === 'historial') router.replace('/historial');
  if (clave === 'mapa') router.replace('/conductor');
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
