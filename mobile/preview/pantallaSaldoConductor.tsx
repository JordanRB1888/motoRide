/**
 * El saldo del conductor: su cuenta operativa.
 *
 * ES LA PANTALLA QUE YA EXISTE, CON LA CARA DE C2
 *
 * La estructura sale de `src/pages/driver/earnings.js`, que es lo que hay hoy
 * en producción. No se ha inventado ninguna sección:
 *
 *   · el balance disponible en grande, con su equivalente en bolívares
 *   · recargar saldo operativo y solicitar liquidación
 *   · los movimientos de la cuenta, con sus cuatro tipos
 *
 * Y los cuatro tipos son los mismos que ya maneja: ganancia acreditada,
 * comisión de +58express, recarga y liquidación.
 *
 * EL SALDO DEUDOR NO ES UN DETALLE
 *
 * En este modelo el conductor cobra en efectivo y la plataforma le descuenta su
 * parte de la cuenta operativa, así que el balance PUEDE QUEDAR EN NEGATIVO. Y
 * cuando queda en negativo deja de recibir viajes hasta que recargue.
 *
 * Por eso el estado deudor no es «el mismo número con un menos delante»: cambia
 * el rótulo, cambia el color, y el texto pasa de informar a decir qué hay que
 * hacer. Alguien que no puede trabajar hasta recargar necesita leer eso, no
 * deducirlo de un signo.
 *
 * LAS CIFRAS VAN A CERO
 *
 * La cartera está apagada en el servidor. La estructura está entera —se ve
 * exactamente cómo será— y ningún número es inventado. Un saldo creíble en una
 * captura acaba citado como si fuera el dinero de alguien.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Txt } from '../ui/componentes';
import { TarjetaSaldoDriver } from '../ui/TarjetaSaldoDriver';
import { type NombreDeIcono } from '../ui/Icono';
import { IconoAnimado, type VarianteDeMovimientoDeIcono } from '../ui/IconoAnimado';
import { Separador } from '../ui/HojaInferior';
import { BarraDeNavegacion, ControlDeDisponibilidad, DESTINOS_DE_CONDUCTOR } from '../ui/Navegacion';
import { useApariencia, useTema } from '../theme/ThemeContext';
import { useAireDeArriba } from '../ui/seguro';
import { MOVIMIENTOS_DEMO, TASA_DEMO } from './fixtures';

/**
 * Lo que se lleva la barra inferior, para que el contenido no acabe debajo.
 *
 * 10 de relleno superior + 23 de icono + 4 de hueco + 17 de etiqueta + 22 de
 * franja del sistema. Antes el relleno era de 24 puntos y las últimas filas de
 * cada lista quedaban tapadas: ni se leían ni se podían tocar.
 */
const ALTO_DE_LA_BARRA = 76;

type Filtro = 'todos' | 'comisiones' | 'recargas';

const FILTROS: readonly { readonly clave: Filtro; readonly etiqueta: string }[] = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'comisiones', etiqueta: 'Comisiones' },
  { clave: 'recargas', etiqueta: 'Recargas' }
];

/** Qué tipos entran en cada filtro. */
const TIPOS_POR_FILTRO: Readonly<Record<Filtro, readonly string[]>> = {
  todos: ['GANANCIA', 'COMISION', 'RECARGA', 'LIQUIDACION'],
  comisiones: ['COMISION'],
  recargas: ['RECARGA', 'LIQUIDACION']
};

interface DetalleVisualMovimiento {
  readonly icono: NombreDeIcono;
  readonly variante: VarianteDeMovimientoDeIcono;
  readonly colorIcono: string;
  readonly fondo: (esNoche: boolean) => string;
  readonly borde: (esNoche: boolean) => string;
}

/**
 * Cada movimiento con su iconografía dinámica, llamativa y en movimiento.
 *
 * Ganancia (verde esmeralda / giro), comisión (coral / elevación),
 * recarga (ámbar eléctrico / deslizamiento) y liquidación (azul tecnológico / pulso).
 */
