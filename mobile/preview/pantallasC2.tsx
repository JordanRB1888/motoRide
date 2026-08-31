/**
 * Las pantallas de C2.
 *
 * EL MAPA ES EL SUELO
 *
 * Deja de ser una ilustración dentro de una tarjeta y pasa a ser aquello sobre
 * lo que ocurre todo. Encima flotan una hoja con lo que la persona está
 * haciendo y la barra de navegación.
 *
 * Y desaparece la sopa de tarjetas: donde había una lista de rectángulos
 * —destino, servicios, seguridad, accesos— hay una superficie con grupos
 * separados por espacio y por una línea de un píxel.
 *
 * EL DISCO CENTRAL ES LA ACCIÓN
 *
 * Los dos roles tienen el mismo disco en el centro de la barra, y lo que cambia
 * es el color del aro: amarillo para pedir un viaje, verde para estar en línea,
 * apagado para conectarse. Se aprende una forma y sirve en las dos pantallas.
 *
 * En la pasajera, tocarlo despliega la petición completa sobre el mapa; el
 * mismo disco la cierra, convertido en aspa. No hay que buscar dónde se cierra
 * lo que se abrió desde ahí.
 *
 * LA DISCIPLINA DEL FILO
 *
 * El filo amarillo aparece UNA vez por zona visual. Si lo llevara todo, no
 * señalaría nada — que es justo lo que se corrigió al cerrar la dirección C.
 *
 * ESTO ES UNA MAQUETA
 *
 * Datos de demostración, sin llamadas a ninguna API y sin lógica real. La
 * pantalla de acceso de verdad es `app/acceso.tsx` y conserva intacto su
 * `AuthContext`; aquí sólo se prueba su aspecto.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Boton, Insignia, Superficie, Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { Arranque } from '../ui/Arranque';
import { LienzoDeMapa, type HitoEnMapa, type VehiculoEnMapa } from '../ui/Mapa';
import { HojaInferior, Separador } from '../ui/HojaInferior';
import {
  BarraDeNavegacion,
  ControlDeDisponibilidad,
  ControlDePedido,
  DESTINOS_DE_CONDUCTOR,
  DESTINOS_DE_PASAJERA
} from '../ui/Navegacion';
import { AvatarDeRol, LogoQueEntra, Vehiculo } from '../ui/Marca';
import { EntradaDeTransporteSeguro } from '../ui/Servicio';
import {
  BuscandoVehiculo,
  FranjaDeContexto,
  PanelDeJornada,
  PulsoDeBusqueda
} from '../ui/Estados';
import {
  ChipDeBeneficiario,
  LugaresGuardados,
  OpcionesDeBeneficiario,
  Trayecto,
  type Beneficiario
} from '../ui/Trayecto';
import { useTema } from '../theme/ThemeContext';
import type { TipoDeVehiculo } from '../theme/marca';
import { Campana } from './pantallasC2Secciones';
import {
  AVISOS_DEMO,
  CONDUCTOR_DEMO,
  CONTEXTO_DEMO,
  DESTINOS_RECIENTES_DEMO,
  JORNADA_DEMO,
  LUGARES_DEMO,
  PASAJERA_DEMO,
  TASA_DEMO,
  VIAJE_DEMO
} from './fixtures';

// ---------------------------------------------------------------------------
// Piezas compartidas
// ---------------------------------------------------------------------------

/**
 * Vehículos repartidos por el mapa. Posiciones fijas: aquí no hay GPS.
 *
 * Van todos por encima del 40 % porque con la hoja a media altura, del mapa
 * sólo se ve la mitad de arriba. Repartidos por todo el lienzo, la mitad
 * quedaban tapados — y un mapa de movilidad sin vehículos a la vista es
 * justamente lo que no se quería enseñar.
 */
const MOTOS_CERCA: readonly VehiculoEnMapa[] = [
  { clave: 'm1', tipo: 'MOTO', en: { x: 26, y: 24 }, rumbo: 24 },
  { clave: 'm2', tipo: 'MOTO', en: { x: 69, y: 15 }, rumbo: -68 },
  { clave: 'm3', tipo: 'MOTO', en: { x: 80, y: 34 }, rumbo: 155 },
  { clave: 'a1', tipo: 'AUTO', en: { x: 38, y: 38 }, rumbo: 96 }
];

const HITOS_DE_VIAJE: readonly HitoEnMapa[] = [
  { clave: 'origen', en: { x: 28, y: 43 }, tipo: 'origen' },
  { clave: 'destino', en: { x: 73, y: 13 }, tipo: 'destino' }
];

