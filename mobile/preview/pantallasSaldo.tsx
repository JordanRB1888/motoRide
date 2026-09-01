/**
 * El saldo, en los dos roles.
 *
 * LA CABECERA VA A SANGRE, Y NO ES UN CAPRICHO
 *
 * No es una tarjeta. Una tarjeta con márgenes alrededor dice «esto es un
 * elemento más de la pantalla», y aquí el saldo ES la pantalla: se entra a
 * mirar cuánto hay. Ocupa el ancho completo, llega hasta arriba del todo y no
 * lleva bordes que la separen de nada.
 *
 * Va en amarillo de marca con el texto en grafito. Es el único sitio de la
 * aplicación donde el amarillo cubre una superficie grande, y justo por eso
 * funciona: si estuviera en cinco pantallas dejaría de significar nada. El
 * contraste sale igual en día y en noche porque el amarillo es el mismo en los
 * dos esquemas y el grafito también.
 *
 * Lo de debajo SÍ son tarjetas, con su borde y su separación. Ahí la jerarquía
 * es la contraria: son bloques que se consultan, no el motivo de la visita.
 *
 * TODAS LAS CIFRAS A CERO
 *
 * La cartera no está encendida en el servidor. Un importe creíble aquí acaba
 * citado como si fuera el saldo real de alguien, y una pantalla que se llama
 * «Saldo disponible» es el peor sitio para que un número de ejemplo se confunda
 * con dinero. Hay pruebas que lo comprueban en los dos roles.
 */

import { Pressable, ScrollView, View } from 'react-native';
import { Txt } from '../ui/componentes';
import { Icono, type NombreDeIcono } from '../ui/Icono';
import {
  BarraDeNavegacion,
  ControlDeDisponibilidad,
  ControlDePedido,
  DESTINOS_DE_CONDUCTOR,
  DESTINOS_DE_PASAJERA
} from '../ui/Navegacion';
import { useTema } from '../theme/ThemeContext';
import {
  GANANCIAS_DEMO,
  MOVIMIENTOS_DEMO,
  MOVIMIENTOS_PASAJERA_DEMO,
  SALDO_DEMO
} from './fixtures';

type Saldo = (typeof SALDO_DEMO)[keyof typeof SALDO_DEMO];
type Movimiento = (typeof MOVIMIENTOS_DEMO)[number] | (typeof MOVIMIENTOS_PASAJERA_DEMO)[number];

// ---------------------------------------------------------------------------
// La cabecera
// ---------------------------------------------------------------------------

export interface Accion {
  readonly texto: string;
  readonly icono: NombreDeIcono;
  readonly principal?: boolean;
}

/**
 * LA BANDA AMARILLA, A SANGRE
 *
 * El patrón que abre las pantallas con un SUJETO: tu saldo, un comercio
 * concreto. No una tarjeta —una tarjeta con márgenes dice «esto es un elemento
 * más»— sino una banda de borde a borde, sin nada que la separe de arriba.
 *
 * DÓNDE SÍ Y DÓNDE NO
 *
 * El amarillo pleno funciona PORQUE ES RARO. En una pantalla de cada cinco
 * señala; en todas, deja de señalar. El criterio no es «queda bien» sino: va
 * donde hay algo o alguien concreto que presentar, y no en una lista —el
 * historial, los avisos— donde no hay sujeto.
 */
export function CabeceraAmarilla({ children }: { readonly children: React.ReactNode }) {
  const tema = useTema();

  return (
    <View style={{
      backgroundColor: tema.color.acento,
      paddingHorizontal: tema.ritmo.margenPantalla,
      paddingTop: 22,
      paddingBottom: 26,
      overflow: 'hidden'
    }}>
      {/* Dos discos claros que se salen por la esquina. Sin ellos, un
          rectángulo amarillo de este tamaño se lee como un error de relleno. */}
      <View style={{
        position: 'absolute', right: -70, top: -70,
        width: 220, height: 220, borderRadius: 110,
        backgroundColor: 'rgba(255,255,255,0.16)'
      }} />
      <View style={{
        position: 'absolute', right: -30, bottom: -90,
        width: 180, height: 180, borderRadius: 90,
        backgroundColor: 'rgba(255,255,255,0.10)'
      }} />
      <View style={{ gap: 13 }}>{children}</View>
    </View>
  );
}

