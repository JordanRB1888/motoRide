/**
 * El registro completo de un viaje.
 *
 * POR QUÉ EXISTE ESTA PANTALLA
 *
 * El historial decía de dónde a dónde y si terminó bien. Eso sirve para
 * acordarse, pero el historial no se abre para acordarse: se abre para
 * RECLAMAR. Me cobraron de más, el conductor nunca llegó, dijimos una cosa por
 * el chat y pasó otra.
 *
 * Para eso hace falta todo lo que hay aquí, y por ese orden: qué pasó y a qué
 * hora, quién conducía, qué se cobró, y la conversación entera. Sin eso, un
 * reclamo es la palabra de uno contra la del otro y soporte no puede hacer
 * nada más que creer a alguien.
 *
 * EL ORDEN ES EL DE LAS PREGUNTAS, NO EL DE LOS DATOS
 *
 * Primero la cronología, porque casi todos los reclamos son sobre TIEMPOS —no
 * llegó, tardó, me cobraron la espera—. Después quién, después cuánto, y la
 * conversación al final: es lo más largo de leer y lo que menos veces se
 * necesita, pero cuando se necesita decide el caso.
 *
 * Y el botón de reclamar va abajo del todo, cuando ya has visto lo que pasó.
 * Arriba invitaría a reclamar antes de mirar.
 *
 * LOS VIAJES CANCELADOS TAMBIÉN
 *
 * El encargo hablaba de los completados, pero el registro se guarda igual para
 * los cancelados, y no por simetría: un viaje cancelado es el que MÁS reclamos
 * genera. Los pasos que no llegaron a ocurrir se pintan apagados en vez de
 * desaparecer, porque que falten dice tanto como que estén.
 */

import { Pressable, ScrollView, View } from 'react-native';
import { Boton, Insignia, Txt } from '../ui/componentes';
import { Icono, type NombreDeIcono } from '../ui/Icono';
import {
  BarraDeNavegacion,
  ControlDePedido,
  DESTINOS_DE_PASAJERA
} from '../ui/Navegacion';
import { useTema } from '../theme/ThemeContext';
import { useIr } from '../ui/navegar';
import { CabeceraAmarilla } from './pantallasSaldo';
import {
  CONSERVACION_DEMO,
  detalleDeViaje,
  type DetalleDeViaje,
  type HitoDeViaje,
  type MensajeDeViaje
} from './fixtures';

const ALTO_DE_LA_BARRA = 76;

export function C2DetalleDeViaje({ clave = 'h1' }: { readonly clave?: string }) {
  const tema = useTema();
  const ir = useIr();
  const dato = detalleDeViaje(clave);

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tema.ritmo.entreBloques + ALTO_DE_LA_BARRA }}
      >
        <Cabecera dato={dato} onVolver={() => ir('historial')} />

        <Banda titulo="Qué pasó y a qué hora" icono="reloj">
          <Cronologia hitos={dato.hitos} />
          {dato.estado === 'Completado' ? (
            <View style={{ flexDirection: 'row', gap: tema.ritmo.entreElementos }}>
              <Cifra rotulo="Duración" valor={dato.duracion} />
              <Cifra rotulo="Espera" valor={dato.espera} />
            </View>
          ) : null}
        </Banda>

        <Banda titulo="Quién te llevó" icono="moto">
          <Dato rotulo="Conductor" valor={dato.conductor.nombre} />
          <Dato rotulo="Vehículo" valor={dato.conductor.vehiculo} />
          <Dato rotulo="Placa" valor={dato.conductor.placa} />
        </Banda>

        <Banda titulo="Qué se cobró" icono="dolar">
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Txt nivel="titulo">{dato.cobro.total}</Txt>
            <Txt nivel="pie" tono="secundario">{dato.cobro.metodo}</Txt>
          </View>
          {dato.cobro.desglose.map(linea => (
            <Dato key={linea.concepto} rotulo={linea.concepto} valor={linea.importe} />
          ))}
          <Txt nivel="pie" tono="tenue">Los importes los calcula el servidor.</Txt>
        </Banda>

        <Banda titulo="La conversación" icono="mensaje">
          {dato.conversacion.map(mensaje => (
            <Burbuja key={mensaje.clave} mensaje={mensaje} />
          ))}

          {/* El aviso va con la conversación, no en una pantalla de condiciones
              que nadie abre: quien lee lo que escribió merece saber ahí mismo
              quién más puede leerlo. */}
          <View style={{ gap: 4, marginTop: tema.ritmo.entreElementos }}>
            <Txt nivel="pie" tono="tenue">{CONSERVACION_DEMO.aviso}</Txt>
            <Txt nivel="pie" tono="acento">{CONSERVACION_DEMO.pendiente}</Txt>
          </View>
        </Banda>

        <Banda titulo="¿Algo no cuadró?" icono="escudo" detalle={`Referencia ${dato.referencia}`}>
          <Txt nivel="cuerpo" tono="secundario">
            Soporte ve este mismo registro. Dales la referencia y no hay que
            reconstruir nada.
          </Txt>
          <Boton titulo="Reportar un problema" variante="secundario" onPress={() => ir('ayuda')} />
        </Banda>
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_PASAJERA}
        activo="historial"
        control={<ControlDePedido abierto={false} />}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// La cabecera
