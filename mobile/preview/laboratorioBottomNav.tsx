/**
 * Laboratorio Aislado de Motion para la Barra de Navegación Inferior (+58Express).
 *
 * FASE: BOTTOM-NAV-MOTION-LAB
 *
 * Este laboratorio permite evaluar y comparar interactivamente las TRES
 * variantes solicitadas para la navegación de Pasajero, SIN alterar la
 * aplicación real:
 *
 * 1. VARIANTE A — LIQUID TRACK:
 *    Masa líquida amarilla contenida que se desplaza horizontalmente por un
 *    carril visual. Durante el viaje se estira dinámicamente según la distancia
 *    y velocidad del salto, y al llegar se comprime elásticamente en reposo.
 *
 * 2. VARIANTE B — WAVE NOTCH:
 *    Deformación orgánica de la superficie física de la barra (no un objeto
 *    amarillo suelto). La muesca/cresta superior se desplaza fluidamente
 *    acompañando al icono activo, pasando con naturalidad por debajo del FAB central.
 *
 * 3. VARIANTE C — FLUID UNDERLINE:
 *    Línea base orgánica en la parte inferior con cinemática dual (cabeza y cola).
 *    La cabeza se proyecta con rapidez hacia el destino mientras la cola
 *    retiene inercia, estirando la línea durante el vuelo y contrayéndose al frenar.
 *
 * CONTRATO DE PRESERVACIÓN:
 * - El FAB amarillo central (ControlDePedido: 58x58, icono 'servicios' 2x2 grid)
 *   está 100% PRESERVADO y BLOQUEADO (FAB_LOCKED: YES).
 * - Cero círculos amarillos detrás de los iconos.
 * - Soporte interactivo de cambio de tema Claro / Oscuro.
 * - Botones de prueba para saltos rápidos y cruce por debajo del FAB.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  interpolate,
  Extrapolation,
  Easing as EasingAnimada
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icono, type NombreDeIcono } from '../ui/Icono';
import { Txt } from '../ui/componentes';
import { useTema, ProveedorDeTema } from '../theme/ThemeContext';
import { ControlDePedido, type DestinoDeNavegacion } from '../ui/Navegacion';
import { useMovimientoReducido } from '../ui/movimiento';

// ---------------------------------------------------------------------------
// Destinos oficiales de Passenger
// ---------------------------------------------------------------------------

export const DESTINOS_PASAJERA: readonly DestinoDeNavegacion[] = [
  { clave: 'inicio', icono: 'inicio', etiqueta: 'Inicio' },
  { clave: 'historial', icono: 'reloj', etiqueta: 'Historial' },
  { clave: 'saldo', icono: 'dolar', etiqueta: 'Saldo' },
  { clave: 'perfil', icono: 'perfil', etiqueta: 'Perfil' }
];

export type TipoVariante = 'liquid_track' | 'wave_notch' | 'fluid_underline';

function obtenerIndiceSlot(clave: string): number {
  if (clave === 'inicio') return 0;
  if (clave === 'historial') return 1;
  if (clave === 'pedir') return 2;
  if (clave === 'saldo') return 3;
  if (clave === 'perfil') return 4;
  return 0;
}

function calcularCentroSlot(anchoTotal: number, indiceSlot: number): number {
  const anchoRanura = anchoTotal / 5;
  return anchoRanura * (indiceSlot + 0.5);
}

// ---------------------------------------------------------------------------
// Componente de Pestaña Limpia (Común para las variantes)
// ---------------------------------------------------------------------------

interface PropPestanaLimpia {
  readonly icono: NombreDeIcono;
  readonly etiqueta: string;
  readonly activa: boolean;
  readonly onPress: () => void;
  readonly elevacionIcono?: number;
}

function PestanaLimpia({
  icono,
  etiqueta,
  activa,
  onPress,
  elevacionIcono = -4
}: PropPestanaLimpia) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const seleccion = useSharedValue(activa ? 1 : 0);
  const pulsacion = useSharedValue(1);

  useEffect(() => {
    seleccion.set(
      quieto
        ? withTiming(activa ? 1 : 0, { duration: 100 })
        : withSpring(activa ? 1 : 0, { duration: 260, dampingRatio: 0.82 })
    );
  }, [activa, quieto, seleccion]);

  const estiloIcono = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: quieto
          ? 0
          : interpolate(
              seleccion.get(),
              [0, 1],
              [0, elevacionIcono],
              Extrapolation.CLAMP
            )
      },
      { scale: pulsacion.get() }
    ]
  }));

  const estiloInactivo = useAnimatedStyle(() => ({
    opacity: interpolate(seleccion.get(), [0, 1], [1, 0], Extrapolation.CLAMP)
  }));

  const estiloActivo = useAnimatedStyle(() => ({
    opacity: interpolate(seleccion.get(), [0, 1], [0, 1], Extrapolation.CLAMP)
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        pulsacion.set(
          withTiming(0.92, {
            duration: 90,
            easing: EasingAnimada.bezier(0.2, 0.9, 0.3, 1)
          })
        )
      }
      onPressOut={() =>
        pulsacion.set(
          quieto ? 1 : withSpring(1, { duration: 160, dampingRatio: 0.95 })
        )
      }
      accessibilityRole="tab"
      accessibilityState={{ selected: activa }}
      accessibilityLabel={etiqueta}
      hitSlop={8}
      style={estilos.ranuraPestana}
    >
      <Reanimated.View style={[estilos.contenedorIcono, estiloIcono]}>
        <Reanimated.View style={estiloInactivo}>
          <Icono nombre={icono} color={tema.color.textoTenue} tamano={25} />
        </Reanimated.View>
        <Reanimated.View style={[estilos.iconoSuperpuesto, estiloActivo]}>
          <Icono
            nombre={icono}
            color={tema.color.acento}
            tamano={25}
            activo={icono !== 'moto'}
          />
        </Reanimated.View>
      </Reanimated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// VARIANTE A: LIQUID TRACK
// Carril físico con masa amarilla que se estira al viajar y se comprime al llegar
// ---------------------------------------------------------------------------

function BarraVarianteLiquidTrack({
  destinos,
  activo,
  alTocar,
  control
}: {
  readonly destinos: readonly DestinoDeNavegacion[];
  readonly activo: string;
  readonly alTocar: (clave: string) => void;
  readonly control: React.ReactNode;
}) {
  const tema = useTema();
  const inferior = useSafeAreaInsets().bottom;
  const { width: ancho } = useWindowDimensions();
  const quieto = useMovimientoReducido();
  const indice = obtenerIndiceSlot(activo);

  const posX = useSharedValue(calcularCentroSlot(ancho, indice));
  const escalaX = useSharedValue(1);
  const escalaY = useSharedValue(1);

  useEffect(() => {
    const destinoX = calcularCentroSlot(ancho, indice);
    const distancia = Math.abs(destinoX - posX.get());

    if (quieto || distancia < 2) {
      posX.set(destinoX);
      escalaX.set(1);
      escalaY.set(1);
      return;
    }

    // Estiramiento dinámico proporcional a la distancia de salto
    const estiramiento = Math.min(1 + (distancia / ancho) * 1.35, 1.85);
    const compresion = 1 / Math.sqrt(estiramiento);

    escalaX.set(
      withSequence(
        withTiming(estiramiento, {
          duration: 130,
          easing: EasingAnimada.bezier(0.2, 0.8, 0.25, 1)
        }),
        withSpring(1, { duration: 250, dampingRatio: 0.72 })
      )
    );

    escalaY.set(
      withSequence(
        withTiming(compresion, {
          duration: 130,
          easing: EasingAnimada.bezier(0.2, 0.8, 0.25, 1)
        }),
        withSpring(1, { duration: 250, dampingRatio: 0.72 })
      )
    );

    posX.set(
      withSpring(destinoX, {
        duration: 310,
        dampingRatio: 0.78
      })
    );
  }, [ancho, indice, posX, escalaX, escalaY, quieto]);

  const estiloMasaLiquida = useAnimatedStyle(() => ({
    transform: [
      { translateX: posX.get() - 20 },
      { scaleX: escalaX.get() },
      { scaleY: escalaY.get() }
    ]
  }));

  const [inicio, historial, saldo, perfil] = destinos;
  if (!inicio || !historial || !saldo || !perfil) return null;

  return (
    <View
      style={[
        estilos.contenedorBarra,
        {
          backgroundColor: tema.color.superficieElevada,
          borderTopColor: tema.color.borde,
          paddingBottom: Math.max(inferior, 10)
        }
      ]}
    >
      {/* Carril sutil empotrado */}
      <View
        pointerEvents="none"
        style={[
          estilos.carrilGuia,
          {
            backgroundColor: `${tema.color.borde}66`,
            borderColor: `${tema.color.borde}44`
          }
        ]}
      />

      {/* Masa líquida amarilla deformable que viaja por el carril */}
      <Reanimated.View
        pointerEvents="none"
        style={[
          estilos.masaLiquida,
          {
            backgroundColor: tema.color.acento,
            shadowColor: tema.color.acento,
            shadowOpacity: 0.45,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 1 }
          },
          estiloMasaLiquida
        ]}
      />

      {/* Pestañas e icono central */}
      <View style={estilos.filaDeBotones}>
        <PestanaLimpia
          icono={inicio.icono}
          etiqueta={inicio.etiqueta}
          activa={indice === 0}
          onPress={() => alTocar(inicio.clave)}
        />
        <PestanaLimpia
          icono={historial.icono}
          etiqueta={historial.etiqueta}
          activa={indice === 1}
          onPress={() => alTocar(historial.clave)}
        />
        <View style={estilos.ranuraCentral}>{control}</View>
        <PestanaLimpia
          icono={saldo.icono}
          etiqueta={saldo.etiqueta}
          activa={indice === 3}
          onPress={() => alTocar(saldo.clave)}
        />
        <PestanaLimpia
          icono={perfil.icono}
          etiqueta={perfil.etiqueta}
          activa={indice === 4}
          onPress={() => alTocar(perfil.clave)}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// VARIANTE B: WAVE NOTCH
