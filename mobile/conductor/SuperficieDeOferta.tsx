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
 * Lo que decide si vale la pena la carrera va primero y grande: cuánto se cobra,
 * cuán lejos está la recogida, la visualización del vehículo de +58Express y la
 * telemetría del viaje para decidir en un instante.
 */

import { Image, Pressable, View } from 'react-native';

import { Boton, Txt } from '../ui/componentes';
import { IconoAnimado } from '../ui/IconoAnimado';
import { useTema } from '../theme/ThemeContext';
import { VEHICULOS } from '../theme/marca';
import type { OfertaDeViaje } from '../domain/ofertaDeViaje';

/** Los segundos en los que el reloj pasa a apremio. */
const SEGUNDOS_DE_APREMIO = 5;

const km = (valor: number | null) => (valor === null ? '—' : `${valor.toFixed(1)} km`);

/** El reloj de cuenta regresiva con badge de apremio. */
function Cuenta({ segundos }: { readonly segundos: number }) {
  const tema = useTema();
  const apremia = segundos <= SEGUNDOS_DE_APREMIO;
  const colorAlerta = apremia ? tema.color.peligro : tema.color.textoPrimario;

  return (
    <View
      testID="cuenta-atras-oferta"
      accessibilityRole="text"
      accessibilityLabel={`Quedan ${segundos} segundos para responder`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: apremia ? `${tema.color.peligro}1A` : tema.color.superficieHundida,
        borderWidth: 1,
        borderColor: apremia ? tema.color.peligro : tema.color.borde
      }}
    >
      <IconoAnimado
        nombre="reloj"
        color={colorAlerta}
        tamano={13}
        variante={apremia ? 'pulso' : 'ninguna'}
      />
      <Txt nivel="encabezado" tono={apremia ? 'peligro' : 'primario'} estilo={{ fontSize: 14, fontWeight: '800' }}>
        {`${segundos}s`}
      </Txt>
    </View>
  );
}