const CONFIG_MOVIMIENTOS: Readonly<Record<string, DetalleVisualMovimiento>> = {
  GANANCIA: {
    icono: 'moto',
    variante: 'girar',
    colorIcono: '#10B981',
    fondo: esNoche => esNoche ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.12)',
    borde: esNoche => esNoche ? 'rgba(16, 185, 129, 0.32)' : 'rgba(16, 185, 129, 0.22)'
  },
  COMISION: {
    icono: 'dolar',
    variante: 'elevar',
    colorIcono: '#EF4444',
    fondo: esNoche => esNoche ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.10)',
    borde: esNoche => esNoche ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.20)'
  },
  RECARGA: {
    icono: 'rayo',
    variante: 'deslizar',
    colorIcono: '#F59E0B',
    fondo: esNoche => esNoche ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.12)',
    borde: esNoche => esNoche ? 'rgba(245, 158, 11, 0.38)' : 'rgba(245, 158, 11, 0.24)'
  },
  LIQUIDACION: {
    icono: 'viajes',
    variante: 'pulso',
    colorIcono: '#3B82F6',
    fondo: esNoche => esNoche ? 'rgba(59, 130, 246, 0.16)' : 'rgba(59, 130, 246, 0.12)',
    borde: esNoche => esNoche ? 'rgba(59, 130, 246, 0.32)' : 'rgba(59, 130, 246, 0.20)'
  }
};

