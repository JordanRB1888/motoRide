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

import { type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Boton, Insignia, Superficie, Txt } from '../ui/componentes';
import { Icono, type NombreDeIcono } from '../ui/Icono';
import { Separador } from '../ui/HojaInferior';
import { BarraDeNavegacion, ControlDePedido, DESTINOS_DE_PASAJERA } from '../ui/Navegacion';
import { EntradaDeTransporteSeguro } from '../ui/Servicio';
import { useTema } from '../theme/ThemeContext';
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

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sinLeer > 0 ? `Avisos: ${sinLeer} sin leer` : 'Avisos'}
      style={({ pressed }) => ({
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? tema.color.superficieElevada : 'transparent'
      })}
    >
      <Icono
        nombre="campana"
        color={sobreElAmarillo ? tema.color.sobreAcento : tema.color.textoSecundario}
        tamano={22}
      />
      {sinLeer > 0 ? (
        <View style={{
          position: 'absolute', top: 7, right: 9,
          width: 9, height: 9, borderRadius: 5,
          // Sobre el amarillo, el punto va en grafito: el amarillo sobre
          // amarillo no marca nada.
          backgroundColor: sobreElAmarillo ? tema.color.sobreAcento : tema.color.acento,
          // El aro del color del fondo separa el punto de la campana; sin él
          // se leen como una sola forma.
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
function Seccion({ titulo, activo, conCampana = true, children }: {
  readonly titulo: string;
  readonly activo: string;
  readonly conCampana?: boolean;
  readonly children: ReactNode;
}) {
  const tema = useTema();
  const sinLeer = AVISOS_DEMO.filter(aviso => aviso.sinLeer).length;

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 18,
        paddingBottom: tema.ritmo.entreElementos,
        paddingLeft: tema.ritmo.margenPantalla,
        paddingRight: conCampana ? tema.ritmo.margenPantalla - 8 : tema.ritmo.margenPantalla
      }}>
        <Txt nivel="titulo" accessibilityRole="header">{titulo}</Txt>
        <View style={{ flex: 1 }} />
        {conCampana ? <Campana sinLeer={sinLeer} /> : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingBottom: tema.ritmo.entreBloques + ALTO_DE_LA_BARRA
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo={activo}
        control={<ControlDePedido abierto={false} />}
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
  const color = tono === 'peligro' ? tema.color.peligro : tema.color.textoSecundario;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detalle ? `${titulo}. ${detalle}` : titulo}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 13,
        opacity: pressed ? 0.65 : 1
      })}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: tono === 'peligro' ? `${tema.color.peligro}1f` : tema.color.superficieElevada
      }}>
        <Icono nombre={icono} color={color} tamano={18} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt nivel="cuerpo" tono={tono === 'peligro' ? 'secundario' : 'primario'}>{titulo}</Txt>
        {detalle ? <Txt nivel="pie" tono="tenue">{detalle}</Txt> : null}
      </View>
      {derecha}
      <Galon />
    </Pressable>
  );
}