function CabeceraDeSaldo({ dato, acciones }: {
  readonly dato: Saldo;
  readonly acciones: readonly Accion[];
}) {
  const tema = useTema();

  return (
    <CabeceraAmarilla>
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt nivel="etiqueta" tono="sobreAcento" estilo={{ opacity: 0.78 }}>
            {dato.rotulo.toUpperCase()}
          </Txt>
          <View style={{ flex: 1 }} />
          <Icono nombre="escudo" color={tema.color.sobreAcento} tamano={15} />
          <Txt nivel="pie" tono="sobreAcento" estilo={{ opacity: 0.78 }}>
            Transacción segura
          </Txt>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7 }}>
          <Txt nivel="display" tono="sobreAcento">{dato.importe}</Txt>
          <Txt nivel="cuerpo" tono="sobreAcento" estilo={{ opacity: 0.72, paddingBottom: 6 }}>
            {dato.moneda}
          </Txt>
          <View style={{ flex: 1 }} />
          <Txt nivel="etiqueta" tono="sobreAcento" estilo={{ opacity: 0.78, paddingBottom: 8 }}>
            {dato.recuento}
          </Txt>
        </View>

        <Txt nivel="pie" tono="sobreAcento" estilo={{ opacity: 0.78 }}>
          {dato.equivalente} · tasa referencial del BCV
        </Txt>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 3 }}>
          {acciones.map(accion => (
            <BotonDeSaldo key={accion.texto} accion={accion} />
          ))}
        </View>
      </>
    </CabeceraAmarilla>
  );
}

/** Sobre amarillo, el grafito es el que manda: es él quien contrasta. */
export function BotonDeSaldo({ accion }: { readonly accion: Accion }) {
  const tema = useTema();
  const relleno = accion.principal === true;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accion.texto}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 13,
        paddingHorizontal: 10,
        borderRadius: tema.radio.boton,
        backgroundColor: relleno ? tema.color.sobreAcento : 'transparent',
        borderWidth: 1.5,
        borderColor: tema.color.sobreAcento
      }}
    >
      <Icono
        nombre={accion.icono}
        color={relleno ? tema.color.acento : tema.color.sobreAcento}
        tamano={17}
      />
      <Txt nivel="etiqueta" tono={relleno ? 'acento' : 'sobreAcento'} numberOfLines={1}>
        {accion.texto}
      </Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Lo de debajo
// ---------------------------------------------------------------------------

/**
 * Una BANDA, no una tarjeta.
 *
 * Va de borde a borde, como la cabecera amarilla. Una tarjeta con márgenes a
 * los lados flota, y tres tarjetas flotando en una pantalla estrecha se leen
 * como tres islas: mucho borde, mucha esquina y el contenido encogido en medio.
 *
 * A sangre, cada sección ocupa el ancho entero y lo que las separa es el fondo
 * de la pantalla asomando entre ellas. Se ganan dos márgenes de contenido, que
 * en un gráfico de siete barras se nota.
 */
function Banda({ titulo, detalle, icono, children }: {
  readonly titulo: string;
  readonly detalle?: string;
  readonly icono: NombreDeIcono;
  readonly children: React.ReactNode;
}) {
  const tema = useTema();

  return (
    <View style={{
      // `superficieElevada` y no `superficie`: en noche los dos se distinguen
      // del fondo, pero en día fondo y superficie están a SEIS puntos de
      // luminancia y las bandas desaparecían. Elevada es blanco puro en día
      // —que sí destaca sobre el gris del fondo— y un grafito más alto en
      // noche, donde además define mejor cada sección.
      backgroundColor: tema.color.superficieElevada,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: tema.color.borde,
      paddingVertical: tema.ritmo.dentroDeTarjeta,
      paddingHorizontal: tema.ritmo.margenPantalla,
      gap: tema.ritmo.entreElementos
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11 }}>
        <View style={{
          width: 34, height: 34, borderRadius: 10,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: `${tema.color.acento}26`
        }}>
          <Icono nombre={icono} color={tema.color.acentoTexto} tamano={18} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt nivel="encabezado">{titulo}</Txt>
          {detalle === undefined ? null : <Txt nivel="pie" tono="tenue">{detalle}</Txt>}
        </View>
      </View>
      {children}
    </View>
  );
}

/**
 * Lo ganado por día.
 *
 * Barras y no una línea: son siete valores sueltos que se comparan entre sí, no
 * una serie continua. Cada una lleva su importe encima, porque el alto sólo
 * dice «más o menos que el de al lado» y aquí hace falta saber cuánto.
 */
function GraficoDeGanancias() {
  const tema = useTema();

  return (
    <>
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
        height: 150,
        paddingTop: 18
      }}>
        {GANANCIAS_DEMO.dias.map(dia => (
          <View
            key={dia.clave}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 7, height: '100%' }}
          >
            <Txt nivel="pie" tono="tenue">{dia.importe}</Txt>
            <View style={{
              width: '100%',
              height: `${Math.max(dia.altura * 100, 3)}%`,
              borderTopLeftRadius: 5,
              borderTopRightRadius: 5,
              borderBottomLeftRadius: 2,
              borderBottomRightRadius: 2,
              backgroundColor: dia.altura > 0.5 ? tema.color.acento : `${tema.color.acento}8c`
            }} />
            <Txt nivel="pie" tono="tenue">{dia.etiqueta}</Txt>
          </View>
        ))}
      </View>
      <Txt nivel="pie" tono="tenue">{GANANCIAS_DEMO.nota}</Txt>
    </>
  );
}

