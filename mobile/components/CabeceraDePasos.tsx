/**
 * La cabecera del formulario de postulación: título, cierre y los cuatro pasos.
 *
 * Es la estructura que el dueño eligió, la misma del formulario web: un
 * encabezado con el rótulo pequeño y el título grande, una equis para salir, y
 * debajo la fila de pasos numerados. Cada paso se dibuja según en qué punto
 * está: el actual con su número en amarillo, los ya hechos con una marca, y
 * los que faltan en gris.
 *
 * Aquí no se decide nada: quién es el paso actual y cuáles están hechos lo
 * dice el dominio (`avanceDeLaPostulacion`). Esto sólo lo pinta.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TITULOS, type Paso } from '../domain/postulacion';
import { useTema } from '../theme/ThemeContext';
import { espaciado, radios, tipografia } from '../theme/tokens';

export interface PropiedadesDeCabecera {
  readonly paso: Paso;
  /** Los que ya están completos. Salen con marca. */
  readonly hechos: readonly Paso[];
  /** Qué hace la equis. Sin ella, no se dibuja. */
  readonly onCerrar?: () => void;
  readonly testID?: string;
}

export function CabeceraDePasos({ paso, hechos, onCerrar, testID }: PropiedadesDeCabecera) {
  const tema = useTema();
  const estilos = useMemo(() => crearEstilos(tema.color), [tema.color]);

  return (
    <View style={estilos.raiz} testID={testID}>
      <View style={estilos.encabezado}>
        <View style={estilos.textos}>
          <Text style={estilos.rotulo}>SOLICITUD DE CONDUCTOR</Text>
          <Text style={estilos.titulo}>Trabaja con +58Express</Text>
        </View>
        {onCerrar ? (
          <Pressable
            onPress={onCerrar}
            accessibilityRole="button"
            accessibilityLabel="Salir de la solicitud"
            hitSlop={12}
            style={({ pressed }) => [estilos.cierre, pressed ? estilos.cierrePresionado : null]}
            testID="postulacion-cerrar"
          >
            <Text style={estilos.equis}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={estilos.pasos}
        accessibilityRole="tablist"
      >
        {TITULOS.map((item, indice) => {
          const actual = item.paso === paso;
          const hecho = hechos.includes(item.paso) && !actual;
          return (
            <View key={item.paso} style={estilos.paso} accessibilityRole="tab" accessibilityState={{ selected: actual }}>
              <View style={[estilos.numero, actual ? estilos.numeroActual : hecho ? estilos.numeroHecho : null]}>
                <Text style={[estilos.numeroTexto, actual ? estilos.numeroTextoActual : hecho ? estilos.numeroTextoHecho : null]}>
                  {hecho ? '✓' : indice + 1}
                </Text>
              </View>
              <Text style={[estilos.etiqueta, actual ? estilos.etiquetaActual : null]} numberOfLines={1}>
                {ETIQUETAS[item.paso]}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** El nombre corto de cada paso en la fila. El largo va en el cuerpo. */
const ETIQUETAS: Readonly<Record<Paso, string>> = Object.freeze({
  personal: 'Personal',
  vehiculo: 'Vehículo',
  documentos: 'Documentos',
  confirmacion: 'Confirmación'
});

const crearEstilos = (c: ReturnType<typeof useTema>['color']) => StyleSheet.create({
  raiz: { borderBottomWidth: 1, borderBottomColor: c.borde, backgroundColor: c.superficieHundida },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espaciado.md,
    paddingHorizontal: espaciado.lg,
    paddingTop: espaciado.lg,
    paddingBottom: espaciado.md
  },
  textos: { flex: 1, gap: 2 },
  rotulo: {
    color: c.acento,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.2
  },
  titulo: {
    color: c.textoPrimario,
    fontSize: tipografia.titulo.tamano,
    lineHeight: tipografia.titulo.alto,
    fontWeight: '700'
  },
  cierre: {
    width: 40,
    height: 40,
    borderRadius: radios.completo,
    borderWidth: 1,
    borderColor: c.borde,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.superficie
  },
  cierrePresionado: { backgroundColor: c.superficieElevada },
  equis: { color: c.textoSecundario, fontSize: 18, lineHeight: 22 },
  pasos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.lg,
    paddingHorizontal: espaciado.lg,
    paddingBottom: espaciado.md
  },
  paso: { flexDirection: 'row', alignItems: 'center', gap: espaciado.sm },
  numero: {
    width: 26,
    height: 26,
    borderRadius: radios.completo,
    borderWidth: 1,
    borderColor: c.borde,
    alignItems: 'center',
    justifyContent: 'center'
  },
  numeroActual: { borderColor: c.acento, backgroundColor: c.acento },
  numeroHecho: { borderColor: c.exito },
  numeroTexto: { color: c.textoTenue, fontSize: 13, fontWeight: '700' },
  numeroTextoActual: { color: c.sobreAcento },
  numeroTextoHecho: { color: c.exito },
  etiqueta: { color: c.textoTenue, fontSize: tipografia.pie.tamano, fontWeight: '600' },
  etiquetaActual: { color: c.textoPrimario }
});
