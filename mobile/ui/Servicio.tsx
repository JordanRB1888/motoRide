/**
 * El selector de vehículo y la entrada a Transporte Seguro.
 *
 * LOS VEHÍCULOS SON LOS DE VERDAD
 *
 * La moto amarilla y el automóvil amarillo son los mismos archivos que usa la
 * web para lo mismo. No hay pictograma, ni silueta, ni emoji: elegir entre moto
 * y auto es la decisión más frecuente de toda la aplicación, y se toma de un
 * vistazo cuando lo que se ve es un vehículo reconocible.
 *
 * CÓMO SE MARCA LA ELECCIÓN
 *
 * Con el filo amarillo y un escalón de superficie, nunca con un contorno
 * amarillo alrededor. Dos tarjetas contorneadas en amarillo compiten entre sí
 * y dejan de señalar cuál está elegida — es exactamente el error que se
 * corrigió al cerrar la dirección C.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';
import { Txt } from './componentes';
import { Icono } from './Icono';
import { Vehiculo } from './Marca';
import { VEHICULOS, type TipoDeVehiculo } from '../theme/marca';
import { useTema } from '../theme/ThemeContext';

export interface OpcionDeServicio {
  readonly tipo: TipoDeVehiculo;
  /**
   * Lo que costaría. Se omite cuando todavía no hay tarifa que enseñar: un
   * precio de ejemplo en una pantalla de producto se lee como un precio real.
   */
  readonly precio?: string;
  readonly minutos?: number;
}

export function SelectorDeServicio({ opciones, elegido, onElegir }: {
  readonly opciones: readonly OpcionDeServicio[];
  readonly elegido: TipoDeVehiculo;
  readonly onElegir?: (tipo: TipoDeVehiculo) => void;
}) {
  const tema = useTema();

  return (
    <View style={{ flexDirection: 'row', gap: tema.ritmo.entreElementos }}>
      {opciones.map(opcion => {
        const vehiculo = VEHICULOS[opcion.tipo];
        const activo = opcion.tipo === elegido;

        return (
          <Pressable
            key={opcion.tipo}
            onPress={() => onElegir?.(opcion.tipo)}
            accessibilityRole="radio"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={`${vehiculo.nombre}, ${vehiculo.plazas} ${vehiculo.plazas === 1 ? 'plaza' : 'plazas'}${opcion.precio ? `, ${opcion.precio}` : ''}`}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: tema.radio.tarjeta,
              backgroundColor: activo || pressed ? tema.color.superficieElevada : tema.color.superficie,
              paddingTop: 10,
              paddingBottom: 12,
              paddingHorizontal: 12,
              overflow: 'hidden',
              alignItems: 'center'
            })}
          >
            {/* El filo: la firma. Sólo lo lleva la opción elegida. */}
            {activo ? (
              <View style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: 3, backgroundColor: tema.color.acento
              }} />
            ) : null}

            <Vehiculo tipo={opcion.tipo} ancho={104} atenuado={!activo} />

            <View style={{ alignItems: 'center', marginTop: 4, gap: 2 }}>
              <Txt nivel="encabezado" tono={activo ? 'primario' : 'secundario'}>
                {vehiculo.nombre}
              </Txt>
              <Txt nivel="etiqueta" tono="tenue">
                {vehiculo.plazas} {vehiculo.plazas === 1 ? 'persona' : 'personas'}
              </Txt>
              {opcion.precio ? (
                <Txt nivel="encabezado" tono={activo ? 'acento' : 'secundario'}>
                  {opcion.precio}
                </Txt>
              ) : null}
              {opcion.minutos !== undefined ? (
                <Txt nivel="etiqueta" tono="tenue">
                  {opcion.minutos} min
                </Txt>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Transporte Seguro
// ---------------------------------------------------------------------------

/**
 * La entrada a Transporte Seguro.
 *
 * Conserva la micro-historia que ya cuenta la tarjeta de la web: la moto
 * avanza y entra en un recinto protegido, y la protección se confirma. Allí es
 * una escena animada con la moto real, estelas de velocidad y un candado con
 * su marca de comprobado; aquí es la misma escena, con la misma moto.
 *
 * Sólo cambia el ritmo: en la web la moto recorre la tarjeta entera en bucle.
 * En el teléfono, dentro de una hoja que ya se está moviendo con el mapa
 * detrás, ese recorrido sería ruido, así que la moto sólo respira. La historia
 * se lee igual y no compite con lo que la persona está haciendo.
 *
 * Esto es integración visual y nada más: no toca tarifas, ni facturación, ni
 * la lógica de Transporte Seguro.
 */
export function EntradaDeTransporteSeguro({ onPress }: { readonly onPress?: () => void }) {
  const tema = useTema();
  const deriva = useRef(new Animated.Value(0)).current;
  const [quieto, setQuieto] = useState(false);

  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(activo => { if (vigente) setQuieto(activo); })
      .catch(() => { /* si no se puede consultar, se anima */ });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setQuieto);
    return () => { vigente = false; suscripcion.remove(); };
  }, []);

  useEffect(() => {
    if (quieto) { deriva.setValue(0); return; }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(deriva, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(deriva, { toValue: 0, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [deriva, quieto]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Transporte Seguro. Programa tus traslados con mayor tranquilidad"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: tema.radio.tarjeta,
        backgroundColor: pressed ? tema.color.superficieElevada : tema.color.superficie,
        paddingLeft: 16,
        paddingRight: 8,
        paddingVertical: 12,
        overflow: 'hidden'
      })}
    >
      {/* La firma amarilla: en la hoja de la pasajera, este bloque es el
          elemento dominante de su zona, y es el único que la lleva. */}
      <View style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 3, backgroundColor: tema.color.acento
      }} />

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Icono nombre="escudo" color={tema.color.acento} tamano={16} />
          <Txt nivel="encabezado">Transporte Seguro</Txt>
        </View>
        <Txt nivel="pie" tono="secundario">
          Programa tus traslados con mayor tranquilidad
        </Txt>
      </View>

      <EscenaProtegida deriva={deriva} />
    </Pressable>
  );
}

