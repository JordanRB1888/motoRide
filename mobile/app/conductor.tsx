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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useUbicacion } from '../ubicacion/UbicacionDelDispositivo';
import {
  CAMARA_INICIAL_DEL_CONDUCTOR,
  MENSAJES_DE_UBICACION,
  avisoDeUbicacion,
  camaraCentradaEn,
  camaraDelConductor,
  modeloDelMapaDelConductor,
  sePuedeReintentar
} from '../domain/mapaDelConductor';
import { AvisoDeUbicacionEnMapa } from '../ui/AvisoDeUbicacion';
import { useOfertaEnVivo } from '../realtime/OfertaEnVivo';
import { CierreDeOferta, SuperficieDeOferta } from '../conductor/SuperficieDeOferta';

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

  // ---------------------------------------------------------------------
  // SU UBICACION EN EL MAPA
  //
  // El proveedor de ubicacion es el UNICO watcher de primer plano y lo monta
  // el layout raiz: aqui solo se lee. pedirUbicacion no abre nada nuevo, y
  // solo hace algo la primera vez que se pregunta.
  //
  // Verla NO es publicarla: que su posicion salga hacia el servidor lo decide
  // UbicacionEnVivo con la politica de siempre --fuera de linea, nada--. Por
  // eso el conductor se ve a si mismo aunque este fuera de linea.
  // ---------------------------------------------------------------------
  const { estado: ubicacion, pedirUbicacion, refrescar: refrescarUbicacion } = useUbicacion();
  const [camara, setCamara] = useState(CAMARA_INICIAL_DEL_CONDUCTOR);
  // La primera posicion centra el mapa UNA vez. Despues manda quien mira: si
  // la camara se recalculara con cada lectura, panear seria imposible.
  const yaCentro = useRef(false);

  useEffect(() => { void pedirUbicacion(); }, [pedirUbicacion]);

  useEffect(() => {
    const siguiente = camaraDelConductor({
      posicion: ubicacion.posicion,
      yaCentro: yaCentro.current,
      anterior: camara
    });
    if (siguiente === camara) return;
    yaCentro.current = true;
    setCamara(siguiente);
  }, [ubicacion.posicion, camara]);

  /** El boton de centrar. Con posicion, centra; sin ella, la pide. */
  const centrarEnMi = useCallback(() => {
    if (ubicacion.posicion !== null) {
      setCamara(camaraCentradaEn(ubicacion.posicion));
      yaCentro.current = true;
      return;
    }
    void refrescarUbicacion();
  }, [ubicacion.posicion, refrescarUbicacion]);

  const aviso = avisoDeUbicacion(ubicacion, Date.now());
  const modeloDelMapa = useMemo(
    () => modeloDelMapaDelConductor({ posicion: ubicacion.posicion, camara }),
    [ubicacion.posicion, camara]
  );

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
  // LAS CARRERAS QUE LE OFRECEN
  //
  // No se le pasa si esta en servicio: el despacho solo ofrece a quien tiene
  // por disponible, asi que recibir una oferta ya es la prueba de estarlo.
  const carrera = useOfertaEnVivo();

  // La misma que se aprobó en el recorrido de diseño, con el disco de la barra
  // —que ya estaba dibujado y sin conectar— pidiendo el cambio de estado al
  // servidor. Nada nuevo dibujado aquí.
  if (operativo) {
    return (
      <ProveedorDeNavegacion ir={irA}>
        {/* EL CONTENEDOR HACE FALTA, Y NO ES DECORATIVO
          *
          * `ProveedorDeNavegacion` es solo un contexto: no pinta ninguna
          * `View`. Sin este envoltorio, la capa absoluta de la oferta no tiene
          * padre con dimensiones y no llega a verse --el evento llegaba, el
          * estado cambiaba, y en pantalla no aparecia nada. */}
        <View style={{ flex: 1 }}>
        <C2InicioConductor
          enLinea={enLinea}
          onAlternar={alternar}
          modeloDelMapa={modeloDelMapa}
          onCentrar={centrarEnMi}
          avisoDeUbicacion={
            <AvisoDeUbicacionEnMapa
              mensaje={MENSAJES_DE_UBICACION[aviso]}
              onReintentar={sePuedeReintentar(aviso) ? () => { void refrescarUbicacion(); } : undefined}
            />
          }
        />

        {/* LA OFERTA VA ENCIMA, NO DENTRO
          *
          * Se superpone al inicio aprobado en vez de modificarlo: el mapa, el
          * disco de disponibilidad y la barra siguen siendo exactamente los
          * mismos, y esta superficie aparece y desaparece sin tocarlos.
          *
          * `pointerEvents="box-none"` deja pasar los toques al mapa donde no hay
          * tarjeta; sin eso, una capa invisible se comeria el paneo. */}
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          {carrera.estado === 'OFERTA' || carrera.estado === 'ACEPTANDO' ? (
            carrera.oferta === null ? null : (
              <SuperficieDeOferta
                oferta={carrera.oferta}
                segundos={carrera.segundos}
                puedeAceptar={carrera.puedeAceptar}
                puedeRechazar={carrera.puedeRechazar}
                aceptando={carrera.estado === 'ACEPTANDO'}
                onAceptar={carrera.aceptar}
                onRechazar={carrera.rechazar}
              />
            )
          ) : null}

          {carrera.estado === 'ACEPTADA' || carrera.estado === 'RECHAZADA'
            || carrera.estado === 'EXPIRADA' || carrera.estado === 'ERROR' ? (
              <CierreDeOferta
                estado={carrera.estado}
                onCerrar={carrera.estado === 'ACEPTADA'
                  ? () => { carrera.descartar(); router.replace('/viaje-activo'); }
                  : carrera.descartar}
              />
            ) : null}
        </View>
        </View>
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
  if (clave === 'saldo') router.replace('/conductor-saldo');
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