/**
 * Qué glifo lleva cada movimiento.
 *
 * La moto vale para un viaje; para una recarga o una liquidación no dice nada.
 * De los doce iconos que hay, estos son los que menos mienten.
 */
const GLIFO_DE_MOVIMIENTO: Record<string, NombreDeIcono> = {
  GANANCIA: 'moto',
  PAGO: 'moto',
  COMISION: 'dolar',
  RECARGA: 'rayo',
  LIQUIDACION: 'maletin',
  DEVOLUCION: 'reloj'
};

function FilaDeMovimiento({ mov, primero }: {
  readonly mov: Movimiento;
  readonly primero: boolean;
}) {
  const tema = useTema();
  const comision = mov.tipo === 'COMISION';
  const sale = mov.importe.startsWith('−');

  return (
    <View>
      {primero ? null : <View style={{ height: 1, backgroundColor: tema.color.borde }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: comision ? `${tema.color.peligro}1f` : tema.color.superficieElevada
        }}>
          <Icono
            nombre={GLIFO_DE_MOVIMIENTO[mov.tipo] ?? 'dolar'}
            color={comision ? tema.color.peligro : tema.color.textoSecundario}
            tamano={18}
          />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt nivel="cuerpo">{mov.titulo}</Txt>
          <Txt nivel="pie" tono="tenue" numberOfLines={1}>{mov.detalle}</Txt>
          <Txt nivel="pie" tono="tenue">{mov.cuando}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Txt nivel="cuerpo" tono={sale ? 'secundario' : 'exito'}>{mov.importe}</Txt>
          <Txt nivel="pie" tono="tenue">{mov.estado}</Txt>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Las pantallas
// ---------------------------------------------------------------------------

export function C2SaldoPasajera() {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <CabeceraDeSaldo
          dato={SALDO_DEMO.pasajera}
          acciones={[
            { texto: 'Datos de pago', icono: 'perfil' },
            { texto: 'Registrar recarga', icono: 'rayo', principal: true }
          ]}
        />

        <View style={{ paddingBottom: tema.ritmo.entreBloques, gap: tema.ritmo.entreElementos }}>
          <Banda
            titulo="Movimientos"
            detalle={`${MOVIMIENTOS_PASAJERA_DEMO.length} registros`}
            icono="reloj"
          >
            <View>
              {MOVIMIENTOS_PASAJERA_DEMO.map((mov, indice) => (
                <FilaDeMovimiento key={mov.clave} mov={mov} primero={indice === 0} />
              ))}
            </View>
          </Banda>

          <Banda titulo="Cómo se paga un viaje" icono="escudo">
            <Txt nivel="cuerpo" tono="secundario">
              Puedes pagar en efectivo al conductor o con tu saldo. Recargas por Pago
              Móvil y el importe queda disponible al verificarse.
            </Txt>
          </Banda>

          <View style={{
            flexDirection: 'row',
            gap: 10,
            paddingVertical: 14,
            paddingHorizontal: tema.ritmo.margenPantalla
          }}>
            <Icono nombre="rayo" color={tema.color.aviso} tamano={17} />
            <View style={{ flex: 1 }}>
              <Txt nivel="pie" tono="tenue">{SALDO_DEMO.pasajera.nota}</Txt>
            </View>
          </View>
        </View>
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="saldo"
        control={<ControlDePedido abierto={false} />}
      />
    </View>
  );
}

export function C2SaldoConductor() {
  const tema = useTema();

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <CabeceraDeSaldo
          dato={SALDO_DEMO.conductor}
          acciones={[
            { texto: 'Solicitar liquidación', icono: 'dolar' },
            { texto: 'Recargar saldo', icono: 'rayo', principal: true }
          ]}
        />

        <View style={{ paddingBottom: tema.ritmo.entreBloques, gap: tema.ritmo.entreElementos }}>
          <Banda
            titulo={GANANCIAS_DEMO.titulo}
            detalle={GANANCIAS_DEMO.detalle}
            icono="viajes"
          >
            <GraficoDeGanancias />
          </Banda>

          <Banda titulo="Cómo se reparte cada viaje" icono="escudo">
            <Txt nivel="cuerpo" tono="secundario">
              Tu parte se acredita y la comisión se descuenta de esta cuenta. El
              porcentaje lo fija +58express en su configuración.
            </Txt>
          </Banda>

          <Banda
            titulo="Movimientos de la cuenta"
            detalle={`${MOVIMIENTOS_DEMO.length} registros`}
            icono="reloj"
          >
            <View>
              {MOVIMIENTOS_DEMO.map((mov, indice) => (
                <FilaDeMovimiento key={mov.clave} mov={mov} primero={indice === 0} />
              ))}
            </View>
          </Banda>
        </View>
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_CONDUCTOR}
        activo="saldo"
        control={<ControlDeDisponibilidad enLinea onAlternar={() => undefined} />}
      />
    </View>
  );
}
