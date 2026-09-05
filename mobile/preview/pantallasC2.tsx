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
import { Boton, Insignia, Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { IconoAnimado } from '../ui/IconoAnimado';
import { Arranque } from '../ui/Arranque';
import { LienzoDeMapa, type HitoEnMapa, type VehiculoEnMapa } from '../ui/Mapa';
import type { ModeloDelMapa } from '../mapa/modelo';
import { HojaInferior, Separador } from '../ui/HojaInferior';
import { useIr } from '../ui/navegar';
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
import { useEsquema, useTema } from '../theme/ThemeContext';
import { useMovimientoReducido } from '../ui/movimiento';
import { useAireDeArriba } from '../ui/seguro';
import type { TipoDeVehiculo } from '../theme/marca';
import {
  CONDUCTOR_DEMO,
  CONTEXTO_DEMO,
  DESTINOS_RECIENTES_DEMO,
  JORNADA_DEMO,
  LUGARES_DEMO,
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
 * El inicio de la pasajera vive ahora en `pantallaInicioPasajera.tsx`.
 *
 * Se fue de aquí cuando dejó de llevar mapa: pasó de ser una variante del
 * lienzo de mapa a ser una pantalla de contenido con su propia rejilla, sus
 * campañas y sus aliados, y ya no tenía nada que ver con las de al lado.
 */

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
  // Cuál está elegido. La moto por defecto: es lo que la gente pide.
  const [vehiculo, setVehiculo] = useState<TipoDeVehiculo>('MOTO');
  const [beneficiario, setBeneficiario] = useState<Beneficiario>('mi');

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={MOTOS_CERCA.slice(0, 3)} conControles={false}>
        <HojaInferior estado="media" desplazable>
          {/* La tasa comparte fila con el chip en vez de tener su propia caja.
              Es un dato de refilon —cuanto vale el dolar hoy— y no una decision
              que se tome aqui; en su propia caja pesaba lo mismo que el
              trayecto, que si lo es. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ChipDeBeneficiario
              beneficiario={beneficiario}
              onPress={() => setBeneficiario(beneficiario === 'mi' ? 'otra-persona' : 'mi')}
            />
            <View style={{ flex: 1 }} />
            <Txt nivel="etiqueta" tono="tenue">{TASA_DEMO.etiqueta}</Txt>
            <Txt nivel="etiqueta" tono="acento">{TASA_DEMO.valor}</Txt>
          </View>

          <View style={{ height: tema.ritmo.entreElementos }} />
          <Trayecto origen={ORIGEN_DEMO} destino={DESTINO_DEMO} />

          <View style={{ height: tema.ritmo.entreElementos }} />
          <LugaresGuardados lugares={LUGARES_DEMO} onNuevo={() => undefined} />

          {/* ELEGIR EL VEHÍCULO, AQUÍ MISMO
              Este sitio lo ocupaban los destinos recientes. El dueño pidió
              cambiarlos por la elección de moto o carro, y tiene sentido: a
              dónde vas ya se pregunta arriba, y en qué quieres ir es la otra
              mitad de la decisión. Verlo antes de «Ver opciones» evita entrar
              a la pantalla siguiente sólo para descubrir que hay carro.

              Son las MISMAS tarjetas que la pantalla de confirmar: no se
              estrena una forma nueva de enseñar lo mismo. */}
          <View style={{ height: tema.ritmo.entreBloques }} />
          <Txt nivel="etiqueta" tono="secundario">CÓMO QUIERES IR</Txt>
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 6 }}>
            <FilaDeVehiculo
              tipo="MOTO"
              minutos={4}
              precio={PRECIO_DE_EJEMPLO}
              activa={vehiculo === 'MOTO'}
              onPress={() => setVehiculo('MOTO')}
            />
            <FilaDeVehiculo
              tipo="AUTO"
              minutos={7}
              precio={PRECIO_DE_EJEMPLO}
              activa={vehiculo === 'AUTO'}
              onPress={() => setVehiculo('AUTO')}
            />
          </View>

          <View style={{ height: tema.ritmo.entreBloques }} />
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
            {/* «Encabezado» y no «título»: es una pregunta de dos respuestas en una
                hoja sobre el mapa, no la cabecera de una pantalla entera. */}
            <Txt nivel="encabezado" centrado accessibilityRole="header">¿Para quién es el viaje?</Txt>
            <OpcionesDeBeneficiario elegido={beneficiario} onElegir={setBeneficiario} />
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
              <Txt nivel="etiqueta" tono="secundario" centrado>PUNTO DE RECOGIDA</Txt>
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
  const arriba = useAireDeArriba();
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
          // Flota sobre el mapa, y el mapa empieza en el borde de la
          // pantalla: sin el aire del sistema, esta franja tapa la hora.
          top: 16 + arriba,
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

            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 6 }}>
              <FilaDeVehiculo
                tipo="MOTO"
                minutos={4}
                precio={PRECIO_DE_EJEMPLO}
                activa={vehiculo === 'MOTO'}
                onPress={() => setVehiculo('MOTO')}
              />
              <FilaDeVehiculo
                tipo="AUTO"
                minutos={7}
                precio={PRECIO_DE_EJEMPLO}
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
/**
 * La tarjeta de vehiculo aprobada por el dueno.
 *
 * Se EXPORTA para que la pantalla real de pedir use exactamente esta, y no una
 * copia parecida: dos formas de ensenar lo mismo acaban separandose.
 */