/**
 * Lo que flota sobre el mapa.
 *
 * Sube un escalón de superficie y lleva sombra. Hace falta desde que el mapa
 * pinta sus manzanas con `superficie`: con el mismo color, una pastilla encima
 * no se distingue del suelo y el texto parece escrito sobre el mapa.
 */
const SOBRE_EL_MAPA = {
  shadowColor: '#000000',
  shadowOpacity: 0.4,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 5 },
  elevation: 8
} as const;

const ORIGEN_DEMO = 'Maracaibo · punto de ejemplo';
const DESTINO_DEMO = DESTINOS_RECIENTES_DEMO[0]?.titulo ?? 'Destino de ejemplo';

/**
 * La cabecera de la pasajera: quién eres y a cómo está el dólar.
 *
 * La tasa va aquí porque en Venezuela es lo primero que se mira antes de
 * decidir un gasto, y porque el servidor ya la tiene: no es un adorno, es el
 * dato con el que la persona traduce el precio del viaje a lo que lleva encima.
 *
 * Flota en dos pastillas en lugar de una barra opaca. Una barra de cabecera se
 * come 70 puntos de mapa a cambio de enseñar dos datos.
 */
function CabeceraDePasajera() {
  const tema = useTema();

  return (
    <View style={{
      position: 'absolute',
      left: tema.ritmo.margenPantalla,
      right: tema.ritmo.margenPantalla,
      top: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10
    }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 9,
        paddingLeft: 5, paddingRight: 14, paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: tema.color.superficieElevada,
        ...SOBRE_EL_MAPA
      }}>
        <View style={{
          width: 32, height: 32, borderRadius: 16,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: tema.color.fondo
        }}>
          <Txt nivel="etiqueta">{PASAJERA_DEMO.iniciales}</Txt>
        </View>
        <View style={{ gap: 1 }}>
          <Txt nivel="etiqueta">{PASAJERA_DEMO.nombre}</Txt>
          <Txt nivel="pie" tono="tenue">{PASAJERA_DEMO.zona}</Txt>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      {/* La campana, junto a la tasa. Los avisos eran una pantalla a la que no
          llevaba nada, y existir sin puerta es no existir. */}
      <View style={{
        borderRadius: 999,
        backgroundColor: tema.color.superficieElevada,
        ...SOBRE_EL_MAPA
      }}>
        <Campana sinLeer={AVISOS_DEMO.filter(aviso => aviso.sinLeer).length} />
      </View>

    </View>
  );
}

/**
 * La fila de un lugar: un icono, un nombre y un detalle.
 *
 * Deliberadamente NO es una tarjeta. Tres destinos recientes como tres
 * rectángulos son tres bloques compitiendo; como tres filas con un separador,
 * son una lista, que es lo que son.
 */
function FilaDeLugar({ titulo, detalle, icono = 'destino', onPress }: {
  readonly titulo: string;
  readonly detalle: string;
  readonly icono?: 'destino' | 'inicio' | 'reloj';
  readonly onPress?: () => void;
}) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${detalle}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 11,
        opacity: pressed ? 0.65 : 1
      })}
    >
      <View style={{
        width: 34, height: 34, borderRadius: 17,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: tema.color.superficieElevada
      }}>
        <Icono nombre={icono} color={tema.color.textoSecundario} tamano={17} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt nivel="cuerpo">{titulo}</Txt>
        <Txt nivel="pie" tono="tenue">{detalle}</Txt>
      </View>
    </Pressable>
  );
}

/** El campo de «¿A dónde vas?», en reposo. Al tocarlo se abre la petición. */
function CampoDeDestino({ onPress }: { readonly onPress?: () => void }) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel="¿A dónde vas? Buscar destino"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingHorizontal: 15,
        height: 52,
        borderRadius: tema.radio.campo,
        backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficieHundida
      })}
    >
      <Icono nombre="destino" color={tema.color.acento} tamano={19} />
      <Txt nivel="cuerpo" tono="secundario">¿A dónde vas?</Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 1 · Arranque
// ---------------------------------------------------------------------------

export function C2Arranque() {
  return <Arranque />;
}

// ---------------------------------------------------------------------------
// 2 · Selector de rol
// ---------------------------------------------------------------------------

/**
 * «¿Cómo quieres continuar?»
 *
 * La versión anterior era correcta y de nadie: logotipo, dos filas con un
 * icono, un botón. Aquí cada opción **se ve**: quien va a conducir reconoce su
 * moto, y quien va a pedirla ve el marcador que va a mirar en el mapa. Son los
 * activos de marca haciendo de ilustración, sin encargar dibujos nuevos.
 *
 * Y hay un pie con ayuda. Ésta es la primera pantalla de la aplicación y la
 * primera donde alguien se puede quedar atascado; dejarla sin salida es
 * ahorrarse una línea a costa de quien no sabe qué elegir.
 */
