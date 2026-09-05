/**
 * Las secciones de C2: perfil, saldo, historial, viaje seguro, avisos y ayuda.
 *
 * TODAS EXISTEN EN LA APLICACIÓN DE VERDAD
 *
 * No se ha inventado ninguna. Cada una tiene su equivalente en la web —
 * `profile.js`, `wallet.js`, `rideHistory.js`, `sosModal.js`,
 * `notificationCenterModal.js`, `adminSupportChat.js`— y lo que se hace aquí es
 * darles la cara de C2, no añadir funciones que nadie ha construido.
 *
 * ESTAS PANTALLAS NO LLEVAN MAPA
 *
 * Y es deliberado. El mapa es el suelo de lo que pasa *ahora*: dónde estás,
 * quién viene, por dónde vas. Consultar un historial o leer un aviso no pasa en
 * ningún sitio, así que un mapa detrás sería decoración que le roba espacio al
 * contenido. Mapa donde hay movimiento; lista donde hay que leer.
 *
 * DÓNDE VIVE CADA COSA
 *
 * «Viaje seguro» es lo que protege un trayecto: el aviso de emergencia,
 * compartir por dónde vas, a quién llamar, comprobar a quién te subes. Todo
 * eso pasa *durante* un viaje y por eso tiene pestaña propia.
 *
 * Los ajustes de la cuenta —contraseña, avisos, preferencias— viven dentro del
 * perfil. No son urgentes y no se buscan con prisa; ocupar una pestaña con
 * ellos sería gastar uno de los cinco sitios de la barra en algo que se visita
 * dos veces al año.
 *
 * EL SALDO ES EL CASO DELICADO
 *
 * La cartera está apagada en el servidor. La pantalla existe, se ve, y **no
 * enseña ninguna cifra**: dice que todavía no está activa. Un saldo de ejemplo
 * en una captura acaba citado como si fuera el dinero de alguien.
 */

import { type ReactNode, useState, useEffect } from 'react';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { Boton, Insignia, Superficie, Txt } from '../ui/componentes';
import { Icono, type NombreDeIcono } from '../ui/Icono';
import { IconoAnimado } from '../ui/IconoAnimado';
import { Separador } from '../ui/HojaInferior';
import {
  BarraDeNavegacion,
  ControlDeDisponibilidad,
  ControlDePedido,
  DESTINOS_DE_CONDUCTOR,
  DESTINOS_DE_PASAJERA
} from '../ui/Navegacion';
import { EntradaDeTransporteSeguro } from '../ui/Servicio';
import { useEsquema, useTema } from '../theme/ThemeContext';
import { useMovimientoReducido } from '../ui/movimiento';
import { useAireDeArriba } from '../ui/seguro';
import { useIr } from '../ui/navegar';
import { CabeceraAmarilla } from './pantallasSaldo';
import {
  AVISOS_DEMO,
  HISTORIAL_DEMO,
  PERFIL_DEMO
} from './fixtures';

// ---------------------------------------------------------------------------
// El armazón que comparten
// ---------------------------------------------------------------------------

/**
 * Lo que se lleva la barra inferior, para que el contenido no acabe debajo.
 *
 * 10 de relleno superior + 23 de icono + 4 de hueco + 17 de etiqueta + 22 de
 * franja del sistema. Antes el relleno era de 24 puntos y las últimas filas de
 * cada lista quedaban tapadas: ni se leían ni se podían tocar.
 */
const ALTO_DE_LA_BARRA = 76;


/**
 * La campana de avisos.
 *
 * Va en la cabecera de las secciones y en el inicio, que son las pantallas
 * donde uno está mirando y no conduciendo. Con algo sin leer lleva un punto
 * amarillo; sin nada, sólo la campana.
 *
 * Antes los avisos eran una pantalla suelta a la que no llevaba nada: existir
 * sin puerta es no existir.
 */
export function Campana({ sinLeer = 0, onPress, sobreElAmarillo = false }: {
  readonly sinLeer?: number;
  readonly onPress?: () => void;
  readonly sobreElAmarillo?: boolean;
}) {
  const tema = useTema();
  const [sonando, setSonando] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setSonando(true)}
      onPressOut={() => setSonando(false)}
      accessibilityRole="button"
      accessibilityLabel={sinLeer > 0 ? `Avisos: ${sinLeer} sin leer` : 'Avisos'}
      style={({ pressed }) => ({
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? tema.color.superficieElevada : 'transparent'
      })}
    >
      <IconoAnimado
        nombre="campana"
        color={sobreElAmarillo ? tema.color.sobreAcento : tema.color.textoPrimario}
        tamano={25}
        reaccionando={sonando}
      />
      {sinLeer > 0 ? (
        <View style={{
          position: 'absolute', top: 6, right: 7,
          width: 9, height: 9, borderRadius: 5,
          backgroundColor: sobreElAmarillo ? tema.color.sobreAcento : tema.color.acento,
          borderWidth: 2,
          borderColor: sobreElAmarillo ? tema.color.acento : tema.color.fondo
        }} />
      ) : null}
    </Pressable>
  );
}