/**
 * El precio que ensena una tarjeta de vehiculo.
 *
 * `bolivares` va aparte y puede faltar: con el cambio apagado no hay tasa, y
 * «Bs. 0,00» al lado de un importe real seria una cifra inventada.
 */
export interface PrecioDeTarjeta {
  readonly dolares: string;
  readonly bolivares: string | null;
}

/** El hueco del recorrido de diseno. Solo ahi: es un dibujo, no un precio. */
export const PRECIO_DE_EJEMPLO: PrecioDeTarjeta = Object.freeze({ dolares: '$0,00', bolivares: 'Bs. 0,00' });

export function FilaDeVehiculo({ tipo, minutos, precio, activa, onPress }: {
  readonly tipo: TipoDeVehiculo;
  readonly precio?: PrecioDeTarjeta;
  readonly minutos?: number;
  readonly activa: boolean;
  readonly onPress?: () => void;
}) {
  const tema = useTema();
  const esquema = useEsquema();
  const esNoche = esquema === 'oscuro';
  const quieto = useMovimientoReducido();
  const plazas = tipo === 'MOTO' ? 1 : 4;
  const nombre = tipo === 'MOTO' ? 'Moto' : 'Auto';
  const subtitulo = tipo === 'MOTO' ? 'Ágil y rápido' : 'Espacioso y con A/A';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: activa }}
      accessibilityLabel={[
        nombre,
        `${plazas} ${plazas === 1 ? 'persona' : 'personas'}`,
        ...(minutos === undefined ? [] : [`${minutos} minutos`])
      ].join(', ')}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 146,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 18,
        backgroundColor: pressed
          ? tema.color.superficieElevada
          : (activa
              ? (esNoche ? '#1E1B15' : tema.color.superficieElevada)
              : (esNoche ? '#141311' : tema.color.superficie)),
        borderWidth: activa ? 1.8 : 1,
        borderColor: activa
          ? tema.color.acento
          : (esNoche ? 'rgba(245, 158, 11, 0.18)' : '#E5E7EB'),
        shadowColor: activa ? tema.color.acento : '#000000',
        shadowOpacity: activa ? (esNoche ? 0.28 : 0.15) : (esNoche ? 0.20 : 0.04),
        shadowRadius: activa ? 8 : 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: activa ? 4 : 2,
        transform: [{ scale: pressed && !quieto ? 0.975 : 1 }],
        overflow: 'hidden'
      })}
    >
      {/* Indicador de capacidad y selector */}
      <View style={{
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <View style={{
          backgroundColor: activa
            ? `${tema.color.acento}24`
            : (esNoche ? 'rgba(255, 255, 255, 0.06)' : '#F3F4F6'),
          paddingHorizontal: 7,
          paddingVertical: 2,
          borderRadius: 6
        }}>
          <Txt nivel="pie" estilo={{
            fontSize: 10,
            fontWeight: '700',
            color: activa ? tema.color.acento : tema.color.textoTenue
          }}>
            {plazas} {plazas === 1 ? 'persona' : 'personas'}
          </Txt>
        </View>

        <View style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: activa ? 0 : 1.2,
          borderColor: esNoche ? 'rgba(245, 158, 11, 0.35)' : '#D1D5DB',
          backgroundColor: activa ? tema.color.acento : 'transparent',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {activa && (
            <View style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#111827'
            }} />
          )}
        </View>
      </View>

      {/* Render del vehículo */}
      <View style={{ marginVertical: 6, alignItems: 'center', justifyContent: 'center' }}>
        <Vehiculo tipo={tipo} ancho={tipo === 'MOTO' ? 76 : 94} atenuado={!activa} />
      </View>

      {/* Información del vehículo abajo */}
      <View style={{ width: '100%', alignItems: 'center', gap: 1 }}>
        <Txt nivel="cuerpo" centrado estilo={{
          fontWeight: '800',
          fontSize: 15,
          color: activa ? (esNoche ? '#FFFFFF' : '#111827') : tema.color.textoSecundario
        }}>
          {nombre}
        </Txt>
        <Txt nivel="pie" tono="tenue" centrado estilo={{ fontSize: 10.5 }}>
          {subtitulo}
        </Txt>

        {minutos !== undefined && (
          <Txt nivel="pie" tono="acento" centrado estilo={{ fontSize: 10, fontWeight: '700', marginTop: 1 }}>
            {minutos} min
          </Txt>
        )}

        {precio !== undefined && (
          <View style={{ alignItems: 'center', marginTop: 2 }}>
            <Txt nivel="etiqueta" tono={activa ? 'acento' : 'secundario'} centrado estilo={{ fontWeight: '800', fontSize: 13 }}>
              {precio.dolares}
            </Txt>
            {precio.bolivares !== null && (
              <Txt nivel="pie" tono="tenue" centrado estilo={{ fontSize: 10 }}>
                {precio.bolivares}
              </Txt>
            )}
          </View>
        )}
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
export function C2BuscandoVehiculo({ tipo = 'MOTO', onCancelar, mapa }: {
  readonly tipo?: TipoDeVehiculo;
  /** Sin manejador el botón no hace nada, como en el recorrido de diseño. */
  readonly onCancelar?: () => void;
  readonly mapa?: ModeloDelMapa;
}) {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa vehiculos={MOTOS_CERCA.slice(0, 3)} conControles={false} modelo={mapa}>
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
          <PulsoDeBusqueda />
        </View>

        <HojaInferior estado="baja" conAsa={false} alturaAutomatica>
          <BuscandoVehiculo tipo={tipo} onCancelar={onCancelar} />
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
export function C2InicioConductor({ enLinea = false, onAlternar, modeloDelMapa, onCentrar, avisoDeUbicacion }: {
  readonly enLinea?: boolean;
  /**
   * Que pasa al tocar el disco.
   *
   * Sin manejador la pantalla se gobierna sola, como en el recorrido de
   * diseno. Con manejador manda quien lo pasa: en la aplicacion real, el
   * servidor, que es quien decide si el conductor esta en servicio.
   */
  readonly onAlternar?: () => void;
  /**
   * El mapa REAL, con la ubicacion del conductor.
   *
   * Sin esto se pinta el lienzo dibujado del recorrido de diseño, que es lo
   * que hacia la aplicacion: una cuadricula y una moto clavada al 48 % del
   * ancho. La aplicacion real pasa coordenadas y aqui se monta Google Maps.
   */
  readonly modeloDelMapa?: ModeloDelMapa;
  /** Que hace el boton de centrar. Sin esto sigue dibujado y sin accion. */
  readonly onCentrar?: () => void;
  /** Lo que hay que decirle sobre su ubicacion, ya traducido. */
  readonly avisoDeUbicacion?: ReactNode;
}) {
  const tema = useTema();
  const esquema = useEsquema();
  const esNoche = esquema === 'oscuro';
  const arriba = useAireDeArriba();
  const ir = useIr();
  const [propio, setPropio] = useState(enLinea);
  const [jornadaMinimizada, setJornadaMinimizada] = useState(false);

  // Con manejador externo el estado viene de fuera y esta pantalla no
  // guarda ninguno: dos fuentes para lo mismo acaban discrepando.
  const conectado = onAlternar === undefined ? propio : enLinea;
  const ALTO_DE_LA_BARRA = 76;

  const mio: VehiculoEnMapa = {
    clave: 'yo', tipo: 'MOTO', en: { x: 48, y: 30 }, rumbo: 12, destacado: true
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa
        modelo={modeloDelMapa}
        onCentrar={onCentrar}
        conControles={false}
        vehiculos={modeloDelMapa === undefined ? [mio] : []}
      >
        {/* Dónde está y si le llegan viajes, en una línea. Conectado enseña
            el punto conocido más cercano; desconectado, sólo la zona: sin
            aceptar viajes, la calle exacta no le sirve para nada. */}
        <View style={{
          position: 'absolute',
          left: tema.ritmo.margenPantalla,
          right: tema.ritmo.margenPantalla + 58,
          top: 18 + arriba,
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
          {avisoDeUbicacion}
        </View>

        {/* Controles superiores derechos:
            Arriba la campanita de notificaciones del teléfono, y debajo el botón de rastrear ubicación.
            Ambos circulares, superficie blanca con sombra, e icono amarillo en el centro. */}
        <View style={{
          position: 'absolute',
          right: 14,
          top: 18 + arriba,
          gap: 10,
          alignItems: 'center',
          zIndex: 20
        }}>
          {/* Campanita de notificaciones / avisos */}
          <Pressable
            onPress={() => ir('avisos')}
            accessibilityRole="button"
            accessibilityLabel="Notificaciones y avisos"
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: 'rgba(0, 0, 0, 0.08)',
              shadowColor: '#000000',
              shadowOpacity: 0.22,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
              opacity: pressed ? 0.85 : 1
            })}
          >
            <IconoAnimado
              nombre="campana"
              color="#FACC15"
              tamano={22}
            />
          </Pressable>

          {/* Rastrear / centrar ubicación (debajo de la campanita) */}
          <Pressable
            onPress={onCentrar}
            accessibilityRole="button"
            accessibilityLabel="Centrar y rastrear mi ubicación"
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: 'rgba(0, 0, 0, 0.08)',
              shadowColor: '#000000',
              shadowOpacity: 0.22,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
              opacity: pressed ? 0.85 : 1
            })}
          >
            <IconoAnimado
              nombre="destino"
              color="#FACC15"
              tamano={21}
              variante="elevar"
            />
          </Pressable>
        </View>

        {/* Resumen de jornada en servicio: métricas relevantes del día
            en paleta estricta grafito/amarillo/blanco/negro y minimizable al 100%. */}
        {conectado && !jornadaMinimizada ? (
          <HojaInferior
            estado="baja"
            conAsa={false}
            alturaAutomatica
            espacioInferior={ALTO_DE_LA_BARRA}
          >
            <View style={{ gap: 8, paddingBottom: 2 }}>
              {/* Cabecera interactiva sobria en grafito y amarillo corporativo */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{
                    width: 7, height: 7, borderRadius: 4,
                    backgroundColor: '#FACC15'
                  }} />
                  <Txt nivel="etiqueta" tono="tenue" estilo={{ fontWeight: '700', fontSize: 11, letterSpacing: 0.8 }}>
                    TURNO ACTIVO
                  </Txt>
                </View>

                <Pressable
                  onPress={() => setJornadaMinimizada(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Minimizar resumen de jornada"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingVertical: 3,
                    paddingHorizontal: 9,
                    borderRadius: 999,
                    backgroundColor: pressed
                      ? (esNoche ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)')
                      : (esNoche ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'),
                    borderWidth: 1,
                    borderColor: tema.color.borde
                  })}
                >
                  <Txt nivel="pie" tono="tenue" estilo={{ fontWeight: '600', fontSize: 11 }}>
                    Minimizar
                  </Txt>
                  <IconoAnimado nombre="flecha-abajo" color={tema.color.textoSecundario} tamano={11} />
                </Pressable>
              </View>

              {/* Fila 1 de métricas: Ganado hoy y Viajes hoy */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{
                  flex: 1,
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: esNoche ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                  borderWidth: 1,
                  borderColor: esNoche ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  gap: 3
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{
                      width: 20, height: 20, borderRadius: 5,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: esNoche ? 'rgba(250, 204, 21, 0.12)' : 'rgba(250, 204, 21, 0.18)'
                    }}>
                      <IconoAnimado nombre="dolar" color="#FACC15" tamano={12} />
                    </View>
                    <Txt nivel="pie" tono="tenue" numberOfLines={1} estilo={{ fontSize: 11 }}>
                      Ganado hoy
                    </Txt>
                  </View>
                  <Txt nivel="cuerpo" estilo={{ fontWeight: '800', fontSize: 16, color: tema.color.textoPrimario } as never}>
                    $0,00
                  </Txt>
                </View>

                <View style={{
                  flex: 1,
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: esNoche ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                  borderWidth: 1,
                  borderColor: esNoche ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  gap: 3
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{
                      width: 20, height: 20, borderRadius: 5,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: esNoche ? 'rgba(250, 204, 21, 0.12)' : 'rgba(250, 204, 21, 0.18)'
                    }}>
                      <IconoAnimado nombre="moto" color="#FACC15" tamano={12} />
                    </View>
                    <Txt nivel="pie" tono="tenue" numberOfLines={1} estilo={{ fontSize: 11 }}>
                      Viajes hoy
                    </Txt>
                  </View>
                  <Txt nivel="cuerpo" estilo={{ fontWeight: '800', fontSize: 16, color: tema.color.textoPrimario } as never}>
                    {JORNADA_DEMO.viajes}
                  </Txt>
                </View>
              </View>

              {/* Fila 2 de métricas: En ruta y Aceptación */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{
                  flex: 1,
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: esNoche ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                  borderWidth: 1,
                  borderColor: esNoche ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  gap: 3
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{
                      width: 20, height: 20, borderRadius: 5,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: esNoche ? 'rgba(250, 204, 21, 0.12)' : 'rgba(250, 204, 21, 0.18)'
                    }}>
                      <IconoAnimado nombre="reloj" color="#FACC15" tamano={12} />
                    </View>
                    <Txt nivel="pie" tono="tenue" numberOfLines={1} estilo={{ fontSize: 11 }}>
                      En ruta
                    </Txt>
                  </View>
                  <Txt nivel="cuerpo" estilo={{ fontWeight: '800', fontSize: 16, color: tema.color.textoPrimario } as never}>
                    {JORNADA_DEMO.horas}
                  </Txt>
                </View>

                <View style={{
                  flex: 1,
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: esNoche ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                  borderWidth: 1,
                  borderColor: esNoche ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  gap: 3
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{
                      width: 20, height: 20, borderRadius: 5,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: esNoche ? 'rgba(250, 204, 21, 0.12)' : 'rgba(250, 204, 21, 0.18)'
                    }}>
                      <IconoAnimado nombre="escudo" color="#FACC15" tamano={12} />
                    </View>
                    <Txt nivel="pie" tono="tenue" numberOfLines={1} estilo={{ fontSize: 11 }}>
                      Aceptación
                    </Txt>
                  </View>
                  <Txt nivel="cuerpo" estilo={{ fontWeight: '800', fontSize: 16, color: tema.color.textoPrimario } as never}>
                    100%
                  </Txt>
                </View>
              </View>
            </View>
          </HojaInferior>
        ) : null}

        {/* Al minimizar, la tarjeta desaparece completamente y sólo queda
            el botón de maximizar al ladito de la barra */}
        {conectado && jornadaMinimizada ? (
          <Pressable
            onPress={() => setJornadaMinimizada(false)}
            accessibilityRole="button"
            accessibilityLabel="Maximizar métricas de jornada"
            style={({ pressed }) => ({
              position: 'absolute',
              bottom: ALTO_DE_LA_BARRA + 12,
              right: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 20,
              backgroundColor: esNoche ? '#181A1E' : '#FFFFFF',
              borderWidth: 1,
              borderColor: esNoche ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.10)',
              shadowColor: '#000000',
              shadowOpacity: 0.25,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: 6,
              opacity: pressed ? 0.85 : 1
            })}
          >
            <View style={{
              width: 18, height: 18, borderRadius: 5,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: esNoche ? 'rgba(250, 204, 21, 0.15)' : 'rgba(250, 204, 21, 0.22)'
            }}>
              <IconoAnimado nombre="flecha-arriba" color="#FACC15" tamano={11} />
            </View>
            <Txt nivel="pie" estilo={{ fontWeight: '700', fontSize: 12, color: tema.color.textoPrimario } as never}>
              Métricas
            </Txt>
          </Pressable>
        ) : null}
      </LienzoDeMapa>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_CONDUCTOR}
        activo="mapa"
        control={
          <ControlDeDisponibilidad
            enLinea={conectado}
            onAlternar={onAlternar ?? (() => setPropio(valor => !valor))}
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
  const arriba = useAireDeArriba();

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
          top: 18 + arriba,
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
/**
 * Lo que esta pantalla necesita para pintarse.
 *
 * Textos ya resueltos: aquí no llega ningún estado del backend ni ningún alias
 * histórico. La traducción vive en `domain/superficieDelViaje.ts`.
 */
export interface DatosDelViajeEnCurso {
  readonly estado: string;
  /** Lo que va donde el diseño pone «llega en 4 min». `null` si no hay nada. */
  readonly aclaracion: string | null;
  readonly conductor: string;
  readonly iniciales: string;
  readonly vehiculo: string;
  readonly valoracion: string | null;
  readonly origen: string;
  readonly destino: string;
}

const VIAJE_DE_EJEMPLO: DatosDelViajeEnCurso = {
  estado: VIAJE_DEMO.estado,
  aclaracion: VIAJE_DEMO.eta,
  conductor: VIAJE_DEMO.conductor,
  iniciales: VIAJE_DEMO.iniciales,
  vehiculo: VIAJE_DEMO.vehiculo,
  valoracion: VIAJE_DEMO.valoracion,
  origen: VIAJE_DEMO.origen,
  destino: VIAJE_DEMO.destino
};

const VIAJE_EN_BLANCO: DatosDelViajeEnCurso = {
  estado: '', aclaracion: null, conductor: '', iniciales: '',
  vehiculo: '', valoracion: null, origen: '', destino: ''
};

/** `true` sólo cuando Metro sirve la aplicación. En release, `false`. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

export function C2Viaje({ datos, mapa, onCentrar, onMensaje }: {
  readonly datos?: DatosDelViajeEnCurso;
  /** Con modelo se pinta Google; sin él, el lienzo dibujado del recorrido. */
  readonly mapa?: ModeloDelMapa;
  /** Qué hace el botón de centrar, que ya estaba dibujado en esta pantalla. */
  readonly onCentrar?: () => void;
  /**
   * Qué hace el botón de mensaje, que también estaba dibujado y sin conectar.
   * En el recorrido de diseño no viene, y el botón se pinta igual: ahí no hay a
   * quién escribir.
   */
  readonly onMensaje?: () => void;
} = {}) {
  const tema = useTema();
  const viaje = datos ?? (EN_DESARROLLO ? VIAJE_DE_EJEMPLO : VIAJE_EN_BLANCO);

  const conductorEnRuta: VehiculoEnMapa = {
    clave: 'conductor', tipo: 'MOTO', en: { x: 46, y: 30 }, rumbo: 38, destacado: true
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa
        vehiculos={[conductorEnRuta]}
        hitos={HITOS_DE_VIAJE}
        conRuta
        modelo={mapa}
        onCentrar={onCentrar}
      >
        {/* La hoja se ajusta a lo que ocupa.
            Estaba en «media» con cada bloque separado por dieciséis puntos, y en
            un viaje se mira UNA cosa —cuánto falta— y de refilón quién viene.
            Apretada, el mapa gana casi doscientos puntos. */}
        <HojaInferior estado="baja" conAsa alturaAutomatica>
          <View style={{ gap: 13 }}>
            {/* Estado y llegada en UNA línea. En su tarjeta con filo pesaban lo
                mismo que todo lo demás junto. */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9 }}>
              <Txt nivel="encabezado">{viaje.estado}</Txt>
              <View style={{ flex: 1 }} />
              {/* El hueco de la derecha.
                  Con el ejemplo lleva «4 min»; con datos reales lleva la
                  aclaración del estado —en ARRIVED, que ya llegó— o NADA: el
                  backend no calcula tiempo de llegada, y poner ahí la duración
                  estimada del viaje sería un número que no significa lo que
                  parece. */}
              {viaje.aclaracion !== null ? (
                <Txt nivel="pie" tono="tenue" numberOfLines={1}>{viaje.aclaracion}</Txt>
              ) : null}
            </View>

            <Separador />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 20,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: tema.color.superficieElevada
              }}>
                <Txt nivel="etiqueta">{viaje.iniciales}</Txt>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Txt nivel="cuerpo">{viaje.conductor}</Txt>
                {/* La valoración sólo si existe: un conductor recién aprobado no
                    tiene, y un «· 0,0» al lado de su nombre lo calumnia. */}
                <Txt nivel="pie" tono="tenue" numberOfLines={1}>
                  {viaje.valoracion === null ? viaje.vehiculo : `${viaje.vehiculo} · ${viaje.valoracion}`}
                </Txt>
              </View>
              {(['Llamar', 'Mensaje'] as const).map(accion => (
                <Pressable
                  key={accion}
                  accessibilityRole="button"
                  accessibilityLabel={accion}
                  testID={accion === 'Mensaje' ? 'abrir-chat' : undefined}
                  // Sólo «Mensaje» hace algo: es el acceso a la conversación
                  // del viaje. «Llamar» sigue dibujado y sin conectar, como
                  // estaba: el teléfono tiene su propia política y su fase.
                  onPress={accion === 'Mensaje' ? onMensaje : undefined}
                  disabled={accion === 'Mensaje' ? onMensaje === undefined : true}
                  style={{
                    width: 38, height: 38, borderRadius: 19,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: tema.color.superficieHundida
                  }}
                >
                  <Icono
                    nombre={accion === 'Llamar' ? 'rayo' : 'viajes'}
                    color={tema.color.textoSecundario}
                    tamano={17}
                  />
                </Pressable>
              ))}
            </View>

            <View style={{ gap: 7 }}>
              {[
                { punto: tema.color.textoPrimario, texto: viaje.origen },
                { punto: tema.color.acento, texto: viaje.destino }
              ].map(parada => (
                <View key={parada.texto} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: parada.punto }} />
                  <Txt nivel="pie" tono="secundario" numberOfLines={1}>{parada.texto}</Txt>
                </View>
              ))}
            </View>

            {/* LA SALIDA DE EMERGENCIA, DURANTE EL VIAJE
                Vivía sólo en la pestaña de Viaje seguro, que ya no está en la
                barra. Aquí está mejor de lo que estaba: en pleno viaje ya no hay
                que salirse a buscarla.

                Con etiqueta y no sólo el icono: un círculo rojo al lado de los de
                llamar y escribir se pulsa sin querer, y una falsa alarma le
                cuesta a alguien salir corriendo. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Emergencia. Pedir ayuda ahora"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                paddingVertical: 11,
                borderRadius: tema.radio.boton,
                borderWidth: 1,
                borderColor: tema.color.peligro,
                backgroundColor: pressed ? `${tema.color.peligro}26` : `${tema.color.peligro}14`
              })}
            >
              <Icono nombre="escudo" color={tema.color.peligro} tamano={17} />
              <Txt nivel="etiqueta" tono="peligro">Emergencia</Txt>
            </Pressable>
          </View>
        </HojaInferior>
      </LienzoDeMapa>
    </View>
  );
}