// ---------------------------------------------------------------------------

/**
 * Lleva la banda amarilla, como el historial del que se abre.
 *
 * Aquí no es por ser sección principal —no lo es, se llega desde dentro— sino
 * porque hay un sujeto que presentar: este viaje y no otro. Es lo mismo que
 * hace la ficha de un comercio.
 */
function Cabecera({ dato, onVolver }: {
  readonly dato: DetalleDeViaje;
  readonly onVolver: () => void;
}) {
  const tema = useTema();

  return (
    <CabeceraAmarilla>
      {/* Volver es un ENLACE, no un botón.
          Como botón sólido ocupaba un tercio de la cabecera amarilla y se
          leía como la acción principal de la pantalla, que es justo lo que no
          es: aquí se viene a mirar, y salir es lo de menos. */}
      <Pressable
        onPress={onVolver}
        accessibilityRole="button"
        accessibilityLabel="Volver al historial"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'flex-start',
          opacity: pressed ? 0.6 : 0.82
        })}
      >
        <Txt nivel="etiqueta" tono="sobreAcento">‹</Txt>
        <Txt nivel="etiqueta" tono="sobreAcento">Historial</Txt>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Txt nivel="titulo" tono="sobreAcento" accessibilityRole="header">Tu viaje</Txt>
        <View style={{ flex: 1 }} />
        {/* La insignia va perfilada en grafito: los tonos del sistema
            —verde, gris— desaparecen sobre el amarillo. */}
        <View style={{
          borderWidth: 1,
          borderColor: tema.color.sobreAcento,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 3
        }}>
          <Txt nivel="etiqueta" tono="sobreAcento">{dato.estado}</Txt>
        </View>
      </View>

      <Txt nivel="pie" tono="sobreAcento" estilo={{ opacity: 0.78 }}>{dato.fecha}</Txt>

      {/* El mismo par de puntos que en el trayecto y en el historial: se
          reconoce sin leer, aunque aquí van sobre amarillo. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
          <View style={{
            width: 9, height: 9, borderRadius: 5,
            backgroundColor: tema.color.sobreAcento, opacity: 0.55
          }} />
          <View style={{
            width: 2, flex: 1, minHeight: 16,
            backgroundColor: tema.color.sobreAcento, opacity: 0.35
          }} />
          <View style={{
            width: 9, height: 9, borderRadius: 2,
            backgroundColor: tema.color.sobreAcento
          }} />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Txt nivel="cuerpo" tono="sobreAcento" estilo={{ opacity: 0.8 }}>{dato.origen}</Txt>
          <Txt nivel="cuerpo" tono="sobreAcento">{dato.destino}</Txt>
        </View>
      </View>
    </CabeceraAmarilla>
  );
}

// ---------------------------------------------------------------------------
// La cronología
// ---------------------------------------------------------------------------

/**
 * Los pasos del viaje con su hora.
 *
 * La hora va a la IZQUIERDA, en su propia columna de ancho fijo. Metida en la
 * línea del texto habría que buscarla en cada renglón, y esta lista se lee
 * justamente para comparar horas.
 */
function Cronologia({ hitos }: { readonly hitos: readonly HitoDeViaje[] }) {
  const tema = useTema();

  return (
    <View>
      {hitos.map((hito, indice) => {
        const ultimo = indice === hitos.length - 1;

        return (
          <View key={hito.clave} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 44, paddingTop: 1 }}>
              <Txt nivel="etiqueta" tono={hito.ocurrido ? 'secundario' : 'tenue'}>
                {hito.ocurrido ? hito.hora : '—'}
              </Txt>
            </View>

            {/* El riel. El punto de un paso que no ocurrió va hueco: el relleno
                es lo que dice «esto pasó», y en una lista de tiempos esa
                diferencia tiene que verse antes de leer. */}
            <View style={{ alignItems: 'center', width: 11 }}>
              <View style={{
                width: 9, height: 9, borderRadius: 5, marginTop: 5,
                borderWidth: hito.ocurrido ? 0 : 1.5,
                borderColor: tema.color.textoTenue,
                backgroundColor: hito.ocurrido ? tema.color.acento : 'transparent'
              }} />
              {!ultimo ? (
                <View style={{
                  width: 2, flex: 1, minHeight: 14,
                  marginVertical: 3,
                  backgroundColor: tema.color.borde
                }} />
              ) : null}
            </View>

            <View style={{ flex: 1, paddingBottom: ultimo ? 0 : 12, gap: 2 }}>
              <Txt nivel="cuerpo" tono={hito.ocurrido ? 'primario' : 'tenue'}>
                {hito.titulo}
              </Txt>
              {hito.detalle !== undefined ? (
                <Txt nivel="pie" tono="secundario">{hito.detalle}</Txt>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// La conversación archivada
// ---------------------------------------------------------------------------

/**
 * Un mensaje, tal como quedó guardado.
 *
 * Los tuyos a la derecha en amarillo diluido, los del conductor a la izquierda
 * sobre superficie. Es la convención de cualquier chat y no hay razón para
 * inventar otra: quien abre esto ya sabe leerla.
 *
 * No es un chat vivo. No se escribe aquí, y por eso las burbujas no llevan
 * estado de envío ni de leído: sería atrezo.
 */
function Burbuja({ mensaje }: { readonly mensaje: MensajeDeViaje }) {
  const tema = useTema();
  const mia = mensaje.autor === 'pasajera';

  return (
    <View style={{
      alignSelf: mia ? 'flex-end' : 'flex-start',
      maxWidth: '86%',
      gap: 4
    }}>
      <View style={{
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: tema.radio.campo,
        // La esquina que apunta a quien habla, como en cualquier chat.
        borderBottomRightRadius: mia ? 4 : tema.radio.campo,
        borderBottomLeftRadius: mia ? tema.radio.campo : 4,
        backgroundColor: mia ? `${tema.color.acento}26` : tema.color.superficieHundida,
        borderWidth: 1,
        borderColor: mia ? `${tema.color.acento}44` : tema.color.borde,
        gap: 7
      }}>
        {mensaje.texto !== undefined ? (
          <Txt nivel="cuerpo">{mensaje.texto}</Txt>
        ) : null}

        {mensaje.adjunto !== undefined ? <Adjunto rotulo={mensaje.adjunto.rotulo} /> : null}
      </View>

      <Txt nivel="pie" tono="tenue" estilo={{ alignSelf: mia ? 'flex-end' : 'flex-start' }}>
        {mensaje.hora} · {mia ? 'Tú' : 'Conductor'}
      </Txt>
    </View>
  );
}

/**
 * Un adjunto del chat.
 *
 * En la maqueta no hay imagen que enseñar, y poner una fotografía cualquiera
 * haría creer que es la que se envió. El marco discontinuo dice lo que es: aquí
 * va la imagen que se mandó, y se guarda igual que el texto.
 *
 * Que se guarde importa más de lo que parece: una foto del portón o del recibo
 * es justo la clase de prueba que decide un reclamo.
 */
function Adjunto({ rotulo }: { readonly rotulo: string }) {
  const tema = useTema();

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: tema.radio.campo,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: tema.color.borde
    }}>
      <Icono nombre="imagen" color={tema.color.textoSecundario} tamano={18} />
      <Txt nivel="pie" tono="secundario" estilo={{ flex: 1 }}>{rotulo}</Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

/**
 * Una banda a todo el ancho.
 *
 * Es la misma forma que el saldo: de borde a borde y sobre `superficieElevada`,
 * porque en modo día el fondo y `superficie` están a seis puntos de luminancia
 * y las bandas desaparecían.
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
      backgroundColor: tema.color.superficieElevada,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: tema.color.borde,
      marginTop: tema.ritmo.entreElementos,
      paddingVertical: tema.ritmo.dentroDeTarjeta,
      paddingHorizontal: tema.ritmo.margenPantalla,
      gap: tema.ritmo.entreElementos
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <View style={{
          width: 34, height: 34, borderRadius: 10,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: `${tema.color.acento}26`
        }}>
          <Icono nombre={icono} color={tema.color.acentoTexto} tamano={18} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Txt nivel="encabezado">{titulo}</Txt>
          {detalle !== undefined ? <Txt nivel="pie" tono="tenue">{detalle}</Txt> : null}
        </View>
      </View>

      {children}
    </View>
  );
}

/** Rótulo a la izquierda, valor a la derecha. */
function Dato({ rotulo, valor }: { readonly rotulo: string; readonly valor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Txt nivel="cuerpo" tono="secundario" estilo={{ flex: 1 }}>{rotulo}</Txt>
      <Txt nivel="cuerpo">{valor}</Txt>
    </View>
  );
}

/** Una cifra con su rótulo debajo, para las dos de la cronología. */
function Cifra({ rotulo, valor }: { readonly rotulo: string; readonly valor: string }) {
  const tema = useTema();

  return (
    <View style={{
      flex: 1,
      gap: 2,
      paddingVertical: 11,
      paddingHorizontal: 13,
      borderRadius: tema.radio.campo,
      backgroundColor: tema.color.superficieHundida,
      borderWidth: 1,
      borderColor: tema.color.borde
    }}>
      <Txt nivel="encabezado">{valor}</Txt>
      <Txt nivel="pie" tono="tenue">{rotulo}</Txt>
    </View>
  );
}

/** Se usa desde el historial para no repetir el estado en dos sitios. */
export function InsigniaDeEstado({ estado }: { readonly estado: string }) {
  return <Insignia texto={estado} tono={estado === 'Completado' ? 'exito' : 'neutro'} />;
}