/** La moto entrando al recinto protegido. Decorativa: no la lee el lector. */
function EscenaProtegida({ deriva }: { readonly deriva: Animated.Value }) {
  const tema = useTema();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 104, height: 56, justifyContent: 'center' }}
    >
      {/* Estelas de velocidad. */}
      {[{ y: 18, ancho: 22 }, { y: 30, ancho: 14 }].map(estela => (
        <View key={estela.y} style={{
          position: 'absolute', left: 0, top: estela.y,
          width: estela.ancho, height: 2, borderRadius: 1,
          backgroundColor: tema.color.acento, opacity: 0.35
        }} />
      ))}

      <Animated.View style={{
        position: 'absolute', left: 12,
        transform: [{ translateX: deriva.interpolate({ inputRange: [0, 1], outputRange: [0, 7] }) }]
      }}>
        <Vehiculo tipo="MOTO" ancho={58} />
      </Animated.View>

      {/* El candado: arco, cuerpo y la marca de comprobado. */}
      <View style={{ position: 'absolute', right: 2, alignItems: 'center' }}>
        <View style={{
          width: 15, height: 9,
          borderTopLeftRadius: 8, borderTopRightRadius: 8,
          borderWidth: 2.5, borderBottomWidth: 0,
          borderColor: tema.color.acento
        }} />
        <View style={{
          width: 26, height: 21, borderRadius: 6,
          backgroundColor: tema.color.acento,
          alignItems: 'center', justifyContent: 'center'
        }}>
          <View style={{
            width: 11, height: 6,
            borderLeftWidth: 2.4, borderBottomWidth: 2.4,
            borderColor: tema.color.sobreAcento,
            transform: [{ rotate: '-45deg' }],
            marginTop: -3
          }} />
        </View>
      </View>
    </View>
  );
}