/**
 * Una sección: título, contenido que se desplaza y la barra de siempre.
 *
 * La barra se queda porque estas pantallas son destinos de la navegación, no
 * pantallas apiladas encima: quitarla dejaría a la persona sin saber cómo
 * volver a donde estaba.
 */
function Seccion({ titulo, activo, conCampana = true, resumen, barra = 'pasajera', control, children }: {
  readonly titulo: string;
  readonly activo: string;
  readonly conCampana?: boolean;
  /**
   * Lo que va bajo el título DENTRO de la banda amarilla.
   *
   * Con resumen, la pantalla abre con la banda a todo el ancho; sin él, con el
   * título suelto sobre el fondo, que es como abren las de segundo nivel.
   */
  readonly resumen?: ReactNode;
  /** De quien es la barra de abajo. Por omision, pasajera. */
  readonly barra?: 'pasajera' | 'conductor';
  /**
   * El control del centro de la barra.
   *
   * Sin esto se usa el de la pasajera. El conductor pasa el SUYO --su disco de
   * disponibilidad--, porque el hueco del centro no puede quedarse vacio: en su
   * shell ese sitio es el de ponerse en servicio.
   */
  readonly control?: ReactNode;
  readonly children: ReactNode;
}) {
  const tema = useTema();
  const sinLeer = AVISOS_DEMO.filter(aviso => aviso.sinLeer).length;
  const conBanda = resumen !== undefined;
  // Con banda lo pide `CabeceraAmarilla`; sin ella lo pide el título suelto.
  const arriba = useAireDeArriba();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      {conBanda ? null : (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 18 + arriba,
          paddingBottom: tema.ritmo.entreElementos,
          paddingLeft: tema.ritmo.margenPantalla,
          paddingRight: conCampana ? tema.ritmo.margenPantalla - 8 : tema.ritmo.margenPantalla
        }}>
          <Txt nivel="titulo" accessibilityRole="header">{titulo}</Txt>
          <View style={{ flex: 1 }} />
          {conCampana ? <Campana sinLeer={sinLeer} /> : null}
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          // Con banda, el margen lateral baja al contenido: la banda tiene que
          // ir de borde a borde y este padding se lo comería por los lados.
          paddingHorizontal: conBanda ? 0 : tema.ritmo.margenPantalla,
          paddingBottom: tema.ritmo.entreBloques + ALTO_DE_LA_BARRA
        }}
        showsVerticalScrollIndicator={false}
      >
        {conBanda ? (
          <CabeceraAmarilla>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt nivel="titulo" tono="sobreAcento" accessibilityRole="header">{titulo}</Txt>
              <View style={{ flex: 1 }} />
              {conCampana ? <Campana sinLeer={sinLeer} sobreElAmarillo /> : null}
            </View>
            {resumen}
          </CabeceraAmarilla>
        ) : null}

        <View style={{ paddingHorizontal: conBanda ? tema.ritmo.margenPantalla : 0 }}>
          {children}
        </View>
      </ScrollView>

      <BarraDeNavegacion
        destinos={barra === 'conductor' ? DESTINOS_DE_CONDUCTOR : DESTINOS_DE_PASAJERA}
        activo={activo}
        control={control ?? (barra === 'conductor' ? <ControlDeDisponibilidad enLinea={false} /> : <ControlDePedido abierto={false} />)}
      />
    </View>
  );
}

/** Una fila con icono, texto y —si hace falta— algo a la derecha. */
function Fila({ icono, titulo, detalle, derecha, tono = 'normal', onPress }: {
  readonly icono: NombreDeIcono;
  readonly titulo: string;
  readonly detalle?: string;
  readonly derecha?: ReactNode;
  /** `peligro` para lo que no tiene vuelta atrás. */
  readonly tono?: 'normal' | 'peligro';
  readonly onPress?: () => void;
}) {
  const tema = useTema();
  const esquema = useEsquema();
  const esNoche = esquema === 'oscuro';
  const quieto = useMovimientoReducido();
  const [reaccionando, setReaccionando] = useState(false);
  const color = tono === 'peligro'
    ? tema.color.peligro
    : (esNoche ? tema.color.acento : tema.color.textoPrimario);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setReaccionando(true)}
      onPressOut={() => setReaccionando(false)}
      accessibilityRole="button"
      accessibilityLabel={detalle ? `${titulo}. ${detalle}` : titulo}
      pressRetentionOffset={{ top: 8, bottom: 8, left: 8, right: 8 }}
      hitSlop={4}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 14,
        backgroundColor: pressed
          ? (esNoche ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)')
          : 'transparent',
        opacity: pressed ? 0.88 : 1,
        transform: [{ scale: pressed && !quieto ? 0.988 : 1 }]
      })}
    >
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: tono === 'peligro'
          ? (esNoche ? 'rgba(239, 68, 68, 0.16)' : `${tema.color.peligro}1f`)
          : (esNoche ? 'rgba(245, 158, 11, 0.12)' : tema.color.superficieElevada),
        borderWidth: 1,
        borderColor: tono === 'peligro'
          ? (esNoche ? 'rgba(239, 68, 68, 0.35)' : 'transparent')
          : (esNoche ? 'rgba(245, 158, 11, 0.22)' : tema.color.borde)
      }}>
        <IconoAnimado
          nombre={icono}
          color={color}
          tamano={20}
          reaccionando={reaccionando}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt nivel="cuerpo" tono={tono === 'peligro' ? 'secundario' : 'primario'} estilo={{ fontWeight: '600', fontSize: 15 }}>
          {titulo}
        </Txt>
        {detalle ? <Txt nivel="pie" tono="secundario" estilo={{ fontSize: 12, lineHeight: 16 }}>{detalle}</Txt> : null}
      </View>
      {derecha}
      <Galon reaccionando={reaccionando} />
    </Pressable>
  );
}

