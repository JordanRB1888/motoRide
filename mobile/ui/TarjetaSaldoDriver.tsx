/**
 * Tarjeta de Saldo Driver de Alta Gama (+58Express).
 *
 * Inspirada en la dirección visual fintech/banking aprobada:
 * - Superficie en amarillo oficial con profundidad y formas abstractas circulares.
 * - Nivel 1: "SALDO DISPONIBLE" + "🛡 Transacción segura" con microinteracción Its Hover.
 * - Nivel 2: Monto protagonista en tipografía bold grafito + USD.
 * - Nivel 3: Equivalente en Bolívares y tasa referencial.
 * - Nivel 4: Botones con excelente touch target: "Ver datos de Pago Móvil" y "Registrar recarga".
 *
 * NO hardcodea cifras: consume los datos reales pasados por la pantalla.
 */

import { useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming
} from 'react-native-reanimated';

import { Txt } from './componentes';
import { IconoAnimado } from './IconoAnimado';
import { useTema } from '../theme/ThemeContext';
import { useMovimientoReducido } from './movimiento';

export interface PropiedadesTarjetaSaldoDriver {
  readonly balanceTexto: string;
  readonly moneda?: string;
  readonly equivalenteTexto?: string;
  readonly tasaTexto?: string;
  readonly deudor?: boolean;
  readonly deshabilitado?: boolean;
  readonly onVerPagoMovil?: () => void;
  readonly onRegistrarRecarga?: () => void;
}

export function TarjetaSaldoDriver({
  balanceTexto,
  moneda = 'USD',
  equivalenteTexto,
  tasaTexto,
  deudor = false,
  onVerPagoMovil,
  onRegistrarRecarga
}: PropiedadesTarjetaSaldoDriver) {
  const tema = useTema();
  const { width: anchoPantalla } = useWindowDimensions();
  const [escudoPulsado, setEscudoPulsado] = useState(false);
  const [pagoMovilPulsado, setPagoMovilPulsado] = useState(false);
  const [recargaPulsado, setRecargaPulsado] = useState(false);

  const esCompacto = anchoPantalla < 360;

  return (
    <View
      style={[
        estilos.tarjetaBase,
        {
          backgroundColor: deudor ? '#FEF2F2' : tema.color.acento,
          borderColor: deudor ? tema.color.peligro : 'rgba(0, 0, 0, 0.08)'
        }
      ]}
    >
      {/* Formas circulares abstractas y capas de luz/profundidad (acabado fintech premium) */}
      {!deudor && (
        <View pointerEvents="none" style={estilos.capaDecorativa}>
          {/* Luz superior tenue */}
          <View style={estilos.capaLuzSuperior} />
          {/* Resplandor ambiental superior derecho */}
          <View style={estilos.resplandorSuperiorDerecho} />
          {/* Profundidad suave inferior */}
          <View style={estilos.capaSombraInferior} />
          {/* Anillos concéntricos abstractos de alta precisión */}
          <View style={[estilos.circuloDecorativo, { width: 230, height: 230, right: -65, top: -45 }]} />
          <View style={[estilos.circuloDecorativo, { width: 330, height: 330, right: -115, top: -95 }]} />
          <View style={[estilos.circuloDecorativoInterno, { width: 140, height: 140, right: -20, top: -5 }]} />
        </View>
      )}

      {/* Nivel 1: Rótulo de Saldo Disponible + Transacción Segura */}
      <View style={estilos.filaSuperior}>
        <Txt
          nivel="etiqueta"
          estilo={[
            estilos.rotuloSaldo,
            { color: deudor ? tema.color.peligro : tema.color.sobreAcento }
          ]}
        >
          {deudor ? 'SALDO DEUDOR CON +58EXPRESS' : 'SALDO DISPONIBLE'}
        </Txt>

        <Pressable
          onPressIn={() => setEscudoPulsado(true)}
          onPressOut={() => setEscudoPulsado(false)}
          accessibilityRole="button"
          accessibilityLabel="Transacción segura garantizada por +58Express"
          hitSlop={8}
          style={estilos.badgeSeguridad}
        >
          <IconoAnimado
            nombre="escudo"
            color={deudor ? tema.color.peligro : tema.color.sobreAcento}
            tamano={14}
            reaccionando={escudoPulsado}
            variante="escudo"
          />
          <Txt
            nivel="pie"
            estilo={[
              estilos.textoSeguridad,
              { color: deudor ? tema.color.peligro : tema.color.sobreAcento }
            ]}
          >
            Transacción segura
          </Txt>
        </Pressable>
      </View>

      {/* Nivel 2: Monto Protagonista (Resiliente ante cifras grandes) */}
      <View style={estilos.filaMonto}>
        <Txt
          nivel="display"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.68}
          estilo={[
            estilos.montoHero,
            { color: deudor ? tema.color.peligro : tema.color.sobreAcento }
          ]}
        >
          {balanceTexto}
        </Txt>
        <Txt
          nivel="etiqueta"
          estilo={[
            estilos.monedaHero,
            { color: deudor ? tema.color.peligro : tema.color.sobreAcento }
          ]}
        >
          {moneda}
        </Txt>
      </View>

      {/* Nivel 3: Equivalencia en Bolívares y Tasa */}
      <View style={estilos.filaEquivalencia}>
        <Txt
          nivel="pie"
          estilo={[
            estilos.textoEquivalencia,
            { color: deudor ? tema.color.peligro : tema.color.sobreAcento }
          ]}
        >
          {deudor
            ? 'Recarga para volver a recibir viajes.'
            : `${equivalenteTexto ?? '≈ Bs. 0,00'} · Tasa referencial ${tasaTexto ?? 'BCV'}`}
        </Txt>
      </View>

      {/* Nivel 4: Acciones Fintech */}
      <View style={[estilos.filaAcciones, esCompacto && estilos.filaAccionesCompacto]}>
        {/* Botón Secundario: Ver datos de Pago Móvil */}
        <BotonAccionTarjeta
          titulo="Ver datos de Pago Móvil"
          icono="telefono"
          variante="secundario"
          reaccionando={pagoMovilPulsado}
          onPressIn={() => setPagoMovilPulsado(true)}
          onPressOut={() => setPagoMovilPulsado(false)}
          onPress={onVerPagoMovil}
          deudor={deudor}
        />

        {/* Botón Principal: Registrar recarga */}
        <BotonAccionTarjeta
          titulo="Registrar recarga"
          icono="mas"
          variante="principal"
          reaccionando={recargaPulsado}
          onPressIn={() => setRecargaPulsado(true)}
          onPressOut={() => setRecargaPulsado(false)}
          onPress={onRegistrarRecarga}
          deudor={deudor}
        />
      </View>
    </View>
  );
}