function FilaMovimiento({
  movimiento,
  indice,
  esNoche,
  tema
}: {
  readonly movimiento: typeof MOVIMIENTOS_DEMO[number];
  readonly indice: number;
  readonly esNoche: boolean;
  readonly tema: ReturnType<typeof useTema>;
}) {
  const [pulsado, setPulsado] = useState(false);
  const [activoIntro, setActivoIntro] = useState(false);

  useEffect(() => {
    // Cascada de movimiento al entrar a la pantalla para los iconos
    const timeoutId = setTimeout(() => {
      setActivoIntro(true);
      const finId = setTimeout(() => setActivoIntro(false), 380);
      return () => clearTimeout(finId);
    }, 180 + indice * 90);
    return () => clearTimeout(timeoutId);
  }, [indice]);

  const cfg: DetalleVisualMovimiento = CONFIG_MOVIMIENTOS[movimiento.tipo] ?? CONFIG_MOVIMIENTOS.GANANCIA ?? {
    icono: 'moto',
    variante: 'girar',
    colorIcono: '#10B981',
    fondo: () => 'rgba(16, 185, 129, 0.16)',
    borde: () => 'rgba(16, 185, 129, 0.32)'
  };
  const reaccionando = pulsado || activoIntro;

  return (
    <Pressable
      onPressIn={() => setPulsado(true)}
      onPressOut={() => setPulsado(false)}
      accessibilityRole="button"
      accessibilityLabel={`${movimiento.titulo}, ${movimiento.detalle}, ${movimiento.importe}, ${movimiento.estado}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 14,
        backgroundColor: pressed
          ? (esNoche ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)')
          : 'transparent',
        transform: [{ scale: pressed ? 0.988 : 1 }]
      })}
    >
      <View style={{
        width: 44,
        height: 44,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: cfg.fondo(esNoche),
        borderWidth: 1.5,
        borderColor: cfg.borde(esNoche)
      }}>
        <IconoAnimado
          nombre={cfg.icono}
          color={cfg.colorIcono}
          tamano={21}
          reaccionando={reaccionando}
          variante={cfg.variante}
        />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Txt nivel="cuerpo" estilo={{ fontWeight: '600', fontSize: 15 } as never}>
          {movimiento.titulo}
        </Txt>
        <Txt nivel="pie" tono="tenue" numberOfLines={1}>
          {movimiento.detalle}
        </Txt>
        <Txt nivel="pie" tono="tenue">
          {movimiento.cuando}
        </Txt>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Txt
          nivel="cuerpo"
          estilo={{
            fontWeight: '700',
            fontSize: 15,
            color: movimiento.importe.startsWith('−')
              ? (esNoche ? '#F87171' : tema.color.peligro)
              : (esNoche ? '#34D399' : tema.color.exito)
          } as never}
        >
          {movimiento.importe}
        </Txt>
        <Txt nivel="pie" tono="tenue">{movimiento.estado}</Txt>
      </View>
    </Pressable>
  );
}

export function C2SaldoConductor({
  deudor = false,
  control
}: {
  readonly deudor?: boolean;
  readonly control?: React.ReactNode;
}) {
  const tema = useTema();
  const { esquema } = useApariencia();
  const esNoche = esquema === 'oscuro';
  const arriba = useAireDeArriba();
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const permitidos = TIPOS_POR_FILTRO[filtro];
  const visibles = MOVIMIENTOS_DEMO.filter(movimiento => permitidos.includes(movimiento.tipo));

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 18 + arriba,
        paddingBottom: tema.ritmo.entreElementos,
        paddingHorizontal: tema.ritmo.margenPantalla
      }}>
        <Txt nivel="titulo" accessibilityRole="header">Tu saldo</Txt>
        <View style={{ flex: 1 }} />
        <Txt nivel="pie" tono="tenue">Tasa BCV · {TASA_DEMO.valor}</Txt>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingBottom: tema.ritmo.entreBloques + ALTO_DE_LA_BARRA
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Tarjeta de Saldo Fintech para Conductor (según referencia aprobada) */}
        <TarjetaSaldoDriver
          balanceTexto={deudor ? '−$0,00' : '$0,00'}
          moneda="USD"
          equivalenteTexto={deudor ? 'SALDO DEUDOR CON +58EXPRESS' : `≈ ${TASA_DEMO.valor}`}
          tasaTexto={deudor ? 'Recarga para volver a recibir viajes.' : 'BCV'}
          deudor={deudor}
          deshabilitado={deudor}
          onVerPagoMovil={() => undefined}
          onRegistrarRecarga={() => undefined}
        />

        <Txt nivel="pie" tono="tenue" centrado estilo={{ marginTop: 8 } as never}>
          La cartera todavía no está encendida en el servidor: las cifras se
          muestran en cero a propósito.
        </Txt>

        {/* Nota de negocio: el porcentaje lo fija +58express en su configuración. */}

        <View style={{ marginTop: tema.ritmo.entreBloques }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt nivel="encabezado">Movimientos</Txt>
            <View style={{ flex: 1 }} />
            <Txt nivel="pie" tono="tenue">{visibles.length} registros</Txt>
          </View>

          {/* Filtros: «Comisiones» está porque es lo que más se revisa —saber
              qué te descontaron y por qué viaje—. */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: tema.ritmo.entreElementos }}>
            {FILTROS.map(opcion => {
              const activo = opcion.clave === filtro;
              return (
                <Pressable
                  key={opcion.clave}
                  onPress={() => setFiltro(opcion.clave)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activo }}
                  accessibilityLabel={`Ver ${opcion.etiqueta.toLowerCase()}`}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: activo ? tema.color.superficieElevada : 'transparent',
                    borderWidth: 1,
                    borderColor: activo ? tema.color.acento : tema.color.borde
                  }}
                >
                  <Txt nivel="etiqueta" tono={activo ? 'acento' : 'tenue'}>{opcion.etiqueta}</Txt>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 8 }}>
            {visibles.map((movimiento, indice) => (
              <View key={movimiento.clave}>
                {indice > 0 ? <Separador /> : null}
                <FilaMovimiento
                  movimiento={movimiento}
                  indice={indice}
                  esNoche={esNoche}
                  tema={tema}
                />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_CONDUCTOR}
        activo="saldo"
        control={control ?? <ControlDeDisponibilidad enLinea={false} />}
      />
    </View>
  );
}

/** El mismo saldo, en negativo: el conductor debe y no recibe viajes. */
export function C2SaldoConductorDeudor() {
  return <C2SaldoConductor deudor />;
}
