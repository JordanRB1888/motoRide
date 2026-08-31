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

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Boton, Insignia, Txt } from '../ui/componentes';
import { Icono, type NombreDeIcono } from '../ui/Icono';
import { Separador } from '../ui/HojaInferior';
import { BarraDeNavegacion, ControlDeDisponibilidad, DESTINOS_DE_CONDUCTOR } from '../ui/Navegacion';
import { useTema } from '../theme/ThemeContext';
import { MOVIMIENTOS_DEMO, TASA_DEMO } from './fixtures';

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

const ICONO_POR_TIPO: Readonly<Record<string, NombreDeIcono>> = {
  GANANCIA: 'rayo',
  COMISION: 'escudo',
  RECARGA: 'inicio',
  LIQUIDACION: 'viajes'
};

export function C2SaldoConductor({ deudor = false }: { readonly deudor?: boolean }) {
  const tema = useTema();
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const permitidos = TIPOS_POR_FILTRO[filtro];
  const visibles = MOVIMIENTOS_DEMO.filter(movimiento => permitidos.includes(movimiento.tipo));

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 18,
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
          paddingBottom: tema.ritmo.entreBloques
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* El saldo, en grande. Es lo primero que se mira al abrir esto. */}
        <View style={{
          padding: tema.ritmo.dentroDeTarjeta,
          borderRadius: tema.radio.tarjeta,
          backgroundColor: tema.color.superficie,
          gap: tema.ritmo.entreElementos,
          overflow: 'hidden',
          // En deuda el borde rojo se ve antes que cualquier texto.
          borderWidth: deudor ? 1 : 0,
          borderColor: tema.color.peligro
        }}>
          {/* El filo: en esta pantalla, el saldo es la zona que manda. */}
          <View style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
            backgroundColor: deudor ? tema.color.peligro : tema.color.acento
          }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt nivel="etiqueta" tono={deudor ? 'secundario' : 'secundario'}>
              {deudor ? 'SALDO DEUDOR CON +58EXPRESS' : 'BALANCE DISPONIBLE'}
            </Txt>
            <View style={{ flex: 1 }} />
            <Insignia texto="0 viajes" />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            <Txt
              nivel="display"
              tono={deudor ? 'primario' : 'acento'}
              estilo={{ color: deudor ? tema.color.peligro : tema.color.acento } as never}
            >
              {deudor ? '−$0,00' : '$0,00'}
            </Txt>
            <Txt nivel="cuerpo" tono="tenue" estilo={{ paddingBottom: 5 } as never}>USD</Txt>
          </View>

          <Txt nivel="pie" tono="tenue">
            {deudor
              ? 'Recarga para volver a recibir viajes.'
              : `≈ ${TASA_DEMO.valor} · tasa referencial del BCV`}
          </Txt>

          <View style={{ gap: tema.ritmo.entreElementos }}>
            <Boton titulo="Recargar saldo" onPress={() => undefined} />
            <Boton
              titulo="Solicitar liquidación"
              variante="secundario"
              onPress={() => undefined}
              deshabilitado={deudor}
            />
          </View>

          <Txt nivel="pie" tono="tenue">
            La cartera todavía no está encendida en el servidor: las cifras se
            muestran en cero a propósito.
          </Txt>
        </View>

        {/* Cómo se reparte cada viaje. Es la duda más frecuente de quien
            conduce, y tenerla aquí evita buscarla en otro sitio. */}
        <View style={{
          marginTop: tema.ritmo.entreBloques,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: tema.radio.campo,
          backgroundColor: tema.color.superficie
        }}>
          <Icono nombre="escudo" color={tema.color.textoSecundario} tamano={18} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt nivel="cuerpo">Cómo se reparte cada viaje</Txt>
            <Txt nivel="pie" tono="tenue">
              Tu parte se acredita y la comisión se descuenta de esta cuenta. El
              porcentaje lo fija +58express en su configuración.
            </Txt>
          </View>
        </View>

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

          <View style={{ marginTop: 4 }}>
            {visibles.map((movimiento, indice) => (
              <View key={movimiento.clave}>
                {indice > 0 ? <Separador /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: movimiento.tipo === 'COMISION'
                      ? `${tema.color.peligro}1f`
                      : tema.color.superficieElevada
                  }}>
                    <Icono
                      nombre={ICONO_POR_TIPO[movimiento.tipo] ?? 'viajes'}
                      color={movimiento.tipo === 'COMISION' ? tema.color.peligro : tema.color.textoSecundario}
                      tamano={18}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt nivel="cuerpo">{movimiento.titulo}</Txt>
                    <Txt nivel="pie" tono="tenue" numberOfLines={1}>{movimiento.detalle}</Txt>
                    <Txt nivel="pie" tono="tenue">{movimiento.cuando}</Txt>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Txt
                      nivel="cuerpo"
                      estilo={{
                        color: movimiento.importe.startsWith('−')
                          ? tema.color.textoSecundario
                          : tema.color.exito
                      } as never}
                    >
                      {movimiento.importe}
                    </Txt>
                    <Txt nivel="pie" tono="tenue">{movimiento.estado}</Txt>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <BarraDeNavegacion
        destinos={DESTINOS_DE_CONDUCTOR}
        activo="saldo"
        control={<ControlDeDisponibilidad enLinea />}
      />
    </View>
  );
}

/** El mismo saldo, en negativo: el conductor debe y no recibe viajes. */
export function C2SaldoConductorDeudor() {
  return <C2SaldoConductor deudor />;
}