export function C2SelectorDeRol() {
  const tema = useTema();
  const [rol, setRol] = useState<'pasajero' | 'conductor'>('pasajero');

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      {/* La franja de marca: un escalón de superficie que sostiene el logotipo
          y separa la identidad de la decisión. */}
      <View style={{
        paddingTop: 52,
        paddingBottom: 28,
        paddingHorizontal: tema.ritmo.margenPantalla,
        backgroundColor: tema.color.superficie,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        alignItems: 'center',
        gap: 18
      }}>
        <LogoQueEntra ancho={210} />
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Txt nivel="titulo" centrado>¿Cómo quieres continuar?</Txt>
          <Txt nivel="pie" tono="secundario" centrado>
            Puedes cambiar de modo cuando quieras.
          </Txt>
        </View>
      </View>

      <View style={{
        flex: 1,
        paddingHorizontal: tema.ritmo.margenPantalla,
        paddingTop: tema.ritmo.entreBloques,
        gap: tema.ritmo.entreElementos
      }}>
        <OpcionDeRol
          titulo="Pasajero"
          detalle="Pide tu moto y síguela en el mapa"
          activa={rol === 'pasajero'}
          onPress={() => setRol('pasajero')}
          ilustracion={<AvatarDeRol rol="pasajero" tamano={56} atenuado={rol !== 'pasajero'} />}
        />
        <OpcionDeRol
          titulo="Conductor"
          detalle="Conéctate y empieza a recibir viajes"
          activa={rol === 'conductor'}
          onPress={() => setRol('conductor')}
          ilustracion={<AvatarDeRol rol="conductor" tamano={56} atenuado={rol !== 'conductor'} />}
        />

        <View style={{ flex: 1 }} />

        <Boton titulo="Continuar" onPress={() => undefined} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="¿Necesitas ayuda para entrar? Contactar con soporte"
          style={({ pressed }) => ({
            alignItems: 'center', gap: 2,
            paddingVertical: 12,
            opacity: pressed ? 0.6 : 1
          })}
        >
          <Txt nivel="pie" tono="tenue">¿Necesitas ayuda para entrar?</Txt>
          <Txt nivel="etiqueta" tono="acento">Contactar con soporte</Txt>
        </Pressable>
      </View>
    </View>
  );
}

