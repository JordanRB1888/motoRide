/**
 * Las secciones de C2: perfil, saldo, historial, seguridad, avisos y ayuda.
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
import {
  AVISOS_DEMO,
  HISTORIAL_DEMO,
  PERFIL_DEMO
} from './fixtures';

// ---------------------------------------------------------------------------
// El armazón que comparten
// ---------------------------------------------------------------------------

/**
 * Una sección: título, contenido que se desplaza y la barra de siempre.
 *
 * La barra se queda porque estas pantallas son destinos de la navegación, no
 * pantallas apiladas encima: quitarla dejaría a la persona sin saber cómo
 * volver a donde estaba.
 */
function Seccion({ titulo, activo, children }: {
  readonly titulo: string;
  readonly activo: string;
  readonly children: ReactNode;
}) {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <View style={{
        paddingTop: 22,
        paddingBottom: tema.ritmo.entreElementos,
        paddingHorizontal: tema.ritmo.margenPantalla
      }}>
        <Txt nivel="titulo" accessibilityRole="header">{titulo}</Txt>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingBottom: tema.ritmo.entreBloques
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
function Fila({ icono, titulo, detalle, derecha, onPress }: {
  readonly icono: NombreDeIcono;
  readonly titulo: string;
  readonly detalle?: string;
  readonly derecha?: ReactNode;
  readonly onPress?: () => void;
}) {
  const tema = useTema();

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
        backgroundColor: tema.color.superficieElevada
      }}>
        <Icono nombre={icono} color={tema.color.textoSecundario} tamano={18} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt nivel="cuerpo">{titulo}</Txt>
        {detalle ? <Txt nivel="pie" tono="tenue">{detalle}</Txt> : null}
      </View>
      {derecha}
    </Pressable>
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

export function C2Perfil() {
  const tema = useTema();

  return (
    <Seccion titulo="Tu perfil" activo="perfil">
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 15,
        padding: tema.ritmo.dentroDeTarjeta,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: tema.color.superficie
      }}>
        <View style={{
          width: 62, height: 62, borderRadius: 31,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: tema.color.superficieElevada
        }}>
          <Txt nivel="titulo">{PERFIL_DEMO.iniciales}</Txt>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Txt nivel="encabezado">{PERFIL_DEMO.nombre}</Txt>
          <Txt nivel="pie" tono="tenue">{PERFIL_DEMO.desde}</Txt>
          <View style={{ flexDirection: 'row', gap: 7, marginTop: 3 }}>
            <Insignia texto="Verificada" tono="exito" />
            <Insignia texto={`${PERFIL_DEMO.viajes} viajes`} />
          </View>
        </View>
      </View>

      <Grupo titulo="Tus datos">
        <Fila icono="perfil" titulo="Teléfono" detalle={PERFIL_DEMO.telefono} />
        <Separador />
        <Fila icono="perfil" titulo="Correo" detalle={PERFIL_DEMO.correo} />
      </Grupo>

      <Grupo titulo="Tu cuenta">
        <Fila icono="inicio" titulo="Direcciones guardadas" detalle="Casa, trabajo y las que añadas" />
        <Separador />
        <Fila icono="escudo" titulo="Seguridad" detalle="Contactos y ajustes de protección" />
        <Separador />
        <Fila icono="reloj" titulo="Cambiar de modo" detalle="Pasar a conductor" />
      </Grupo>

      <View style={{ marginTop: tema.ritmo.entreBloques }}>
        <Boton titulo="Cerrar sesión" variante="secundario" onPress={() => undefined} />
      </View>
    </Seccion>
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

  return (
    <Seccion titulo="Tus viajes" activo="viajes">
      {HISTORIAL_DEMO.map((viaje, indice) => (
        <View key={viaje.clave}>
          {indice > 0 ? <Separador /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${viaje.fecha}. De ${viaje.origen} a ${viaje.destino}. ${viaje.estado}`}
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
          </Pressable>
        </View>
      ))}

      <View style={{ marginTop: tema.ritmo.entreBloques, alignItems: 'center' }}>
        <Txt nivel="pie" tono="tenue">Los importes los calcula el servidor.</Txt>
      </View>
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// Seguridad
// ---------------------------------------------------------------------------

/**
 * Seguridad.
 *
 * El botón de emergencia va arriba, grande y separado del resto. Es lo único de
 * toda la aplicación que se busca con prisa y quizá sin mirar bien, así que no
 * puede estar al final de una lista ni parecerse a los demás elementos.
 *
 * Va en rojo y no en amarillo: el amarillo es la marca y aquí significaría
 * «esto es de +58express», no «esto es urgente».
 */
export function C2Seguridad() {
  const tema = useTema();

  return (
    <Seccion titulo="Seguridad" activo="seguridad">
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

      <Grupo titulo="Durante el viaje">
        <Fila icono="viajes" titulo="Compartir mi viaje" detalle="Que alguien vea por dónde vas" />
        <Separador />
        <Fila icono="perfil" titulo="Contactos de confianza" detalle="A quién avisar si pasa algo" />
        <Separador />
        <Fila icono="escudo" titulo="Verificar a tu conductor" detalle="Comprobar placa y foto antes de subir" />
      </Grupo>

      <Grupo titulo="Ayuda">
        <Fila icono="rayo" titulo="Centro de seguridad" detalle="Consejos y qué hacer en cada caso" />
      </Grupo>
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

export function C2Avisos() {
  const tema = useTema();

  return (
    <Seccion titulo="Avisos" activo="perfil">
      {AVISOS_DEMO.map((aviso, indice) => (
        <View key={aviso.clave}>
          {indice > 0 ? <Separador /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${aviso.titulo}. ${aviso.detalle}. ${aviso.cuando}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: 13,
              paddingVertical: 14,
              opacity: pressed ? 0.65 : 1
            })}
          >
            {/* Sin leer: un punto amarillo. Es la única marca que hace falta;
                un fondo distinto por fila convertiría la lista en un damero. */}
            <View style={{ width: 8, paddingTop: 7 }}>
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
          </Pressable>
        </View>
      ))}
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
        <Fila icono="perfil" titulo="¿Cómo me hago conductor?" />
      </Grupo>

      <Grupo titulo="Sobre un viaje">
        <Fila icono="viajes" titulo="Reportar un problema" detalle="Elige el viaje y cuéntanos qué pasó" />
        <Separador />
        <Fila icono="inicio" titulo="Objeto olvidado" detalle="Te ayudamos a contactar con el conductor" />
      </Grupo>
    </Seccion>
  );
}
