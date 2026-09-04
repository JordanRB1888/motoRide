/**
 * La carrera que le ofrecen a un conductor.
 *
 * DÓNDE VIVE Y POR QUÉ
 *
 * En `conductor/` y no en `ui/` ni en `preview/`, que son territorio de la
 * dirección visual. Aquí no se inventa ni un color ni un tamaño: todo sale de
 * `useTema` y de los componentes ya aprobados —`Txt`, `Boton`, `Icono`—, así que
 * la superficie hereda el sistema en vez de fundar uno paralelo.
 *
 * QUINCE SEGUNDOS PARA DECIDIR
 *
 * Eso manda todo lo demás. Lo que decide si vale la pena la carrera va primero
 * y grande —cuánto se cobra, cuán lejos está la recogida—; el resto queda
 * debajo. Nada de lo que se ve aquí está inventado: cada dato viene del viaje
 * real, y lo que el servidor no manda se pinta como «—» en vez de un cero que
 * parecería un precio.
 */

import { View } from 'react-native';

import { Boton, Txt } from '../ui/componentes';
import { useTema } from '../theme/ThemeContext';
import type { OfertaDeViaje } from '../domain/ofertaDeViaje';

/** Los segundos en los que el reloj pasa a rojo. */
const SEGUNDOS_DE_APREMIO = 5;

const km = (valor: number | null) => (valor === null ? '—' : `${valor.toFixed(1)} km`);

function Dato({ etiqueta, valor }: { readonly etiqueta: string; readonly valor: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt nivel="etiqueta" tono="tenue">{etiqueta}</Txt>
      <Txt nivel="cuerpo">{valor}</Txt>
    </View>
  );
}

/** El reloj. Cuenta contra el vencimiento del servidor, no hacia atrás desde 15. */
function Cuenta({ segundos }: { readonly segundos: number }) {
  const tema = useTema();
  const apremia = segundos <= SEGUNDOS_DE_APREMIO;
  return (
    <View
      testID="cuenta-atras-oferta"
      accessibilityRole="text"
      accessibilityLabel={`Quedan ${segundos} segundos para responder`}
      style={{
        minWidth: 56,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        alignItems: 'center',
        backgroundColor: apremia ? `${tema.color.peligro}1A` : tema.color.superficieHundida,
        borderWidth: 1,
        borderColor: apremia ? tema.color.peligro : tema.color.borde
      }}
    >
      <Txt nivel="encabezado" tono={apremia ? 'peligro' : 'primario'}>{`${segundos}s`}</Txt>
    </View>
  );
}