/** La punta que dice «esto lleva a algún sitio». */
function Galon({ reaccionando = false }: { readonly reaccionando?: boolean }) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const avance = useSharedValue(0);

  useEffect(() => {
    if (quieto) return;
    avance.set(reaccionando
      ? withSpring(3, { duration: 150, dampingRatio: 0.85 })
      : withSpring(0, { duration: 180, dampingRatio: 0.9 }));
  }, [avance, quieto, reaccionando]);

  const estiloAvance = useAnimatedStyle(() => ({
    transform: [{ translateX: avance.get() }]
  }));

  return (
    <Reanimated.View style={[{ width: 12, height: 14, justifyContent: 'center' }, estiloAvance]}>
      {[38, -38].map((giro, indice) => (
        <View key={giro} style={{
          position: 'absolute',
          width: 8, height: 1.8, borderRadius: 1,
          backgroundColor: tema.color.textoSecundario,
          transform: [{ rotate: `${giro}deg` }, { translateY: indice === 0 ? -2.4 : 2.4 }]
        }} />
      ))}
    </Reanimated.View>
  );
}

/** Un rótulo de grupo. Sustituye a envolver cada grupo en su propia tarjeta. */
function Grupo({ titulo, children }: { readonly titulo: string; readonly children: ReactNode }) {
  const tema = useTema();

  return (
    <View style={{ marginTop: tema.ritmo.entreBloques }}>
      <Txt nivel="etiqueta" tono="secundario">{titulo.toUpperCase()}</Txt>
      <View style={{ marginTop: 4 }}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

/**
 * El perfil, y todo lo que no urge.
 *
 * Aquí viven los ajustes de cuenta, los avisos y la configuración. Ninguna de
 * esas tres se busca con prisa, y ninguna merece uno de los cinco sitios de la
 * barra: se visitan dos veces al año, y la barra es para lo de todos los días.
 *
 * Lo irreversible va al final y separado. «Eliminar cuenta» junto a «Cerrar
 * sesión» en la misma lista es un accidente esperando: se parecen, están
 * juntas, y una de las dos no tiene vuelta.
 */
/**
 * El perfil.
 *
 * ABRE CON LA BANDA AMARILLA, como el saldo y la ficha de un comercio.
 *
 * EL CRITERIO, DESPUÉS DE QUE EL DUEÑO LO CERRARA
 *
 * La banda marca las secciones PRINCIPALES: las cuatro que se alcanzan desde
 * la barra de abajo. Inicio, Historial, Saldo y Perfil abren con ella; las de
 * segundo nivel —ayuda, configuración, avisos, viaje seguro, a las que se
 * llega desde dentro— abren con el título suelto.
 *
 * Antes el criterio era «donde hay un sujeto que presentar», y por eso el
 * historial se quedó sin banda: es una lista. El dueño pidió ponérsela, y el
 * criterio que queda es mejor: se puede mirar la barra y saber cuáles la
 * llevan, sin discutir si una lista de TUS viajes tiene sujeto o no.
 *
 * Esta pantalla no usa el armazón de `Seccion` como las demás: ese armazón pinta
 * el título con márgenes laterales, y la banda tiene que ir de borde a borde.
 * Se escribe suelta, que son cuatro líneas más y queda más claro que doblar el
 * armazón para que admita las dos formas.
 */
/**
 * Lo que la cabecera del perfil necesita para pintarse.
 *
 * Deliberadamente PLANO y sin nada de `services/`: así esta pantalla se puede
 * montar en el recorrido de diseño —sin sesión, sin red— y dentro de la ruta
 * protegida —con la persona de verdad— sin cambiar una línea.
 *
 * `viajes` y `verificada` pueden faltar, y faltar significa NO PINTARLOS. El
 * backend no dice cuántos viajes lleva alguien en `GET /api/auth/me`, y un
 * número inventado en el perfil de una persona real es peor que un hueco.
 */
export interface DatosDelPerfil {
  readonly iniciales: string;
  readonly nombre: string;
  readonly desde: string | null;
  readonly verificada: boolean;
  readonly viajes: string | null;
  readonly foto: { readonly uri: string; readonly headers?: Record<string, string> } | null;
}

/** `true` sólo cuando Metro sirve la aplicación. En release, `false`. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * El respaldo cuando nadie pasa datos, y por qué depende del modo.
 *
 * En desarrollo se pinta el ejemplo: es lo que hace que el recorrido de diseño
 * y el laboratorio se puedan mirar sin sesión.
 *
 * En RELEASE se pinta vacío. Unos datos de demostración que acaban como
 * respaldo en tiempo de ejecución son la forma más silenciosa de enseñar
 * información falsa como verdadera, y «Demo Pasajera» en el perfil de una
 * persona real sería exactamente eso. Un perfil en blanco se ve como un fallo
 * —que lo es— en vez de como el nombre de otra persona.
 */
const PERFIL_VACIO: DatosDelPerfil = {
  iniciales: '',
  nombre: '',
  desde: null,
  verificada: false,
  viajes: null,
  foto: null
};

/** Los del fixture, para el recorrido de diseño. */
const PERFIL_DE_EJEMPLO: DatosDelPerfil = {
  iniciales: PERFIL_DEMO.iniciales,
  nombre: PERFIL_DEMO.nombre,
  desde: PERFIL_DEMO.desde,
  verificada: true,
  viajes: PERFIL_DEMO.viajes,
  foto: null
};

export function C2Perfil({ datos, sinLeer: sinLeerReal, onFila, onCerrarSesion, cerrando = false, barra = 'pasajera', control }: {
  /** Sin esto se pinta el ejemplo. Con esto, la persona de verdad. */
  readonly datos?: DatosDelPerfil;
  /** Cuántos avisos sin leer. Sin esto se cuenta el fixture. */
  readonly sinLeer?: number;
  readonly onFila?: (clave: string) => void;
  readonly onCerrarSesion?: () => void;
  readonly cerrando?: boolean;
  /** De quien es la barra de abajo. Ver `C2Historial`. */
  readonly barra?: 'pasajera' | 'conductor';
  /**
   * El control del centro de la barra.
   *
   * Sin esto se usa el de la pasajera. El conductor pasa el SUYO --su disco de
   * disponibilidad--, porque el hueco del centro no puede quedarse vacio: en su
   * shell ese sitio es el de ponerse en servicio.
   */
  readonly control?: ReactNode;
} = {}) {
  const tema = useTema();
  const sinLeer = sinLeerReal ?? AVISOS_DEMO.filter(aviso => aviso.sinLeer).length;
  const perfil = datos ?? (EN_DESARROLLO ? PERFIL_DE_EJEMPLO : PERFIL_VACIO);

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tema.ritmo.entreBloques + ALTO_DE_LA_BARRA }}
      >
        <CabeceraAmarilla>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt nivel="titulo" tono="sobreAcento" accessibilityRole="header">Tu perfil</Txt>
            <View style={{ flex: 1 }} />
            <Campana
              sinLeer={sinLeer}
              sobreElAmarillo
              onPress={onFila === undefined ? undefined : () => onFila('avisos')}
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
            {/* El disco del avatar va en grafito sobre el amarillo: uno claro
                encima del amarillo desaparecería. Es la misma inversión que el
                sello de los comercios. */}
            <View style={{
              width: 62,
              height: 62,
              borderRadius: 31,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tema.color.sobreAcento,
              overflow: 'hidden'
            }}>
              {perfil.foto === null ? (
                <Txt nivel="titulo" tono="marca">{perfil.iniciales}</Txt>
              ) : (
                // El MISMO disco, con la fotografía dentro. La fotografía es
                // privada y viaja con su cabecera de sesión: sin ella el
                // servidor responde 403 igual que si la persona no existiera.
                <Image
                  source={perfil.foto}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                  style={{ width: '100%', height: '100%' }}
                />
              )}
            </View>

            <View style={{ flex: 1, gap: 3 }}>
              <Txt nivel="encabezado" tono="sobreAcento">{perfil.nombre}</Txt>
              {/* Sin fecha legible, la línea desaparece en vez de enseñar
                  «Invalid Date». */}
              {perfil.desde !== null ? (
                <Txt nivel="pie" tono="sobreAcento" estilo={{ opacity: 0.78 }}>
                  {perfil.desde}
                </Txt>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 7, marginTop: 3 }}>
                {/* Cada sello aparece SOLO si el dato existe. Con la persona de
                    verdad, «N viajes» no se pinta: `GET /api/auth/me` no lo
                    devuelve, y un número inventado en un perfil real es peor
                    que un hueco. */}
                {perfil.verificada ? <SelloSobreAmarillo texto="Verificada" /> : null}
                {perfil.viajes !== null ? (
                  <SelloSobreAmarillo texto={`${perfil.viajes} viajes`} />
                ) : null}
              </View>
            </View>
          </View>
        </CabeceraAmarilla>

        <View style={{ paddingHorizontal: tema.ritmo.margenPantalla }}>
          <Grupo titulo="Tu cuenta">
            <Fila
              icono="lapiz"
              titulo="Tus datos"
              detalle="Nombre, teléfono y correo"
              onPress={onFila === undefined ? undefined : () => onFila('datos')}
            />
            <Separador />
            <Fila
              icono="escudo"
              titulo="Seguridad de la cuenta"
              detalle="Cómo entras y cómo cerrar tu cuenta"
              onPress={onFila === undefined ? undefined : () => onFila('seguridad')}
            />
            {/* El saldo, SÓLO en el perfil de la pasajera.
                Cedió su pestaña al Transporte Seguro y bajó aquí, que es el
                vecindario que le corresponde: un dato de cuenta, al lado de los
                datos personales y la seguridad.
                El conductor no la ve porque él SÍ conserva su pestaña de Saldo,
                y su cartera es otra cosa —liquidaciones, comisiones, retiros—.
                Dos filas al mismo sitio desde dos oficios distintos sería
                mandarle a la cartera de otro. */}
            {barra === 'pasajera' ? (
              <>
                <Separador />
                <Fila
                  icono="billetera"
                  titulo="Tu saldo"
                  detalle="Lo que tienes y cómo pagas tus viajes"
                  onPress={onFila === undefined ? undefined : () => onFila('saldo')}
                />
              </>
            ) : null}
          </Grupo>

          <Grupo titulo="Preferencias">
            <Fila
              icono="campana"
              titulo="Notificaciones"
              detalle="Qué avisos quieres recibir"
              onPress={onFila === undefined ? undefined : () => onFila('avisos')}
            />
            <Separador />
            <Fila
              icono="ajustes"
              titulo="Configuración"
              detalle="Idioma, mapa y apariencia"
              onPress={onFila === undefined ? undefined : () => onFila('configuracion')}
            />
            <Separador />
            <Fila
              icono="volante"
              titulo="Cambiar de modo"
              detalle="Pasar a conductor"
              onPress={onFila === undefined ? undefined : () => onFila('conductor')}
            />
          </Grupo>

          <View style={{ marginTop: tema.ritmo.entreBloques, gap: tema.ritmo.entreElementos }}>
            <Boton
              titulo="Cerrar sesión"
              icono="salir"
              variante="secundario"
              cargando={cerrando}
              onPress={onCerrarSesion ?? (() => undefined)}
            />
          </View>
        </View>
      </ScrollView>

      <BarraDeNavegacion
        destinos={barra === 'conductor' ? DESTINOS_DE_CONDUCTOR : DESTINOS_DE_PASAJERA}
        activo="perfil"
        control={control ?? (barra === 'conductor' ? <ControlDeDisponibilidad enLinea={false} /> : <ControlDePedido abierto={false} />)}
      />
    </View>
  );
}