/** Píldora de telemetría de viaje: recorrido, tiempo y forma de cobro. */
function PildoraTelemetria({
  icono,
  etiqueta,
  valor
}: {
  readonly icono: 'viajes' | 'reloj' | 'dolar';
  readonly etiqueta: string;
  readonly valor: string;
}) {
  const tema = useTema();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: 12,
        backgroundColor: tema.color.superficieHundida,
        borderWidth: 1,
        borderColor: tema.color.borde,
        gap: 3
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <IconoAnimado nombre={icono} color={tema.color.textoSecundario} tamano={12} />
        <Txt nivel="pie" tono="tenue" numberOfLines={1} estilo={{ fontSize: 10.5 }}>
          {etiqueta}
        </Txt>
      </View>
      <Txt nivel="cuerpo" estilo={{ fontWeight: '800', fontSize: 13.5, color: tema.color.textoPrimario } as never}>
        {valor}
      </Txt>
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
  onRechazar,
  onMinimizar
}: {
  readonly oferta: OfertaDeViaje;
  readonly segundos: number;
  readonly puedeAceptar: boolean;
  readonly puedeRechazar: boolean;
  readonly aceptando: boolean;
  readonly onAceptar: () => void;
  readonly onRechazar: () => void;
  readonly onMinimizar?: () => void;
}) {
  const tema = useTema();
  const esAuto = oferta.tipo === 'AUTO';
  const activoVehiculo = esAuto ? VEHICULOS.AUTO : VEHICULOS.MOTO;

  return (
    <View
      testID="superficie-de-oferta"
      style={{
        backgroundColor: tema.color.superficie,
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        borderWidth: 1,
        borderColor: tema.color.borde,
        paddingTop: 14,
        paddingBottom: 20,
        paddingHorizontal: 16,
        gap: 14,
        shadowColor: tema.color.fondoHundido,
        shadowOpacity: 0.28,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -4 },
        elevation: 12
      }}
    >
      {/* Cabecera de estado: Turno activo y botón minimizar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: tema.color.exito
            }}
          />
          <Txt nivel="etiqueta" tono="tenue" estilo={{ fontWeight: '700', fontSize: 11, letterSpacing: 0.8 }}>
            TURNO ACTIVO
          </Txt>
        </View>

        {onMinimizar ? (
          <Pressable
            onPress={onMinimizar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Minimizar solicitud"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingVertical: 3,
              paddingHorizontal: 9,
              borderRadius: 999,
              backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficieHundida,
              borderWidth: 1,
              borderColor: tema.color.borde
            })}
          >
            <Txt nivel="pie" tono="tenue" estilo={{ fontWeight: '600', fontSize: 11 }}>
              Minimizar
            </Txt>
            <IconoAnimado nombre="flecha-abajo" color={tema.color.textoSecundario} tamano={11} />
          </Pressable>
        ) : null}
      </View>

      {/* Escaparate de Carrera: Tipo de servicio, Precio Hero, Cuenta regresiva y Moto Amarilla de +58Express */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: tema.color.superficieHundida,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: tema.color.borde,
          paddingVertical: 12,
          paddingHorizontal: 14
        }}
      >
        {/* Columna izquierda: Tipo de servicio, tarifa y apremio */}
        <View style={{ flex: 1, gap: 4, paddingRight: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: tema.color.acento
              }}
            />
            <Txt nivel="etiqueta" tono="tenue" estilo={{ fontWeight: '700', fontSize: 11, letterSpacing: 0.6 }}>
              {esAuto ? 'CARRERA EN AUTO' : 'CARRERA EN MOTO'}
            </Txt>
          </View>

          <View testID="tarifa-de-oferta" style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Txt nivel="titulo" estilo={{ fontWeight: '900', fontSize: 32, lineHeight: 36 }}>
              {oferta.dolares === null ? '—' : `$${oferta.dolares.toFixed(2)}`}
            </Txt>
            {oferta.bolivares === null ? null : (
              <Txt nivel="pie" tono="secundario" estilo={{ fontWeight: '600' }}>
                {`Bs. ${oferta.bolivares.toFixed(2)}`}
              </Txt>
            )}
          </View>

          <View style={{ alignSelf: 'flex-start', marginTop: 2 }}>
            <Cuenta segundos={segundos} />
          </View>
        </View>

        {/* Columna derecha: Moto amarilla de +58Express integrada con elegancia */}
        <View
          style={{
            width: 124,
            height: 84,
            borderRadius: 14,
            backgroundColor: tema.color.superficie,
            borderWidth: 1,
            borderColor: tema.color.borde,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}
        >
          <Image
            source={activoVehiculo.tarjeta}
            style={{ width: 114, height: 76, resizeMode: 'contain' }}
            accessibilityLabel={activoVehiculo.nombre}
          />
        </View>
      </View>

      {/* Recorrido: Recogida y Destino con conector vertical visual */}
      <View
        style={{
          backgroundColor: tema.color.superficieHundida,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: tema.color.borde,
          padding: 12,
          gap: 10
        }}
      >
        {/* Origen */}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ alignItems: 'center', width: 14, marginTop: 3 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: tema.color.acento,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: tema.color.fondoHundido
                }}
              />
            </View>
            <View
              style={{
                width: 2,
                height: 24,
                backgroundColor: tema.color.borde,
                marginTop: 2
              }}
            />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Txt nivel="etiqueta" tono="tenue" estilo={{ fontSize: 10.5, fontWeight: '600' }}>
              Recoger en
            </Txt>
            <Txt nivel="cuerpo" numberOfLines={2} estilo={{ fontWeight: '700', fontSize: 14 }}>
              {oferta.recogida.direccion ?? 'Punto marcado en el mapa'}
            </Txt>
            <Txt nivel="pie" tono="secundario" estilo={{ fontSize: 11.5 }}>
              {`a ${km(oferta.distanciaHastaRecogidaKm)} de ti`}
            </Txt>
          </View>
        </View>

        {/* Destino */}
        {oferta.destino === null ? null : (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{ alignItems: 'center', width: 14, marginTop: 3 }}>
              <View
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  backgroundColor: tema.color.textoPrimario,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <View
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: 1,
                    backgroundColor: tema.color.fondoHundido
                  }}
                />
              </View>
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Txt nivel="etiqueta" tono="tenue" estilo={{ fontSize: 10.5, fontWeight: '600' }}>
                Llevar a
              </Txt>
              <Txt nivel="cuerpo" numberOfLines={2} estilo={{ fontWeight: '700', fontSize: 14 }}>
                {oferta.destino.direccion ?? 'Punto marcado en el mapa'}
              </Txt>
            </View>
          </View>
        )}
      </View>

      {/* Resumen de telemetría: Recorrido, Duración y Cobro */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PildoraTelemetria icono="viajes" etiqueta="Recorrido" valor={km(oferta.distanciaKm)} />
        <PildoraTelemetria
          icono="reloj"
          etiqueta="Duración"
          valor={oferta.minutos === null ? '—' : `${oferta.minutos} min`}
        />
        <PildoraTelemetria icono="dolar" etiqueta="Cobro" valor={oferta.formaDePago} />
      </View>

      {/* Acciones de decisión: Rechazar (secundario) y Aceptar (principal prominente) */}
      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 2 }}>
        <Boton
          titulo="Rechazar"
          variante="secundario"
          onPress={onRechazar}
          deshabilitado={!puedeRechazar}
          etiquetaAccesible="Rechazar esta carrera"
          testID="boton-rechazar-oferta"
          estilo={{ flex: 1, minHeight: 52 }}
        />
        <Boton
          titulo={aceptando ? 'Aceptando…' : 'Aceptar'}
          onPress={onAceptar}
          deshabilitado={!puedeAceptar}
          cargando={aceptando}
          etiquetaAccesible="Aceptar esta carrera"
          testID="boton-aceptar-oferta"
          estilo={{ flex: 1.8, minHeight: 52 }}
        />
      </View>
    </View>
  );
}