export function SuperficieDeOferta({
  oferta,
  segundos,
  puedeAceptar,
  puedeRechazar,
  aceptando,
  onAceptar,
  onRechazar
}: {
  readonly oferta: OfertaDeViaje;
  readonly segundos: number;
  readonly puedeAceptar: boolean;
  readonly puedeRechazar: boolean;
  readonly aceptando: boolean;
  readonly onAceptar: () => void;
  readonly onRechazar: () => void;
}) {
  const tema = useTema();

  return (
    <View
      testID="superficie-de-oferta"
      style={{
        backgroundColor: tema.color.superficie,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: tema.color.borde,
        padding: 20,
        gap: 16
      }}
    >
      {/* Lo primero: cuánto se cobra y cuánto queda para decidir. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Txt nivel="etiqueta" tono="tenue">
            {oferta.tipo === 'AUTO' ? 'Carrera en auto' : 'Carrera en moto'}
          </Txt>
          <View testID="tarifa-de-oferta">
            <Txt nivel="titulo">
              {oferta.dolares === null ? '—' : `$${oferta.dolares.toFixed(2)}`}
            </Txt>
          </View>
          {oferta.bolivares === null ? null : (
            <Txt nivel="cuerpo" tono="secundario">{`Bs. ${oferta.bolivares.toFixed(2)}`}</Txt>
          )}
        </View>
        <Cuenta segundos={segundos} />
      </View>

      {/* El recorrido. La dirección sólo si el servidor la manda. */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{
            width: 10, height: 10, borderRadius: 5, marginTop: 6,
            backgroundColor: tema.color.acento
          }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt nivel="etiqueta" tono="tenue">Recoger</Txt>
            <Txt nivel="cuerpo" numberOfLines={2}>
              {oferta.recogida.direccion ?? 'Punto marcado en el mapa'}
            </Txt>
            <Txt nivel="etiqueta" tono="secundario">
              {`a ${km(oferta.distanciaHastaRecogidaKm)} de ti`}
            </Txt>
          </View>
        </View>

        {oferta.destino === null ? null : (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{
              width: 10, height: 10, marginTop: 6,
              backgroundColor: tema.color.textoPrimario
            }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt nivel="etiqueta" tono="tenue">Llevar a</Txt>
              <Txt nivel="cuerpo" numberOfLines={2}>
                {oferta.destino.direccion ?? 'Punto marcado en el mapa'}
              </Txt>
            </View>
          </View>
        )}
      </View>

      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: tema.color.borde
      }}>
        <Dato etiqueta="Recorrido" valor={km(oferta.distanciaKm)} />
        <Dato etiqueta="Duración" valor={oferta.minutos === null ? '—' : `${oferta.minutos} min`} />
        <Dato etiqueta="Cobro" valor={oferta.formaDePago} />
      </View>

      {/* Rechazar a la izquierda y en silencio: el gesto que importa es el otro,
          y ponerlos igual de llamativos invita a equivocarse con prisa. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Boton
          titulo="Rechazar"
          variante="secundario"
          onPress={onRechazar}
          deshabilitado={!puedeRechazar}
          etiquetaAccesible="Rechazar esta carrera"
          testID="boton-rechazar-oferta"
          estilo={{ flex: 1 }}
        />
        <Boton
          titulo={aceptando ? 'Aceptando…' : 'Aceptar'}
          onPress={onAceptar}
          deshabilitado={!puedeAceptar}
          cargando={aceptando}
          etiquetaAccesible="Aceptar esta carrera"
          testID="boton-aceptar-oferta"
          estilo={{ flex: 2 }}
        />
      </View>
    </View>
  );
}

/** El aviso que queda cuando la oferta se resuelve o se pierde. */
export function CierreDeOferta({
  estado,
  onCerrar
}: {
  readonly estado: 'ACEPTADA' | 'RECHAZADA' | 'EXPIRADA' | 'ERROR';
  readonly onCerrar: () => void;
}) {
  const tema = useTema();

  const textos = {
    ACEPTADA: { titulo: '¡Carrera tuya!', detalle: 'Ve al punto de recogida.', tono: 'exito' as const },
    RECHAZADA: { titulo: 'Carrera rechazada', detalle: 'Se la ofrecimos a otro conductor.', tono: 'secundario' as const },
    EXPIRADA: { titulo: 'Se acabó el tiempo', detalle: 'La carrera pasó a otro conductor.', tono: 'secundario' as const },
    // Sin adornos: lo más probable es que otro llegara antes, y decirlo evita
    // que parezca un fallo de la aplicación.
    ERROR: { titulo: 'No se pudo tomar', detalle: 'Puede que otro conductor la aceptara primero.', tono: 'peligro' as const }
  }[estado];

  return (
    <View
      testID="cierre-de-oferta"
      accessibilityRole="alert"
      style={{
        backgroundColor: tema.color.superficie,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: tema.color.borde,
        padding: 20,
        gap: 12
      }}
    >
      <Txt nivel="encabezado" tono={textos.tono}>{textos.titulo}</Txt>
      <Txt nivel="cuerpo" tono="secundario">{textos.detalle}</Txt>
      <Boton
        titulo={estado === 'ACEPTADA' ? 'Ver la carrera' : 'Seguir disponible'}
        variante={estado === 'ACEPTADA' ? 'principal' : 'secundario'}
        onPress={onCerrar}
        testID="boton-cerrar-oferta"
      />
    </View>
  );
}