/** Una insignia para la banda amarilla: perfilada en grafito, no rellena. */
function SelloSobreAmarillo({ texto }: { readonly texto: string }) {
  const tema = useTema();

  return (
    <View style={{
      borderWidth: 1,
      borderColor: tema.color.sobreAcento,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3
    }}>
      <Txt nivel="etiqueta" tono="sobreAcento">{texto}</Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Saldo
// ---------------------------------------------------------------------------

/**
 * El saldo.
 *
 * **No enseña ninguna cifra, y es la decisión más importante de esta pantalla.**
 * La cartera está apagada en el servidor: no hay saldo que consultar ni retiros
 * que hacer. Poner «$0,00» ya sería afirmar que la cuenta existe y está a cero;
 * poner cualquier otra cosa sería inventar dinero.
 *
 * Así que la pantalla dice lo que pasa —todavía no está activa— y enseña cómo
 * será cuando lo esté. Es lo único honesto que se puede enseñar hoy.
 */
export function C2Saldo() {
  const tema = useTema();

  return (
    <Seccion titulo="Tu saldo" activo="perfil">
      <View style={{
        padding: tema.ritmo.dentroDeTarjeta,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: tema.color.superficie,
        gap: tema.ritmo.entreElementos,
        overflow: 'hidden'
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icono nombre="rayo" color={tema.color.aviso} tamano={19} />
          <Txt nivel="encabezado">Todavía no está activa</Txt>
        </View>
        <Txt nivel="cuerpo" tono="secundario">
          La cartera aún no está encendida en el servidor. Cuando lo esté, aquí
          verás tu saldo, tus movimientos y podrás retirar.
        </Txt>
        <Txt nivel="pie" tono="tenue">
          No se enseña ninguna cifra a propósito: un número de ejemplo en esta
          pantalla se lee como dinero de verdad.
        </Txt>
      </View>

      <Grupo titulo="Cuando esté disponible">
        <Fila icono="calendario" titulo="Movimientos" detalle="Lo que entra y lo que sale, con su fecha" />
        <Separador />
        <Fila icono="billetera" titulo="Métodos de cobro" detalle="Dónde quieres recibir tu dinero" />
        <Separador />
        <Fila icono="flecha-arriba" titulo="Retirar" detalle="Sacar tu saldo a una cuenta tuya" />
      </Grupo>
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

/**
 * Un viaje de la lista, tal como se pinta.
 *
 * Plano y sin nada de `services/`: la misma pantalla sirve para el recorrido de
 * diseño —con el fixture— y para la aplicación real —con los viajes de
 * verdad—.
 */
export interface ViajeEnPantalla {
  readonly clave: string;
  readonly fecha: string;
  readonly origen: string;
  readonly destino: string;
  readonly estado: string;
  /** `true` sólo cuando el viaje terminó bien. Decide el color de la insignia. */
  readonly completado: boolean;
}

const HISTORIAL_DE_EJEMPLO: readonly ViajeEnPantalla[] = HISTORIAL_DEMO.map(viaje => ({
  clave: viaje.clave,
  fecha: viaje.fecha,
  origen: viaje.origen,
  destino: viaje.destino,
  estado: viaje.estado,
  completado: viaje.estado === 'Completado'
}));

export function C2Historial({ viajes, estado = 'listo', onViaje, onReintentar, barra = 'pasajera', control }: {
  readonly viajes?: readonly ViajeEnPantalla[];
  readonly estado?: 'cargando' | 'listo' | 'error';
  readonly onViaje?: (clave: string) => void;
  readonly onReintentar?: () => void;
  /**
   * De quien es la barra de abajo.
   *
   * El historial lo ven los dos roles, pero no con la misma barra: la de
   * pasajera lleva el boton amarillo de pedir, y ensenarselo a un conductor
   * era ofrecerle algo que no es suyo. Por omision, pasajera: el laboratorio
   * y cualquier uso anterior no cambian.
   */
  readonly barra?: 'pasajera' | 'conductor';
  /**
   * El control del centro de la barra.
   *
   * Sin esto se usa el de la pasajera. El conductor pasa el SUYO --su disco de
   * disponibilidad--, porque el hueco del centro no puede quedarse vacio: en su
   * shell ese sitio es el de ponerse en servicio.
   */
  readonly control?: ReactNode;
} = {}) {
  const tema = useTema();
  const ir = useIr();

  const lista = viajes ?? (EN_DESARROLLO ? HISTORIAL_DE_EJEMPLO : []);
  // Contados de lo que hay, no escritos a mano: una cifra a mano se queda
  // vieja en cuanto cambia la lista, y aquí lo que se cuenta está justo debajo.
  const completados = lista.filter(viaje => viaje.completado).length;

  const abrir = onViaje ?? ((clave: string) => ir('viaje-detalle', { viaje: clave }));

  return (
    <Seccion
      titulo="Tu historial"
      activo="historial"
      barra={barra}
      control={control}
      resumen={
        <View style={{ gap: 9 }}>
          <Txt nivel="pie" tono="sobreAcento" estilo={{ opacity: 0.78 }}>
            Todo lo que has pedido, con su registro
          </Txt>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            <SelloSobreAmarillo texto={`${lista.length} viajes`} />
            <SelloSobreAmarillo texto={`${completados} completados`} />
          </View>
        </View>
      }
    >
      {estado === 'cargando' ? (
        <View style={{ paddingVertical: tema.ritmo.entreBloques * 2, alignItems: 'center' }}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {estado === 'error' ? (
        <View style={{
          paddingVertical: tema.ritmo.entreBloques,
          alignItems: 'center',
          gap: tema.ritmo.entreElementos
        }}>
          <Txt nivel="cuerpo" centrado>No se pudo cargar tu historial.</Txt>
          <Boton titulo="Reintentar" variante="secundario" onPress={onReintentar ?? (() => undefined)} />
        </View>
      ) : null}

      {estado === 'listo' && lista.length === 0 ? (
        <View style={{ paddingVertical: tema.ritmo.entreBloques * 2, alignItems: 'center', gap: 6 }}>
          <Txt nivel="cuerpo" tono="secundario" centrado>Todavía no has hecho ningún viaje.</Txt>
          <Txt nivel="pie" tono="tenue" centrado>
            Cuando pidas el primero, aparecerá aquí con todo su registro.
          </Txt>
        </View>
      ) : null}

      {(estado === 'listo' ? lista : []).map((viaje, indice) => (
        <View key={viaje.clave}>
          {indice > 0 ? <Separador /> : null}
          <Pressable
            onPress={() => abrir(viaje.clave)}
            accessibilityRole="button"
            accessibilityLabel={`${viaje.fecha}. De ${viaje.origen} a ${viaje.destino}. ${viaje.estado}. Ver el detalle`}
            accessibilityHint="Abre el registro completo: horas, cobro y conversación"
            style={({ pressed }) => ({ paddingVertical: 15, gap: 9, opacity: pressed ? 0.65 : 1 })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt nivel="etiqueta" tono="secundario">{viaje.fecha}</Txt>
              <View style={{ flex: 1 }} />
              <Insignia texto={viaje.estado} tono={viaje.completado ? 'exito' : 'neutro'} />
            </View>

            {/* El mismo par de puntos que en el trayecto: se reconoce sin leer. */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                <View style={{
                  width: 9, height: 9, borderRadius: 5,
                  backgroundColor: tema.color.textoSecundario
                }} />
                <View style={{ width: 2, flex: 1, minHeight: 16, backgroundColor: tema.color.borde }} />
                <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: tema.color.acento }} />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Txt nivel="cuerpo" tono="secundario" numberOfLines={1}>{viaje.origen}</Txt>
                <Txt nivel="cuerpo" numberOfLines={1}>{viaje.destino}</Txt>
              </View>
            </View>

            {/* La fila entera lleva al registro, pero eso no se ve. El rótulo
                es lo que lo dice, y hace falta: quien viene a reclamar está
                buscando dónde se mira lo que pasó, no tanteando filas. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Txt nivel="etiqueta" tono="acento">Ver detalle</Txt>
              <Txt nivel="etiqueta" tono="acento">›</Txt>
            </View>
          </Pressable>
        </View>
      ))}

      {estado === 'listo' && lista.length > 0 ? (
        <View style={{ marginTop: tema.ritmo.entreBloques, alignItems: 'center', gap: 4 }}>
          <Txt nivel="pie" tono="tenue" centrado>
            Cada viaje guarda sus horas, su cobro y la conversación.
          </Txt>
          <Txt nivel="pie" tono="tenue">Los importes los calcula el servidor.</Txt>
        </View>
      ) : null}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// Viaje seguro
// ---------------------------------------------------------------------------

/**
 * Viaje seguro.
 *
 * Se llamaba «Seguridad», que en una aplicación suena a contraseñas y sesiones.
 * Esto es otra cosa: lo que protege un trayecto mientras ocurre. El nombre nuevo
 * lo dice, y además es el que la marca ya usa con Transporte Seguro.
 *
 * El aviso de emergencia va arriba, grande y separado del resto. Es lo único de
 * toda la aplicación que se busca con prisa y quizá sin mirar bien, así que no
 * puede estar al final de una lista ni parecerse a los demás elementos.
 *
 * Va en rojo y no en amarillo: el amarillo es la marca y aquí significaría
 * «esto es de +58express», no «esto es urgente».
 */
export function C2ViajeSeguro() {
  const tema = useTema();

  return (
    <Seccion titulo="Viaje seguro" activo="viaje-seguro">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Emergencia. Pedir ayuda ahora"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 15,
          padding: tema.ritmo.dentroDeTarjeta,
          borderRadius: tema.radio.tarjeta,
          backgroundColor: pressed ? `${tema.color.peligro}2e` : `${tema.color.peligro}1f`,
          borderWidth: 1,
          borderColor: tema.color.peligro
        })}
      >
        <View style={{
          width: 48, height: 48, borderRadius: 24,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: tema.color.peligro
        }}>
          <Icono nombre="escudo" color={tema.color.fondo} tamano={24} activo />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt nivel="encabezado">Emergencia</Txt>
          <Txt nivel="pie" tono="secundario">Pedir ayuda ahora mismo</Txt>
        </View>
      </Pressable>

      <View style={{ marginTop: tema.ritmo.entreBloques }}>
        <EntradaDeTransporteSeguro />
      </View>

      <Grupo titulo="Mientras vas de camino">
        <Fila icono="viajes" titulo="Compartir mi viaje" detalle="Que alguien vea por dónde vas" />
        <Separador />
        <Fila icono="perfil" titulo="Contactos de confianza" detalle="A quién avisar si pasa algo" />
        <Separador />
        <Fila icono="escudo" titulo="Verificar a tu conductor" detalle="Comprobar placa y foto antes de subir" />
        <Separador />
        <Fila icono="rayo" titulo="Ayuda durante el viaje" detalle="Hablar con soporte sin salir del viaje" />
      </Grupo>

      <Grupo titulo="Aprender">
        <Fila icono="inicio" titulo="Centro de seguridad" detalle="Consejos y qué hacer en cada caso" />
      </Grupo>
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

/**
 * Los avisos.
 *
 * Cada uno lleva a donde pasó la cosa: el de un viaje abre ese viaje, el de
 * Transporte Seguro abre su traslado. Un aviso que no lleva a ningún sitio
 * obliga a buscar a mano lo que acaba de anunciar.
 */
/**
 * Un aviso, tal como lo pinta la lista.
 *
 * Plano y sin nada de `services/`, igual que los datos del perfil: la misma
 * pantalla sirve para el recorrido de diseño —con el fixture— y para la
 * aplicación real —con la bandeja de verdad—.
 */
export interface AvisoEnPantalla {
  readonly clave: string;
  readonly titulo: string;
  readonly detalle: string;
  readonly cuando: string;
  readonly sinLeer: boolean;
  /** `false` cuando el aviso no lleva a ninguna parte. */
  readonly navegable: boolean;
}

const AVISOS_DE_EJEMPLO: readonly AvisoEnPantalla[] = AVISOS_DEMO.map(aviso => ({
  clave: aviso.clave,
  titulo: aviso.titulo,
  detalle: aviso.detalle,
  cuando: aviso.cuando,
  sinLeer: aviso.sinLeer,
  navegable: true
}));

export function C2Avisos({ avisos, estado = 'listo', pie, onAviso, onLeerTodos, onReintentar, barra = 'pasajera', control: _control }: {
  readonly avisos?: readonly AvisoEnPantalla[];
  readonly estado?: 'cargando' | 'listo' | 'error';
  /** El texto del final. Cambia según si los avisos llevan a alguna parte. */
  readonly pie?: string;
  readonly onAviso?: (clave: string) => void;
  readonly onLeerTodos?: () => void;
  readonly onReintentar?: () => void;
  /** De quién es la barra inferior: pasajera o conductor. */
  readonly barra?: 'pasajera' | 'conductor';
  readonly control?: React.ReactNode;
} = {}) {
  const tema = useTema();
  const lista = avisos ?? (EN_DESARROLLO ? AVISOS_DE_EJEMPLO : []);
  const sinLeer = lista.filter(aviso => aviso.sinLeer).length;

  if (estado === 'cargando') {
    return (
      <Seccion titulo="Avisos" activo="perfil" conCampana={false} barra={barra}>
        <View style={{ paddingVertical: tema.ritmo.entreBloques * 2, alignItems: 'center' }}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      </Seccion>
    );
  }

  if (estado === 'error') {
    return (
      <Seccion titulo="Avisos" activo="perfil" conCampana={false} barra={barra}>
        <View style={{ paddingVertical: tema.ritmo.entreBloques, alignItems: 'center', gap: tema.ritmo.entreElementos }}>
          <Txt nivel="cuerpo" centrado>No se pudieron cargar tus avisos.</Txt>
          <Boton titulo="Reintentar" variante="secundario" onPress={onReintentar ?? (() => undefined)} />
        </View>
      </Seccion>
    );
  }

  return (
    <Seccion titulo="Avisos" activo="perfil" conCampana={false} barra={barra}>
      {/* «Marcar todos» aparece con DOS condiciones: que haya algo que marcar y
          que alguien sepa marcarlo.
          Lo segundo deja el recorrido de diseño exactamente como estaba —ahí
          nadie pasa manejador— y evita lo peor de todo: un botón que se pulsa
          y no cambia nada, que enseña a no fiarse de los botones. */}
      {sinLeer > 0 && onLeerTodos !== undefined ? (
        <View style={{ alignItems: 'flex-end', paddingBottom: 4 }}>
          <Pressable
            onPress={onLeerTodos}
            accessibilityRole="button"
            accessibilityLabel={`Marcar como leídos los ${sinLeer} avisos sin leer`}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 6 })}
          >
            <Txt nivel="etiqueta" tono="acento">Marcar todos como leídos</Txt>
          </Pressable>
        </View>
      ) : null}

      {lista.length === 0 ? (
        <View style={{ paddingVertical: tema.ritmo.entreBloques * 2, alignItems: 'center', gap: 6 }}>
          <Txt nivel="cuerpo" tono="secundario" centrado>Todavía no tienes avisos.</Txt>
          <Txt nivel="pie" tono="tenue" centrado>
            Aquí aparecerá lo que necesitemos contarte.
          </Txt>
        </View>
      ) : null}

      {lista.map((aviso, indice) => (
        <View key={aviso.clave}>
          {indice > 0 ? <Separador /> : null}
          <Pressable
            onPress={onAviso === undefined ? undefined : () => onAviso(aviso.clave)}
            accessibilityRole="button"
            accessibilityLabel={`${aviso.titulo}. ${aviso.detalle}. ${aviso.cuando}${aviso.sinLeer ? '. Sin leer' : ''}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 13,
              paddingVertical: 14,
              opacity: pressed ? 0.65 : 1
            })}
          >
            {/* Sin leer: un punto amarillo. Es la única marca que hace falta;
                un fondo distinto por fila convertiría la lista en un damero. */}
            <View style={{ width: 8 }}>
              {aviso.sinLeer ? (
                <View style={{
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: tema.color.acento
                }} />
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Txt nivel="cuerpo" tono={aviso.sinLeer ? 'primario' : 'secundario'}>
                {aviso.titulo}
              </Txt>
              <Txt nivel="pie" tono="tenue">{aviso.detalle}</Txt>
              {aviso.cuando !== '' ? (
                <Txt nivel="pie" tono="tenue">{aviso.cuando}</Txt>
              ) : null}
            </View>
            {/* El galón dice «esto lleva a alguna parte». Cuando el aviso no
                lleva —que hoy es siempre, porque el servidor no manda
                destino— no se pinta: una flecha que no va a ningún sitio
                enseña a no hacer caso de las flechas. */}
            {aviso.navegable ? <Galon /> : null}
          </Pressable>
        </View>
      ))}

      {lista.length > 0 ? (
        <View style={{ marginTop: tema.ritmo.entreBloques, alignItems: 'center' }}>
          <Txt nivel="pie" tono="tenue" centrado>
            {pie ?? 'Cada aviso te lleva a donde pasó.'}
          </Txt>
        </View>
      ) : null}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// Ayuda
// ---------------------------------------------------------------------------

export function C2Ayuda() {
  const tema = useTema();

  return (
    <Seccion titulo="Ayuda" activo="perfil">
      <Superficie destacada>
        <View style={{ gap: tema.ritmo.entreElementos }}>
          <View style={{ gap: 4 }}>
            <Txt nivel="encabezado">¿Necesitas ayuda?</Txt>
            <Txt nivel="cuerpo" tono="secundario">
              Escríbenos y te respondemos en el mismo chat.
            </Txt>
          </View>
          <Boton titulo="Escribir a soporte" onPress={() => undefined} />
        </View>
      </Superficie>

      <Grupo titulo="Preguntas frecuentes">
        <Fila icono="destino" titulo="¿Cómo pido un viaje?" />
        <Separador />
        <Fila icono="rayo" titulo="¿Cómo se calcula el precio?" detalle="Con la tarifa y la tasa del BCV" />
        <Separador />
        <Fila icono="escudo" titulo="¿Qué es Transporte Seguro?" />
        <Separador />
        <Fila icono="moto" titulo="¿Cómo me hago conductor?" />
      </Grupo>

      <Grupo titulo="Sobre un viaje">
        <Fila icono="viajes" titulo="Reportar un problema" detalle="Elige el viaje y cuéntanos qué pasó" />
        <Separador />
        <Fila icono="inicio" titulo="Objeto olvidado" detalle="Te ayudamos a contactar con el conductor" />
      </Grupo>
    </Seccion>
  );
}