/** El aviso que queda cuando la oferta se resuelve o expira (incidente o feedback del sistema). */
export function CierreDeOferta({
  estado,
  onCerrar,
  onMinimizar
}: {
  readonly estado: 'ACEPTADA' | 'RECHAZADA' | 'EXPIRADA' | 'ERROR';
  readonly onCerrar: () => void;
  readonly onMinimizar?: () => void;
}) {
  const tema = useTema();

  const configuracion = {
    ACEPTADA: {
      titulo: '¡Carrera tuya!',
      detalle: 'Ve al punto de recogida.',
      icono: 'destino' as const,
      tono: 'exito' as const,
      badge: 'Asignada'
    },
    RECHAZADA: {
      titulo: 'Carrera rechazada',
      detalle: 'Se la ofrecimos a otro conductor.',
      icono: 'viajes' as const,
      tono: 'secundario' as const,
      badge: 'Rechazada'
    },
    EXPIRADA: {
      titulo: 'Se acabó el tiempo',
      detalle: 'La carrera pasó a otro conductor.',
      icono: 'reloj' as const,
      tono: 'secundario' as const,
      badge: 'Tiempo agotado'
    },
    ERROR: {
      titulo: 'No se pudo tomar',
      detalle: 'Puede que otro conductor la aceptara primero.',
      icono: 'escudo' as const,
      tono: 'peligro' as const,
      badge: 'No disponible'
    }
  }[estado];

  return (
    <View
      testID="cierre-de-oferta"
      accessibilityRole="alert"
      style={{
        backgroundColor: tema.color.superficie,
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        borderWidth: 1,
        borderColor: tema.color.borde,
        paddingTop: 14,
        paddingBottom: 20,
        paddingHorizontal: 16,
        gap: 14,
        shadowColor: tema.color.fondoHundido,
        shadowOpacity: 0.25,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: -3 },
        elevation: 10
      }}
    >
      {/* Cabecera con Turno activo */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: tema.color.exito
            }}
          />
          <Txt nivel="etiqueta" tono="tenue" estilo={{ fontWeight: '700', fontSize: 11, letterSpacing: 0.8 }}>
            TURNO ACTIVO
          </Txt>
        </View>

        {onMinimizar ? (
          <Pressable
            onPress={onMinimizar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Minimizar aviso"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingVertical: 3,
              paddingHorizontal: 9,
              borderRadius: 999,
              backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficieHundida,
              borderWidth: 1,
              borderColor: tema.color.borde
            })}
          >
            <Txt nivel="pie" tono="tenue" estilo={{ fontWeight: '600', fontSize: 11 }}>
              Minimizar
            </Txt>
            <IconoAnimado nombre="flecha-abajo" color={tema.color.textoSecundario} tamano={11} />
          </Pressable>
        ) : null}
      </View>

      {/* Bloque estructurado de incidente / feedback del sistema */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: 16,
          backgroundColor: tema.color.superficieHundida,
          borderWidth: 1,
          borderColor: tema.color.borde
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: tema.color.superficie,
            borderWidth: 1,
            borderColor: tema.color.borde,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <IconoAnimado
            nombre={configuracion.icono}
            color={configuracion.tono === 'exito' ? tema.color.exito : configuracion.tono === 'peligro' ? tema.color.peligro : tema.color.textoPrimario}
            tamano={20}
          />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt nivel="encabezado" tono={configuracion.tono} estilo={{ fontWeight: '800', fontSize: 16 }}>
              {configuracion.titulo}
            </Txt>
            <View
              style={{
                paddingVertical: 2,
                paddingHorizontal: 7,
                borderRadius: 6,
                backgroundColor: tema.color.superficieElevada
              }}
            >
              <Txt nivel="pie" tono="tenue" estilo={{ fontSize: 10, fontWeight: '700' }}>
                {configuracion.badge}
              </Txt>
            </View>
          </View>
          <Txt nivel="cuerpo" tono="secundario" estilo={{ fontSize: 13, lineHeight: 18 }}>
            {configuracion.detalle}
          </Txt>
        </View>
      </View>

      {/* Acción principal del estado */}
      <Boton
        titulo={estado === 'ACEPTADA' ? 'Ver la carrera' : 'Seguir disponible'}
        variante={estado === 'ACEPTADA' ? 'principal' : 'secundario'}
        onPress={onCerrar}
        testID="boton-cerrar-oferta"
        estilo={{ minHeight: 52 }}
      />
    </View>
  );
}