function BotonAccionTarjeta({
  titulo,
  icono,
  variante,
  reaccionando,
  onPressIn,
  onPressOut,
  onPress,
  deudor
}: {
  readonly titulo: string;
  readonly icono: 'telefono' | 'mas';
  readonly variante: 'principal' | 'secundario';
  readonly reaccionando: boolean;
  readonly onPressIn: () => void;
  readonly onPressOut: () => void;
  readonly onPress?: () => void;
  readonly deudor: boolean;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const pulsacion = useSharedValue(1);

  const esPrincipal = variante === 'principal';

  const estiloAnimado = useAnimatedStyle(() => ({
    transform: [{ scale: pulsacion.get() }]
  }));

  const manejarPressIn = () => {
    onPressIn();
    if (quieto) return;
    pulsacion.set(withTiming(0.95, { duration: 80 }));
  };

  const manejarPressOut = () => {
    onPressOut();
    if (quieto) return;
    pulsacion.set(withSpring(1, { duration: 160, dampingRatio: 0.88 }));
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={manejarPressIn}
      onPressOut={manejarPressOut}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      hitSlop={6}
      style={[
        estilos.botonAccionWrapper,
        esPrincipal ? estilos.botonPrincipal : estilos.botonSecundario,
        !esPrincipal && {
          borderColor: deudor ? tema.color.peligro : tema.color.sobreAcento
        }
      ]}
    >
      <Reanimated.View style={[estilos.contenidoBoton, estiloAnimado]}>
        <IconoAnimado
          nombre={icono}
          color={esPrincipal ? tema.color.acento : (deudor ? tema.color.peligro : tema.color.sobreAcento)}
          tamano={15}
          reaccionando={reaccionando}
          variante={icono === 'telefono' ? 'vibrar' : 'mas'}
        />
        <Txt
          nivel="etiqueta"
          estilo={[
            estilos.textoBoton,
            {
              color: esPrincipal
                ? tema.color.acento
                : (deudor ? tema.color.peligro : tema.color.sobreAcento),
              fontWeight: esPrincipal ? '700' : '600'
            }
          ]}
          numberOfLines={1}
        >
          {titulo}
        </Txt>
      </Reanimated.View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tarjetaBase: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    gap: 12
  },
  capaDecorativa: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  },
  capaLuzSuperior: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '52%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24
  },
  resplandorSuperiorDerecho: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.12)'
  },
  capaSombraInferior: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '35%',
    backgroundColor: 'rgba(0, 0, 0, 0.035)',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24
  },
  circuloDecorativo: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.22)'
  },
  circuloDecorativoInterno: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)'
  },
  filaSuperior: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2
  },
  rotuloSaldo: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    opacity: 0.88
  },
  badgeSeguridad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.06)'
  },
  textoSeguridad: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.92
  },
  filaMonto: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginVertical: 2,
    zIndex: 2,
    flexShrink: 1
  },
  montoHero: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 44,
    flexShrink: 1
  },
  monedaHero: {
    fontSize: 14,
    fontWeight: '800',
    opacity: 0.82
  },
  filaEquivalencia: {
    zIndex: 2,
    marginBottom: 4
  },
  textoEquivalencia: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '500',
    opacity: 0.85
  },
  filaAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 2,
    marginTop: 6
  },
  filaAccionesCompacto: {
    flexDirection: 'column',
    gap: 8
  },
  botonAccionWrapper: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  botonSecundario: {
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
    borderWidth: 1.5,
    borderColor: 'rgba(17, 24, 39, 0.85)'
  },
  botonPrincipal: {
    backgroundColor: '#111827',
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3
  },
  contenidoBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  textoBoton: {
    fontSize: 12.5,
    letterSpacing: -0.2
  }
});