/** La punta que dice «esto lleva a algún sitio». */
function Galon() {
  const tema = useTema();

  return (
    <View style={{ width: 9, height: 14, justifyContent: 'center' }}>
      {[38, -38].map((giro, indice) => (
        <View key={giro} style={{
          position: 'absolute',
          width: 8, height: 1.7, borderRadius: 1,
          backgroundColor: tema.color.textoTenue,
          transform: [{ rotate: `${giro}deg` }, { translateY: indice === 0 ? -2.4 : 2.4 }]
        }} />
      ))}
    </View>
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
 * El criterio es el mismo de siempre: la banda va donde hay un SUJETO que
 * presentar. En el saldo es tu dinero, en la ficha es un comercio concreto, y
 * aquí eres tú. Donde no hay sujeto —el historial, los avisos, que son listas—
 * no la lleva, y por eso sigue significando algo.
 *
 * Esta pantalla no usa el armazón de `Seccion` como las demás: ese armazón pinta
 * el título con márgenes laterales, y la banda tiene que ir de borde a borde.
 * Se escribe suelta, que son cuatro líneas más y queda más claro que doblar el
 * armazón para que admita las dos formas.
 */
export function C2Perfil() {
  const tema = useTema();
  const sinLeer = AVISOS_DEMO.filter(aviso => aviso.sinLeer).length;

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
            <Campana sinLeer={sinLeer} sobreElAmarillo />
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
              backgroundColor: tema.color.sobreAcento
            }}>
              <Txt nivel="titulo" tono="marca">{PERFIL_DEMO.iniciales}</Txt>
            </View>

            <View style={{ flex: 1, gap: 3 }}>
              <Txt nivel="encabezado" tono="sobreAcento">{PERFIL_DEMO.nombre}</Txt>
              <Txt nivel="pie" tono="sobreAcento" estilo={{ opacity: 0.78 }}>
                {PERFIL_DEMO.desde}
              </Txt>
              <View style={{ flexDirection: 'row', gap: 7, marginTop: 3 }}>
                <SelloSobreAmarillo texto="Verificada" />
                <SelloSobreAmarillo texto={`${PERFIL_DEMO.viajes} viajes`} />
              </View>
            </View>
          </View>
        </CabeceraAmarilla>

        <View style={{ paddingHorizontal: tema.ritmo.margenPantalla }}>
          <Grupo titulo="Tu cuenta">
            <Fila icono="perfil" titulo="Tus datos" detalle="Nombre, teléfono y correo" />
            <Separador />
            <Fila icono="inicio" titulo="Direcciones guardadas" detalle="Casa, trabajo y las que añadas" />
            <Separador />
            <Fila icono="escudo" titulo="Seguridad de la cuenta" detalle="Contraseña y sesiones abiertas" />
          </Grupo>

          <Grupo titulo="Preferencias">
            <Fila icono="campana" titulo="Notificaciones" detalle="Qué avisos quieres recibir" />
            <Separador />
            <Fila icono="ajustes" titulo="Configuración" detalle="Idioma, mapa y apariencia" />
            <Separador />
            <Fila icono="moto" titulo="Cambiar de modo" detalle="Pasar a conductor" />
          </Grupo>

          <Grupo titulo="Dinero">
            <Fila icono="rayo" titulo="Tu saldo" detalle="Todavía no está activo" />
          </Grupo>

          <Grupo titulo="Ayuda">
            <Fila icono="viajes" titulo="Soporte" detalle="Escríbenos si algo no cuadra" />
          </Grupo>

          <View style={{ marginTop: tema.ritmo.entreBloques, gap: tema.ritmo.entreElementos }}>
            <Boton titulo="Cerrar sesión" variante="secundario" onPress={() => undefined} />

            {/* Lo que no tiene vuelta atrás, separado y en rojo. */}
            <Separador />
            <Fila
              icono="perfil"
              titulo="Eliminar cuenta"
              detalle="Esta acción no se puede deshacer"
              tono="peligro"
            />
          </View>
        </View>
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="perfil"
        control={<ControlDePedido abierto={false} />}
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
        <Fila icono="viajes" titulo="Movimientos" detalle="Lo que entra y lo que sale, con su fecha" />
        <Separador />
        <Fila icono="perfil" titulo="Métodos de cobro" detalle="Dónde quieres recibir tu dinero" />
        <Separador />
        <Fila icono="rayo" titulo="Retirar" detalle="Sacar tu saldo a una cuenta tuya" />
      </Grupo>
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

export function C2Historial() {
  const tema = useTema();
  const ir = useIr();

  return (
    <Seccion titulo="Tu historial" activo="historial">
      {HISTORIAL_DEMO.map((viaje, indice) => (
        <View key={viaje.clave}>
          {indice > 0 ? <Separador /> : null}
          <Pressable
            onPress={() => ir('viaje-detalle', { viaje: viaje.clave })}
            accessibilityRole="button"
            accessibilityLabel={`${viaje.fecha}. De ${viaje.origen} a ${viaje.destino}. ${viaje.estado}. Ver el detalle`}
            accessibilityHint="Abre el registro completo: horas, cobro y conversación"
            style={({ pressed }) => ({ paddingVertical: 15, gap: 9, opacity: pressed ? 0.65 : 1 })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt nivel="etiqueta" tono="secundario">{viaje.fecha}</Txt>
              <View style={{ flex: 1 }} />
              <Insignia
                texto={viaje.estado}
                tono={viaje.estado === 'Completado' ? 'exito' : 'neutro'}
              />
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

      <View style={{ marginTop: tema.ritmo.entreBloques, alignItems: 'center', gap: 4 }}>
        <Txt nivel="pie" tono="tenue" centrado>
          Cada viaje guarda sus horas, su cobro y la conversación.
        </Txt>
        <Txt nivel="pie" tono="tenue">Los importes los calcula el servidor.</Txt>
      </View>
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
export function C2Avisos() {
  const tema = useTema();

  return (
    <Seccion titulo="Avisos" activo="perfil" conCampana={false}>
      {AVISOS_DEMO.map((aviso, indice) => (
        <View key={aviso.clave}>
          {indice > 0 ? <Separador /> : null}
          <Pressable
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
              <Txt nivel="pie" tono="tenue">{aviso.cuando}</Txt>
            </View>
            <Galon />
          </Pressable>
        </View>
      ))}

      <View style={{ marginTop: tema.ritmo.entreBloques, alignItems: 'center' }}>
        <Txt nivel="pie" tono="tenue">Cada aviso te lleva a donde pasó.</Txt>
      </View>
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