// Deformación física de la superficie superior que viaja orgánicamente
// ---------------------------------------------------------------------------

function BarraVarianteWaveNotch({
  destinos,
  activo,
  alTocar,
  control
}: {
  readonly destinos: readonly DestinoDeNavegacion[];
  readonly activo: string;
  readonly alTocar: (clave: string) => void;
  readonly control: React.ReactNode;
}) {
  const tema = useTema();
  const inferior = useSafeAreaInsets().bottom;
  const { width: ancho } = useWindowDimensions();
  const quieto = useMovimientoReducido();
  const indice = obtenerIndiceSlot(activo);

  const ANCHO_MUESCA = 64;
  const posX = useSharedValue(calcularCentroSlot(ancho, indice) - ANCHO_MUESCA / 2);

  useEffect(() => {
    const destinoX = calcularCentroSlot(ancho, indice) - ANCHO_MUESCA / 2;
    if (quieto) {
      posX.set(destinoX);
    } else {
      posX.set(
        withSpring(destinoX, {
          duration: 300,
          dampingRatio: 0.82
        })
      );
    }
  }, [ancho, indice, posX, quieto]);

  const estiloMuesca = useAnimatedStyle(() => ({
    transform: [{ translateX: posX.get() }]
  }));

  const [inicio, historial, saldo, perfil] = destinos;
  if (!inicio || !historial || !saldo || !perfil) return null;

  return (
    <View style={estilos.contenedorMuesca}>
      {/* Fondo sólido de la barra */}
      <View
        pointerEvents="none"
        style={[
          estilos.superficiePlana,
          {
            backgroundColor: tema.color.superficieElevada,
            borderTopColor: tema.color.borde
          }
        ]}
      />

      {/* Muesca orgánica / cresta continua integrada en la superficie */}
      <Reanimated.View
        pointerEvents="none"
        style={[
          estilos.crestaElevada,
          {
            width: ANCHO_MUESCA,
            backgroundColor: tema.color.superficieElevada,
            borderColor: tema.color.borde,
            shadowColor: '#000000',
            shadowOpacity: 0.18,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: -2 },
            elevation: 4
          },
          estiloMuesca
        ]}
      >
        {/* Unión continua para borrar aristas inferiores */}
        <View
          style={{
            position: 'absolute',
            top: 10,
            right: -1,
            bottom: -2,
            left: -1,
            backgroundColor: tema.color.superficieElevada
          }}
        />
        {/* Sutil halo dorado interno en el pico de la ola */}
        <View
          style={{
            position: 'absolute',
            top: 3,
            left: 14,
            right: 14,
            height: 3,
            borderRadius: 2,
            backgroundColor: `${tema.color.acento}44`
          }}
        />
      </Reanimated.View>

      {/* Fila de iconos */}
      <View
        style={[
          estilos.filaDeBotones,
          {
            zIndex: 2,
            paddingTop: 8,
            paddingBottom: Math.max(inferior, 8)
          }
        ]}
      >
        <PestanaLimpia
          icono={inicio.icono}
          etiqueta={inicio.etiqueta}
          activa={indice === 0}
          elevacionIcono={-6}
          onPress={() => alTocar(inicio.clave)}
        />
        <PestanaLimpia
          icono={historial.icono}
          etiqueta={historial.etiqueta}
          activa={indice === 1}
          elevacionIcono={-6}
          onPress={() => alTocar(historial.clave)}
        />
        <View style={estilos.ranuraCentral}>{control}</View>
        <PestanaLimpia
          icono={saldo.icono}
          etiqueta={saldo.etiqueta}
          activa={indice === 3}
          elevacionIcono={-6}
          onPress={() => alTocar(saldo.clave)}
        />
        <PestanaLimpia
          icono={perfil.icono}
          etiqueta={perfil.etiqueta}
          activa={indice === 4}
          elevacionIcono={-6}
          onPress={() => alTocar(perfil.clave)}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// VARIANTE C: FLUID UNDERLINE
// Línea base con inercia dual (la cabeza avanza rápido, la cola acompaña con retardo)
// ---------------------------------------------------------------------------

function BarraVarianteFluidUnderline({
  destinos,
  activo,
  alTocar,
  control
}: {
  readonly destinos: readonly DestinoDeNavegacion[];
  readonly activo: string;
  readonly alTocar: (clave: string) => void;
  readonly control: React.ReactNode;
}) {
  const tema = useTema();
  const inferior = useSafeAreaInsets().bottom;
  const { width: ancho } = useWindowDimensions();
  const quieto = useMovimientoReducido();
  const indice = obtenerIndiceSlot(activo);

  const ANCHO_REPOSO = 32;
  const cabezaX = useSharedValue(calcularCentroSlot(ancho, indice));
  const colaX = useSharedValue(calcularCentroSlot(ancho, indice));

  useEffect(() => {
    const destinoCentro = calcularCentroSlot(ancho, indice);

    if (quieto) {
      cabezaX.set(destinoCentro);
      colaX.set(destinoCentro);
      return;
    }

    // La cabeza sale antes con spring enérgico
    cabezaX.set(
      withSpring(destinoCentro, {
        duration: 250,
        dampingRatio: 0.84
      })
    );

    // La cola viaja con ligera inercia/damping para estirar la gota
    colaX.set(
      withSpring(destinoCentro, {
        duration: 340,
        dampingRatio: 0.76
      })
    );
  }, [ancho, indice, cabezaX, colaX, quieto]);

  const estiloLineaFluida = useAnimatedStyle(() => {
    const c = cabezaX.get();
    const t = colaX.get();
    const minX = Math.min(c, t) - ANCHO_REPOSO / 2;
    const maxX = Math.max(c, t) + ANCHO_REPOSO / 2;
    const anchoCalculado = Math.max(maxX - minX, ANCHO_REPOSO);

    return {
      left: minX,
      width: anchoCalculado
    };
  });

  const [inicio, historial, saldo, perfil] = destinos;
  if (!inicio || !historial || !saldo || !perfil) return null;

  return (
    <View
      style={[
        estilos.contenedorBarra,
        {
          backgroundColor: tema.color.superficieElevada,
          borderTopColor: tema.color.borde,
          paddingBottom: Math.max(inferior, 8)
        }
      ]}
    >
      {/* Fila de iconos limpia sin formas invasivas */}
      <View style={estilos.filaDeBotones}>
        <PestanaLimpia
          icono={inicio.icono}
          etiqueta={inicio.etiqueta}
          activa={indice === 0}
          onPress={() => alTocar(inicio.clave)}
        />
        <PestanaLimpia
          icono={historial.icono}
          etiqueta={historial.etiqueta}
          activa={indice === 1}
          onPress={() => alTocar(historial.clave)}
        />
        <View style={estilos.ranuraCentral}>{control}</View>
        <PestanaLimpia
          icono={saldo.icono}
          etiqueta={saldo.etiqueta}
          activa={indice === 3}
          onPress={() => alTocar(saldo.clave)}
        />
        <PestanaLimpia
          icono={perfil.icono}
          etiqueta={perfil.etiqueta}
          activa={indice === 4}
          onPress={() => alTocar(perfil.clave)}
        />
      </View>

      {/* Línea orgánica elástica en la base */}
      <View style={estilos.pistaDeSubrayado} pointerEvents="none">
        <Reanimated.View
          style={[
            estilos.subrayadoLiquido,
            {
              backgroundColor: tema.color.acento,
              shadowColor: tema.color.acento,
              shadowOpacity: 0.35,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 1 }
            },
            estiloLineaFluida
          ]}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contenedor Maestro del Laboratorio
// ---------------------------------------------------------------------------

export function PantallaLaboratorioBottomNav() {
  const [esquema, setEsquema] = useState<'oscuro' | 'claro'>('oscuro');
  const [variante, setVariante] = useState<TipoVariante>('liquid_track');
  const [tabActivo, setTabActivo] = useState<string>('inicio');
  const [ultimoSalto, setUltimoSalto] = useState<string>('Ninguno');
  const [cruzoFab, setCruzoFab] = useState<boolean>(false);
  const [pedirAbierto, setPedirAbierto] = useState<boolean>(false);

  const ejecutarSalto = (desde: string, hacia: string, etiqueta: string) => {
    const iDesde = obtenerIndiceSlot(desde);
    const iHacia = obtenerIndiceSlot(hacia);
    const cruza = (iDesde < 2 && iHacia > 2) || (iDesde > 2 && iHacia < 2);

    setCruzoFab(cruza);
    setUltimoSalto(etiqueta);
    setTabActivo(hacia);
    if (hacia === 'pedir') {
      setPedirAbierto(true);
    } else {
      setPedirAbierto(false);
    }
  };

  const seleccionarTab = (clave: string) => {
    const iDesde = obtenerIndiceSlot(tabActivo);
    const iHacia = obtenerIndiceSlot(clave);
    const cruza = (iDesde < 2 && iHacia > 2) || (iDesde > 2 && iHacia < 2);

    setCruzoFab(cruza);
    setUltimoSalto(`${tabActivo.toUpperCase()} → ${clave.toUpperCase()}`);
    setTabActivo(clave);
    setPedirAbierto(clave === 'pedir');
  };

  return (
    <ProveedorDeTema inicial="C2" esquemaForzado={esquema}>
      <LaboratorioContenido
        esquema={esquema}
        setEsquema={setEsquema}
        variante={variante}
        setVariante={setVariante}
        tabActivo={tabActivo}
        seleccionarTab={seleccionarTab}
        ultimoSalto={ultimoSalto}
        cruzoFab={cruzoFab}
        ejecutarSalto={ejecutarSalto}
        pedirAbierto={pedirAbierto}
        setPedirAbierto={setPedirAbierto}
      />
    </ProveedorDeTema>
  );
}

function LaboratorioContenido({
  esquema,
  setEsquema,
  variante,
  setVariante,
  tabActivo,
  seleccionarTab,
  ultimoSalto,
  cruzoFab,
  ejecutarSalto,
  pedirAbierto,
  setPedirAbierto
}: {
  readonly esquema: 'oscuro' | 'claro';
  readonly setEsquema: React.Dispatch<React.SetStateAction<'oscuro' | 'claro'>>;
  readonly variante: TipoVariante;
  readonly setVariante: React.Dispatch<React.SetStateAction<TipoVariante>>;
  readonly tabActivo: string;
  readonly seleccionarTab: (clave: string) => void;
  readonly ultimoSalto: string;
  readonly cruzoFab: boolean;
  readonly ejecutarSalto: (desde: string, hacia: string, etiqueta: string) => void;
  readonly pedirAbierto: boolean;
  readonly setPedirAbierto: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const tema = useTema();

  const descripcionVariante = useMemo(() => {
    switch (variante) {
      case 'liquid_track':
        return {
          titulo: 'A · Liquid Track',
          detalle:
            'Masa elástica amarilla que viaja por un carril sutil. Se estira según distancia y velocidad, comprimiéndose al llegar al slot destino.'
        };
      case 'wave_notch':
        return {
          titulo: 'B · Wave Notch',
          detalle:
            'Deformación física continua de la superficie de la barra. No hay objetos sueltos: la cresta se traslada con fluidez arquitectónica.'
        };
      case 'fluid_underline':
        return {
          titulo: 'C · Fluid Underline',
          detalle:
            'Línea base ultra-delgada con inercia dual (cabeza y cola). Estiramiento en vuelo y contracción limpia con micro-amortiguación.'
        };
    }
  }, [variante]);

  // FAB central intacto y bloqueado (FAB_LOCKED: YES)
  const botonCentralFab = (
    <ControlDePedido
      abierto={pedirAbierto}
      onAlternar={() => {
        const nuevoEstado = !pedirAbierto;
        setPedirAbierto(nuevoEstado);
        seleccionarTab(nuevoEstado ? 'pedir' : 'inicio');
      }}
    />
  );

  return (
    <View style={[estilos.contenedorPrincipal, { backgroundColor: tema.color.fondo }]}>
      <ScrollView
        contentContainerStyle={estilos.scrollArea}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabecera del Laboratorio */}
        <View style={estilos.seccionCabecera}>
          <Txt nivel="etiqueta" tono="acento">
            LABORATORIO AISLADO · MOTION LAB
          </Txt>
          <Txt nivel="titulo" estilo={estilos.tituloPrincipal}>
            Bottom Navigation Líquida
          </Txt>
          <Txt nivel="cuerpo" tono="tenue">
            Evaluación comparativa de tres direcciones de movimiento fluido para
            Passenger, preservando intacto el FAB amarillo central.
          </Txt>
        </View>

        {/* Conmutador de Esquema Claro / Oscuro */}
        <View style={[estilos.tarjetaOpciones, { backgroundColor: tema.color.superficie }]}>
          <Txt nivel="encabezado">Esquema de Color</Txt>
          <View style={estilos.filaOpciones}>
            <BotonSegmento
              activo={esquema === 'oscuro'}
              etiqueta="Noche (Oscuro)"
              onPress={() => setEsquema('oscuro')}
            />
            <BotonSegmento
              activo={esquema === 'claro'}
              etiqueta="Día (Claro)"
              onPress={() => setEsquema('claro')}
            />
          </View>
        </View>

        {/* Selector de Variante */}
        <View style={[estilos.tarjetaOpciones, { backgroundColor: tema.color.superficie }]}>
          <Txt nivel="encabezado">Variante Activa</Txt>
          <View style={estilos.columnaVariantes}>
            <BotonVariante
              activa={variante === 'liquid_track'}
              letra="A"
              nombre="Liquid Track"
              resumen="Carril elástico con masa líquida"
              onPress={() => setVariante('liquid_track')}
            />
            <BotonVariante
              activa={variante === 'wave_notch'}
              letra="B"
              nombre="Wave Notch"
              resumen="Deformación orgánica de superficie"
              onPress={() => setVariante('wave_notch')}
            />
            <BotonVariante
              activa={variante === 'fluid_underline'}
              letra="C"
              nombre="Fluid Underline"
              resumen="Línea base con inercia cabeza/cola"
              onPress={() => setVariante('fluid_underline')}
            />
          </View>
        </View>

        {/* Pruebas de Saltos Rápidos */}
        <View style={[estilos.tarjetaOpciones, { backgroundColor: tema.color.superficie }]}>
          <Txt nivel="encabezado">Pruebas de Salto y Cruce</Txt>
          <Txt nivel="pie" tono="tenue" estilo={{ marginBottom: 8 }}>
            Prueba cómo se comporta cada variante al saltar entre tabs contiguos y
            al cruzar por debajo del FAB central:
          </Txt>

          <View style={estilos.gridBotonesPrueba}>
            <BotonPrueba
              etiqueta="Inicio → Saldo"
              detalle="Cruza por debajo del FAB"
              onPress={() => ejecutarSalto('inicio', 'saldo', 'INICIO → SALDO')}
            />
            <BotonPrueba
              etiqueta="Saldo → Historial"
              detalle="Cruce inverso bajo FAB"
              onPress={() => ejecutarSalto('saldo', 'historial', 'SALDO → HISTORIAL')}
            />
            <BotonPrueba
              etiqueta="Historial → Perfil"
              detalle="Salto largo entre extremos"
              onPress={() => ejecutarSalto('historial', 'perfil', 'HISTORIAL → PERFIL')}
            />
            <BotonPrueba
              etiqueta="Inicio ↔ Perfil"
              detalle="Tránsito completo de la barra"
              onPress={() =>
                ejecutarSalto(
                  tabActivo === 'inicio' ? 'inicio' : 'perfil',
                  tabActivo === 'inicio' ? 'perfil' : 'inicio',
                  'INICIO ↔ PERFIL'
                )
              }
            />
          </View>
        </View>

        {/* Telemetría y Diagnóstico */}
        <View
          style={[
            estilos.tarjetaTelemetria,
            {
              backgroundColor: tema.color.superficieElevada,
              borderColor: tema.color.borde
            }
          ]}
        >
          <View style={estilos.filaTelemetria}>
            <Txt nivel="etiqueta" tono="tenue">
              TAB ACTIVO:
            </Txt>
            <Txt nivel="etiqueta" tono="acento">
              {tabActivo.toUpperCase()} (SLOT {obtenerIndiceSlot(tabActivo)})
            </Txt>
          </View>

          <View style={estilos.filaTelemetria}>
            <Txt nivel="etiqueta" tono="tenue">
              ÚLTIMO SALTO:
            </Txt>
            <Txt nivel="etiqueta">{ultimoSalto}</Txt>
          </View>

          <View style={estilos.filaTelemetria}>
            <Txt nivel="etiqueta" tono="tenue">
              CRUCE BAJO FAB:
            </Txt>
            <Txt nivel="etiqueta" tono={cruzoFab ? 'exito' : 'tenue'}>
              {cruzoFab ? 'SÍ (PASO FLUIDO BAJO DISCO)' : 'NO'}
            </Txt>
          </View>

          <View style={estilos.separadorTelemetria} />

          <Txt nivel="etiqueta" tono="acento">
            {descripcionVariante.titulo}
          </Txt>
          <Txt nivel="pie" tono="tenue" estilo={{ marginTop: 2 }}>
            {descripcionVariante.detalle}
          </Txt>
        </View>

        {/* Espacio para no chocar con la barra interactiva */}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Renderizado de la Barra según Variante Seleccionada */}
      <View style={estilos.posicionadorInferior}>
        {variante === 'liquid_track' && (
          <BarraVarianteLiquidTrack
            destinos={DESTINOS_PASAJERA}
            activo={tabActivo}
            alTocar={seleccionarTab}
            control={botonCentralFab}
          />
        )}
        {variante === 'wave_notch' && (
          <BarraVarianteWaveNotch
            destinos={DESTINOS_PASAJERA}
            activo={tabActivo}
            alTocar={seleccionarTab}
            control={botonCentralFab}
          />
        )}
        {variante === 'fluid_underline' && (
          <BarraVarianteFluidUnderline
            destinos={DESTINOS_PASAJERA}
            activo={tabActivo}
            alTocar={seleccionarTab}
            control={botonCentralFab}
          />
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes visuales de controles de laboratorio
// ---------------------------------------------------------------------------

function BotonSegmento({
  activo,
  etiqueta,
  onPress
}: {
  readonly activo: boolean;
  readonly etiqueta: string;
  readonly onPress: () => void;
}) {
  const tema = useTema();
  return (
    <Pressable
      onPress={onPress}
      style={[
        estilos.botonSegmento,
        {
          backgroundColor: activo ? tema.color.acento : 'transparent',
          borderColor: activo ? tema.color.acento : tema.color.borde
        }
      ]}
    >
      <Txt
        nivel="etiqueta"
        estilo={{
          color: activo ? tema.color.sobreAcento : tema.color.textoPrimario,
          fontWeight: activo ? '700' : '500'
        }}
      >
        {etiqueta}
      </Txt>
    </Pressable>
  );
}

function BotonVariante({
  activa,
  letra,
  nombre,
  resumen,
  onPress
}: {
  readonly activa: boolean;
  readonly letra: string;
  readonly nombre: string;
  readonly resumen: string;
  readonly onPress: () => void;
}) {
  const tema = useTema();
  return (
    <Pressable
      onPress={onPress}
      style={[
        estilos.itemVariante,
        {
          backgroundColor: activa
            ? `${tema.color.acento}15`
            : tema.color.superficieElevada,
          borderColor: activa ? tema.color.acento : tema.color.borde
        }
      ]}
    >
      <View
        style={[
          estilos.badgeLetra,
          {
            backgroundColor: activa ? tema.color.acento : `${tema.color.borde}88`
          }
        ]}
      >
        <Txt
          nivel="etiqueta"
          estilo={{
            color: activa ? tema.color.sobreAcento : tema.color.textoPrimario,
            fontWeight: '700'
          }}
        >
          {letra}
        </Txt>
      </View>
      <View style={{ flex: 1 }}>
        <Txt
          nivel="cuerpo"
          estilo={{
            fontWeight: activa ? '700' : '600',
            color: activa ? tema.color.textoPrimario : tema.color.textoSecundario
          }}
        >
          {nombre}
        </Txt>
        <Txt nivel="pie" tono="tenue">
          {resumen}
        </Txt>
      </View>
    </Pressable>
  );
}

function BotonPrueba({
  etiqueta,
  detalle,
  onPress
}: {
  readonly etiqueta: string;
  readonly detalle: string;
  readonly onPress: () => void;
}) {
  const tema = useTema();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        estilos.botonPrueba,
        {
          backgroundColor: pressed
            ? `${tema.color.acento}25`
            : tema.color.superficieElevada,
          borderColor: tema.color.borde
        }
      ]}
    >
      <Txt nivel="etiqueta" tono="acento" estilo={{ fontWeight: '700' }}>
        {etiqueta}
      </Txt>
      <Txt nivel="pie" tono="tenue">
        {detalle}
      </Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Estilos del laboratorio
// ---------------------------------------------------------------------------

const ALTO_FILA = 58;

const estilos = StyleSheet.create({
  contenedorPrincipal: {
    flex: 1
  },
  scrollArea: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 24,
    gap: 16
  },
  seccionCabecera: {
    gap: 6,
    marginBottom: 4
  },
  tituloPrincipal: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5
  },
  tarjetaOpciones: {
    padding: 16,
    borderRadius: 16,
    gap: 12
  },
  filaOpciones: {
    flexDirection: 'row',
    gap: 10
  },
  botonSegmento: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  columnaVariantes: {
    gap: 10
  },
  itemVariante: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12
  },
  badgeLetra: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  gridBotonesPrueba: {
    gap: 8
  },
  botonPrueba: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2
  },
  tarjetaTelemetria: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8
  },
  filaTelemetria: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  separadorTelemetria: {
    height: 1,
    backgroundColor: '#ffffff15',
    marginVertical: 4
  },
  posicionadorInferior: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0
  },
  contenedorBarra: {
    borderTopWidth: 1,
    paddingTop: 6
  },
  carrilGuia: {
    position: 'absolute',
    top: 14,
    left: 20,
    right: 20,
    height: 3,
    borderRadius: 1.5,
    borderWidth: 0.5
  },
  masaLiquida: {
    position: 'absolute',
    top: 13,
    width: 40,
    height: 5,
    borderRadius: 2.5
  },
  contenedorMuesca: {
    height: 20 + ALTO_FILA + 10,
    backgroundColor: 'transparent'
  },
  superficiePlana: {
    position: 'absolute',
    top: 18,
    right: 0,
    bottom: 0,
    left: 0,
    borderTopWidth: 1
  },
  crestaElevada: {
    position: 'absolute',
    top: 6,
    height: 28,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1
  },
  pistaDeSubrayado: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    height: 4
  },
  subrayadoLiquido: {
    position: 'absolute',
    bottom: 0,
    height: 4,
    borderRadius: 2
  },
  filaDeBotones: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  ranuraPestana: {
    flex: 1,
    minWidth: 48,
    height: ALTO_FILA,
    alignItems: 'center',
    justifyContent: 'center'
  },
  contenedorIcono: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconoSuperpuesto: {
    position: 'absolute'
  },
  ranuraCentral: {
    flex: 1,
    minWidth: 48,
    alignItems: 'center'
  }
});