function OpcionDeRol({ titulo, detalle, activa, onPress, ilustracion }: {
  readonly titulo: string;
  readonly detalle: string;
  readonly activa: boolean;
  readonly onPress?: () => void;
  readonly ilustracion: ReactNode;
}) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: activa }}
      accessibilityLabel={`${titulo}. ${detalle}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        // Relleno corto y avatar de 56: la tarjeta queda en unos 80 puntos.
        // Con el avatar a 128 y relleno de 16 pasaba de 160 y las dos ocupaban
        // media pantalla para decir dos palabras.
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: activa ? tema.color.superficieElevada : tema.color.superficie,
        overflow: 'hidden'
      }}
    >
      {activa ? (
        <View style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 3, backgroundColor: tema.color.acento
        }} />
      ) : null}

      {/* Cuadrado, como las ilustraciones. Y sin fondo propio: las dos ya
          traen el suyo, negro, y meterlas en una caja de otro tono dibujaría
          un recuadro alrededor de cada una. */}
      <View style={{
        width: 56, height: 56,
        alignItems: 'center', justifyContent: 'center',
        borderRadius: tema.radio.campo,
        overflow: 'hidden'
      }}>
        {ilustracion}
      </View>

      {/* Todo el texto alineado igual y centrado con el avatar. Antes el título
          iba a la izquierda y el detalle salía centrado: dos alineaciones
          distintas dentro de la misma fila es lo que se veía mal. */}
      <View style={{ flex: 1, gap: 2, justifyContent: 'center' }}>
        <Txt nivel="encabezado">{titulo}</Txt>
        <Txt nivel="pie" tono="secundario">{detalle}</Txt>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 3 · Acceso
// ---------------------------------------------------------------------------

/**
 * El acceso, con marca de verdad.
 *
 * Antes era un formulario dentro de una tarjeta grande sobre fondo vacío:
 * correcto y de nadie. Ahora la parte de arriba es la marca —el logotipo con la
 * moto, que es lo que hay que reconocer al abrir— y los campos van sobre el
 * fondo, sin recuadro que los envuelva.
 *
 * Esto es sólo el aspecto. La pantalla real mantiene su `AuthContext`, su
 * almacenamiento seguro y el backend como única autoridad.
 */
export function C2Acceso() {
  const tema = useTema();

  return (
    <View style={{
      flex: 1,
      backgroundColor: tema.color.fondo,
      paddingHorizontal: tema.ritmo.margenPantalla,
      paddingTop: 58,
      paddingBottom: 30
    }}>
      <View style={{ alignItems: 'center', gap: 22 }}>
        <LogoQueEntra ancho={232} />
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Txt nivel="titulo">Entra a tu cuenta</Txt>
          <Txt nivel="cuerpo" tono="secundario" centrado>
            Tu moto, a un toque.
          </Txt>
        </View>
      </View>

      <View style={{ marginTop: 40, gap: tema.ritmo.entreElementos }}>
        {[
          { etiqueta: 'Correo o teléfono', valor: 'demo@ejemplo.com' },
          { etiqueta: 'Contraseña', valor: '••••••••••' }
        ].map(campo => (
          <View key={campo.etiqueta} style={{ gap: 7 }}>
            <Txt nivel="etiqueta" tono="secundario">{campo.etiqueta}</Txt>
            <View style={{
              height: 54,
              justifyContent: 'center',
              paddingHorizontal: 15,
              borderRadius: tema.radio.campo,
              backgroundColor: tema.color.superficie
            }}>
              <Txt nivel="cuerpo" tono="secundario">{campo.valor}</Txt>
            </View>
          </View>
        ))}
      </View>

      <View style={{ marginTop: tema.ritmo.entreBloques, gap: tema.ritmo.entreElementos }}>
        <Boton titulo="Entrar" onPress={() => undefined} />
        <Boton titulo="Crear una cuenta" onPress={() => undefined} variante="silencioso" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 4 · Inicio de la pasajera
// ---------------------------------------------------------------------------

/**
 * El inicio en reposo: el mapa manda y abajo hay LO JUSTO.
 *
 * A dónde vas y los sitios de siempre. Nada más.
 *
 * Antes también salían los destinos recientes y la tasa del BCV, y era
 * repetirse: al tocar el disco central se despliega la petición con esas mismas
 * dos cosas dentro. Enseñarlas dos veces no ayudaba a decidir nada y le comía
 * al mapa media pantalla que en reposo no hacía falta gastar.
 */
export function C2InicioPasajera() {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa
        vehiculos={MOTOS_CERCA}
        hitos={[{ clave: 'yo', en: { x: 47, y: 29 }, tipo: 'origen' }]}
      >
        <CabeceraDePasajera />

        {/* Se ajusta a lo que ocupa: dos elementos no necesitan media pantalla,
            y todo lo que no ocupe la hoja se lo queda el mapa. */}
        <HojaInferior estado="baja" alturaAutomatica>
          <CampoDeDestino />
          <View style={{ height: tema.ritmo.entreElementos }} />
          <LugaresGuardados lugares={LUGARES_DEMO} onNuevo={() => undefined} />
        </HojaInferior>
      </LienzoDeMapa>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="inicio"
        control={<ControlDePedido abierto={false} />}
      />
    </View>
  );
}

/**
 * La petición desplegada: lo que aparece al tocar el disco central.
 *
 * SÓLO «A DÓNDE VAS», NO «EN QUÉ VAS»
 *
 * La primera versión metía las dos decisiones en la misma hoja —trayecto y
 * elección de vehículo— y no cabían: el botón de continuar quedaba debajo de
 * la barra, que es tanto como no estar. Y al mirarlo se veía que además son
 * dos cosas distintas: primero se decide a dónde, y sólo entonces tiene
 * sentido comparar en qué ir y por cuánto.
 *
 * Así que aquí se resuelve el trayecto, y el vehículo se elige en la pantalla
 * siguiente, donde caben las opciones con su precio y su tiempo.
 */
export function C2PedirViaje() {
  const tema = useTema();
  const [beneficiario, setBeneficiario] = useState<Beneficiario>('mi');

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={MOTOS_CERCA.slice(0, 3)} conControles={false}>
        <HojaInferior estado="media" desplazable>
          <ChipDeBeneficiario
            beneficiario={beneficiario}
            onPress={() => setBeneficiario(beneficiario === 'mi' ? 'otra-persona' : 'mi')}
          />

          <View style={{ height: tema.ritmo.entreElementos }} />
          <Trayecto origen={ORIGEN_DEMO} destino={DESTINO_DEMO} />

          <View style={{ height: tema.ritmo.entreElementos }} />
          <LugaresGuardados lugares={LUGARES_DEMO} onNuevo={() => undefined} />

          {/* Lo último a donde fuiste, aquí mismo. Es lo que se busca al abrir
              esto: la mayoría de los viajes repiten sitio, y obligarlos a
              escribir la dirección otra vez es trabajo inventado. */}
          <View style={{ height: tema.ritmo.entreElementos }} />
          <Separador />
          <View style={{ paddingTop: 4 }}>
            {DESTINOS_RECIENTES_DEMO.slice(0, 2).map(destino => (
              <FilaDeLugar
                key={destino.clave}
                titulo={destino.titulo}
                detalle={destino.detalle}
                icono="reloj"
              />
            ))}
          </View>

          {/* La tasa, aquí. Es donde se decide un gasto: quien va a pedir un
              viaje traduce el precio a lo que lleva encima. En la cabecera de
              todas las pantallas era ruido que se deja de leer. */}
          <View style={{ height: tema.ritmo.entreElementos }} />
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 10, paddingHorizontal: 13,
            borderRadius: tema.radio.campo,
            backgroundColor: tema.color.superficieHundida
          }}>
            <Icono nombre="dolar" color={tema.color.textoSecundario} tamano={16} />
            <Txt nivel="etiqueta" tono="tenue">{TASA_DEMO.etiqueta}</Txt>
            <View style={{ flex: 1 }} />
            <Txt nivel="etiqueta" tono="acento">{TASA_DEMO.valor}</Txt>
          </View>

          <View style={{ height: tema.ritmo.entreElementos }} />
          <Boton titulo="Ver opciones" onPress={() => undefined} />
        </HojaInferior>
      </LienzoDeMapa>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="inicio"
        control={<ControlDePedido abierto />}
      />
    </View>
  );
}

/**
 * «¿Para quién es el viaje?»
 *
 * El selector funciona en la interfaz, pero **el backend todavía no sabe pedir
 * un viaje para un tercero**: no hay campo de beneficiario en la API ni forma
 * de avisar a quien se va a montar. El aviso lo dice en la propia pantalla,
 * porque una maqueta que enseña una función inexistente sin decirlo es una
 * promesa.
 */
export function C2ParaQuienEsElViaje() {
  const tema = useTema();
  const [beneficiario, setBeneficiario] = useState<Beneficiario>('mi');

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={MOTOS_CERCA} conControles={false}>
        <HojaInferior estado="media" alturaAutomatica>
          <View style={{ gap: tema.ritmo.entreElementos }}>
            <Txt nivel="titulo">¿Para quién es el viaje?</Txt>
            <OpcionesDeBeneficiario elegido={beneficiario} onElegir={setBeneficiario} />

            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 9,
              padding: 12,
              borderRadius: tema.radio.campo,
              backgroundColor: tema.color.fondo
            }}>
              <Icono nombre="escudo" color={tema.color.aviso} tamano={16} />
              <Txt nivel="pie" tono="tenue">
                Pedir por otra persona todavía no está conectado al servidor.
              </Txt>
            </View>

            <Boton titulo="Continuar" onPress={() => undefined} />
          </View>
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

/** Elegir un punto tocando el mapa. Aquí sólo se pinta el estado. */
export function C2ElegirPuntoPasajera() {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa eligiendoPunto vehiculos={MOTOS_CERCA} conControles={false}>
        <HojaInferior estado="baja" conAsa={false} alturaAutomatica>
          <View style={{ gap: tema.ritmo.entreElementos }}>
            <View style={{ gap: 3 }}>
              <Txt nivel="etiqueta" tono="secundario">PUNTO DE RECOGIDA</Txt>
              <Txt nivel="encabezado">Punto de ejemplo</Txt>
            </View>
            <Boton titulo="Confirmar recogida" onPress={() => undefined} />
          </View>
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 5 · Confirmar el viaje
// ---------------------------------------------------------------------------

/**
 * La última pantalla antes de pedir: qué vehículo, cuánto y con qué protección.
 *
 * Las opciones van en filas y no en tarjetas cuadradas. Con tarjetas hay que
 * comparar en dos direcciones —de lado y hacia abajo— y lo que se compara aquí
 * es una sola cosa: el precio. En filas los precios quedan alineados en una
 * columna y la comparación es un barrido vertical.
 *
 * **Los precios van a cero a propósito.** La tarifa la calcula el servidor con
 * su configuración y la tasa del BCV; poner cifras verosímiles en una maqueta
 * es la forma más fácil de que alguien las tome por reales.
 */
export function C2ConfirmarViaje() {
  const tema = useTema();
  const [vehiculo, setVehiculo] = useState<TipoDeVehiculo>('MOTO');

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={MOTOS_CERCA.slice(0, 2)} hitos={HITOS_DE_VIAJE} conRuta>
        {/* El trayecto, resumido y a la vista: se está a punto de pagar por ir
            de un sitio a otro, y esos dos sitios no pueden estar ocultos. */}
        <View style={{
          position: 'absolute',
          left: tema.ritmo.margenPantalla,
          right: tema.ritmo.margenPantalla,
          top: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          paddingHorizontal: 14, paddingVertical: 11,
          borderRadius: tema.radio.campo,
          backgroundColor: tema.color.superficieElevada,
          ...SOBRE_EL_MAPA
        }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: tema.color.textoPrimario }} />
          <Txt nivel="etiqueta" tono="secundario" numberOfLines={1}>Maracaibo</Txt>
          <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: tema.color.acento }} />
          <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: tema.color.acento }} />
          <Txt nivel="etiqueta" numberOfLines={1}>{DESTINO_DEMO}</Txt>
        </View>

        <HojaInferior estado="alta" alturaAutomatica>
          <View style={{ gap: tema.ritmo.entreElementos }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt nivel="encabezado">Elige tu vehículo</Txt>
              <View style={{ flex: 1 }} />
              <Insignia texto="4 cerca" tono="exito" />
            </View>

            <View style={{ gap: 8 }}>
              <FilaDeVehiculo
                tipo="MOTO"
                minutos={4}
                activa={vehiculo === 'MOTO'}
                onPress={() => setVehiculo('MOTO')}
              />
              <FilaDeVehiculo
                tipo="AUTO"
                minutos={7}
                activa={vehiculo === 'AUTO'}
                onPress={() => setVehiculo('AUTO')}
              />
            </View>

            <EntradaDeTransporteSeguro />

            <Separador />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt nivel="etiqueta" tono="secundario">Se calcula con la tasa del BCV</Txt>
              <View style={{ flex: 1 }} />
              <Txt nivel="pie" tono="tenue">{TASA_DEMO.valor}</Txt>
            </View>

            <Boton titulo="Pedir viaje" onPress={() => undefined} />
          </View>
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}

/** Una opción de vehículo, en fila: el vehículo, quién cabe, cuánto tarda y cuánto cuesta. */
function FilaDeVehiculo({ tipo, minutos, activa, onPress }: {
  readonly tipo: TipoDeVehiculo;
  readonly minutos: number;
  readonly activa: boolean;
  readonly onPress?: () => void;
}) {
  const tema = useTema();
  const plazas = tipo === 'MOTO' ? 1 : 4;
  const nombre = tipo === 'MOTO' ? 'Moto' : 'Auto';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: activa }}
      accessibilityLabel={`${nombre}, ${plazas} ${plazas === 1 ? 'persona' : 'personas'}, ${minutos} minutos`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
        paddingRight: 14,
        paddingLeft: 12,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: activa ? tema.color.superficieElevada : 'transparent',
        overflow: 'hidden'
      }}
    >
      {activa ? (
        <View style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 3, backgroundColor: tema.color.acento
        }} />
      ) : null}

      <Vehiculo tipo={tipo} ancho={76} atenuado={!activa} />

      <View style={{ flex: 1, gap: 2 }}>
        <Txt nivel="encabezado" tono={activa ? 'primario' : 'secundario'}>{nombre}</Txt>
        <Txt nivel="pie" tono="tenue">
          {plazas} {plazas === 1 ? 'persona' : 'personas'} · {minutos} min
        </Txt>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 1 }}>
        <Txt nivel="encabezado" tono={activa ? 'acento' : 'secundario'}>$0,00</Txt>
        <Txt nivel="pie" tono="tenue">Bs. 0,00</Txt>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Buscando
// ---------------------------------------------------------------------------

/**
 * El momento entre pedir y que alguien acepte.
 *
 * Es el rato más largo de la aplicación y donde se decide si va bien o «se
 * quedó pegada». El pulso sale de tu posición y se expande, como un sonar:
 * dice que se busca ALREDEDOR de ti, que es lo que pasa. Un círculo girando
 * diría «cargando» y podría ser cualquier aplicación.
 *
 * El mapa se atenúa para que el pulso mande, y la hoja se queda en lo mínimo:
 * qué se busca y cómo salir.
 */
export function C2BuscandoVehiculo({ tipo = 'MOTO' }: { readonly tipo?: TipoDeVehiculo }) {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={MOTOS_CERCA.slice(0, 3)} conControles={false}>
        {/* Atenuar el mapa: mientras se busca no hay nada que consultar ahí, y
            el contraste que sobra le quita fuerza al pulso. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, backgroundColor: tema.color.veloDelMapa, opacity: 0.42 }}
        />

        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: '6%', alignItems: 'center' }}
        >
          <PulsoDeBusqueda tipo={tipo} />
        </View>

        <HojaInferior estado="baja" conAsa={false} alturaAutomatica>
          <BuscandoVehiculo tipo={tipo} />
        </HojaInferior>
      </LienzoDeMapa>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="inicio"
        control={<ControlDePedido abierto />}
      />
    </View>
  );
}

export function C2BuscandoAuto() {
  return <C2BuscandoVehiculo tipo="AUTO" />;
}

// ---------------------------------------------------------------------------
// 6 y 7 · Inicio del conductor
// ---------------------------------------------------------------------------

/**
 * La jornada del conductor. El mapa manda todavía más que en la pasajera:
 * quien conduce necesita ver la calle, no un tablero.
 *
 * No hay tablero financiero. La cartera está apagada en el servidor, y el
 * resumen del día se muestra vacío con su nota.
 */
export function C2InicioConductor({ enLinea = false }: { readonly enLinea?: boolean }) {
  const tema = useTema();
  const [conectado, setConectado] = useState(enLinea);

  const mio: VehiculoEnMapa = {
    clave: 'yo', tipo: 'MOTO', en: { x: 48, y: 30 }, rumbo: 12, destacado: true
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={conectado ? [mio, ...MOTOS_CERCA.slice(0, 2)] : [mio]}>
        {/* Dónde está y si le llegan viajes, en una línea. Conectado enseña
            el punto conocido más cercano; desconectado, sólo la zona: sin
            aceptar viajes, la calle exacta no le sirve para nada. */}
        <View style={{
          position: 'absolute',
          left: tema.ritmo.margenPantalla,
          right: tema.ritmo.margenPantalla,
          top: 18,
          alignItems: 'flex-start'
        }}>
          <FranjaDeContexto
            contexto={{
              enLinea: conectado,
              zona: CONTEXTO_DEMO.zona,
              cerca: conectado ? CONTEXTO_DEMO.cerca : undefined,
              via: conectado ? CONTEXTO_DEMO.via : undefined
            }}
          />
        </View>

        {/* Conectado, la hoja se encoge a lo que ocupan las tres cifras: el
            conductor necesita calle, no panel. Desconectado crece, porque ahí
            sí hay algo que leer. */}
        {/* Compacta en los dos estados. Antes, fuera de línea ocupaba media
            pantalla para decir una frase: el conductor necesita calle, no
            panel, también mientras espera a conectarse. */}
        <HojaInferior estado="baja" conAsa={false} alturaAutomatica>
          {conectado ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {[
                { etiqueta: 'Viajes', valor: JORNADA_DEMO.viajes },
                { etiqueta: 'En ruta', valor: JORNADA_DEMO.horas },
                { etiqueta: 'Resumen', valor: JORNADA_DEMO.resumen }
              ].map((dato, indice) => (
                <View key={dato.etiqueta} style={{ flex: 1, flexDirection: 'row' }}>
                  {indice > 0 ? (
                    <View style={{ width: 1, backgroundColor: tema.color.borde, marginRight: 12 }} />
                  ) : null}
                  <View style={{ gap: 3 }}>
                    <Txt nivel="etiqueta" tono="tenue">{dato.etiqueta}</Txt>
                    <Txt nivel="encabezado">{dato.valor}</Txt>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icono nombre="moto" color={tema.color.textoSecundario} tamano={20} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt nivel="cuerpo">Listo para salir</Txt>
                <Txt nivel="pie" tono="tenue">{CONDUCTOR_DEMO.vehiculo}</Txt>
              </View>
              <Insignia texto="Verificado" tono="exito" />
            </View>
          )}
        </HojaInferior>
      </LienzoDeMapa>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_CONDUCTOR}
        activo="mapa"
        control={
          <ControlDeDisponibilidad
            enLinea={conectado}
            onAlternar={() => setConectado(valor => !valor)}
          />
        }
      />
    </View>
  );
}

/**
 * El panel de jornada, al tocar el disco del conductor.
 *
 * Una ventana pequeña, no una pantalla. Se abre en un semáforo: se mira, se
 * comprueba y se cierra. Todo lo que no quepa en ese tiempo sobra, así que los
 * datos van en dos columnas —la mitad de alto que seis filas para lo mismo— y
 * el mapa sigue viéndose por encima.
 */
export function C2PanelDeJornada() {
  const tema = useTema();

  const mio: VehiculoEnMapa = {
    clave: 'yo', tipo: 'MOTO', en: { x: 48, y: 26 }, rumbo: 12, destacado: true
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={[mio, ...MOTOS_CERCA.slice(0, 2)]} conControles={false}>
        <View style={{
          position: 'absolute',
          left: tema.ritmo.margenPantalla,
          right: tema.ritmo.margenPantalla,
          top: 18,
          alignItems: 'flex-start'
        }}>
          <FranjaDeContexto
            contexto={{
              enLinea: true,
              zona: CONTEXTO_DEMO.zona,
              cerca: CONTEXTO_DEMO.cerca,
              via: CONTEXTO_DEMO.via
            }}
          />
        </View>

        <HojaInferior estado="media" alturaAutomatica>
          <PanelDeJornada
            jornada={{
              enLinea: true,
              gpsActivo: true,
              vehiculo: CONDUCTOR_DEMO.vehiculo,
              zona: CONTEXTO_DEMO.zona,
              viajes: JORNADA_DEMO.viajes,
              tiempoEnLinea: JORNADA_DEMO.horas,
              resumen: JORNADA_DEMO.resumen
            }}
          />
        </HojaInferior>
      </LienzoDeMapa>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_CONDUCTOR}
        activo="mapa"
        control={<ControlDeDisponibilidad enLinea />}
      />
    </View>
  );
}

export function C2ConductorFueraDeLinea() {
  return <C2InicioConductor enLinea={false} />;
}

export function C2ConductorEnLinea() {
  return <C2InicioConductor enLinea />;
}

// ---------------------------------------------------------------------------
// 8 · Viaje en curso
// ---------------------------------------------------------------------------

/**
 * El viaje. La jerarquía buena de C —estado, tiempo, persona, recorrido,
 * acciones— pero sobre el mapa y dentro de una sola superficie.
 */
export function C2Viaje() {
  const tema = useTema();

  const conductorEnRuta: VehiculoEnMapa = {
    clave: 'conductor', tipo: 'MOTO', en: { x: 46, y: 30 }, rumbo: 38, destacado: true
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={[conductorEnRuta]} hitos={HITOS_DE_VIAJE} conRuta>
        <HojaInferior estado="media" conAsa>
          {/* El estado: la única zona de esta pantalla con filo. */}
          <Superficie destacada elevada>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt nivel="etiqueta" tono="secundario">ESTADO</Txt>
                <Txt nivel="encabezado">{VIAJE_DEMO.estado}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Txt nivel="etiqueta" tono="secundario">LLEGA EN</Txt>
                <Txt nivel="titulo" tono="acento">{VIAJE_DEMO.eta}</Txt>
              </View>
            </View>
          </Superficie>

          <View style={{ height: tema.ritmo.entreElementos }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: tema.color.superficieElevada
            }}>
              <Txt nivel="etiqueta">{VIAJE_DEMO.iniciales}</Txt>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt nivel="cuerpo">{VIAJE_DEMO.conductor}</Txt>
              <Txt nivel="pie" tono="tenue">{VIAJE_DEMO.vehiculo} · {VIAJE_DEMO.valoracion}</Txt>
            </View>
            {(['Llamar', 'Mensaje'] as const).map(accion => (
              <Pressable
                key={accion}
                accessibilityRole="button"
                accessibilityLabel={accion}
                style={{
                  width: 42, height: 42, borderRadius: 21,
                  alignItems: 'center', justifyContent: 'center',
                  // Hundido, no elevado. Sobre una hoja casi blanca, un círculo
                  // elevado queda a un paso del fondo y se lee como
                  // desactivado, justo cuando hay que llamar al conductor.
                  backgroundColor: tema.color.superficieHundida
                }}
              >
                <Icono
                  nombre={accion === 'Llamar' ? 'rayo' : 'viajes'}
                  color={tema.color.textoSecundario}
                  tamano={18}
                />
              </Pressable>
            ))}
          </View>

          <View style={{ height: tema.ritmo.entreElementos }} />
          <Separador />
          <View style={{ paddingTop: tema.ritmo.entreElementos, gap: 10 }}>
            {[
              { punto: tema.color.textoPrimario, texto: VIAJE_DEMO.origen },
              // `acentoTexto`: nueve puntos de amarillo de marca sobre una hoja
              // clara pierden fuerza. Los grandes —filo, disco, botón— siguen
              // con el amarillo de marca, que ahí sí manda.
              { punto: tema.color.acentoTexto, texto: VIAJE_DEMO.destino }
            ].map(parada => (
              <View key={parada.texto} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                <View style={{
                  width: 9, height: 9, borderRadius: 4.5,
                  backgroundColor: parada.punto
                }} />
                <Txt nivel="cuerpo" tono="secundario" numberOfLines={1}>{parada.texto}</Txt>
              </View>
            ))}
          </View>
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}
