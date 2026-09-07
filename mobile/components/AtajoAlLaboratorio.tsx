/**
 * El acceso al laboratorio visual. SÓLO EN DESARROLLO.
 *
 * POR QUÉ EXISTE
 *
 * El laboratorio vive en `/preview`, y a una ruta de Expo Router no se llega
 * desde el teléfono si nada la enlaza: habría que escribir una dirección a
 * mano en Expo Go cada vez.
 *
 * La primera versión de esta puerta estaba sólo en la pantalla de «falta
 * configurar el servidor», y desaparecía en cuanto alguien creaba su `.env` —
 * justo cuando la aplicación empieza a funcionar y da más ganas de mirar el
 * diseño—. Ahora está donde se ve siempre.
 *
 * FUERA DE DESARROLLO NO EXISTE
 *
 * `__DEV__` es `false` en cualquier compilación de release, y entonces esto no
 * dibuja nada: ni el botón, ni un hueco. El propio laboratorio tiene además su
 * guarda, así que son dos cierres independientes.
 *
 * No lleva a ninguna operación real. El laboratorio no llama a ninguna API, no
 * toca la sesión y no escribe en el almacén seguro; hay pruebas que lo vigilan
 * fichero por fichero.
 */

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colores, espaciado, radios, tipografia } from '../theme/tokens';

/** `true` sólo cuando Metro sirve la aplicación. En release, `false`. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

export function AtajoAlLaboratorio() {
  if (!EN_DESARROLLO) return null;

  return (
    <>
      {/* El recorrido va PRIMERO: es la forma de mirar el diseño desde que la
          aplicación se puede recorrer de verdad. El laboratorio se queda debajo
          como herramienta —enseña las pantallas sueltas, sin navegación, que
          sigue siendo cómodo para comparar dos estados de la misma—. */}
      <Puerta
        a="/diseno"
        titulo="Recorrer la aplicación"
        nota="Navegación real con datos de ejemplo · sólo en desarrollo"
        testID="atajo-diseno"
      />
      <Puerta
        a="/preview"
        titulo="Laboratorio visual"
        nota="Las pantallas sueltas, sin navegación · sólo en desarrollo"
        testID="atajo-laboratorio"
      />
    </>
  );
}

function Puerta({ a, titulo, nota, testID }: {
  readonly a: string;
  readonly titulo: string;
  readonly nota: string;
  readonly testID: string;
}) {
  return (
    <Pressable
      onPress={() => { router.push(a as never); }}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. Sólo disponible en desarrollo`}
      testID={testID}
      style={({ pressed }) => [estilos.atajo, pressed && estilos.pulsado]}
    >
      <View style={estilos.punto} />
      <View style={estilos.textos}>
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={estilos.nota}>{nota}</Text>
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  atajo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.sm,
    marginTop: espaciado.lg,
    paddingVertical: espaciado.md,
    paddingHorizontal: espaciado.lg,
    borderRadius: radios.md,
    backgroundColor: colores.superficie,
    // Discontinuo no se puede en todas partes, así que la señal de «esto es de
    // desarrollo» es el borde tenue y el punto: se distingue de un botón de la
    // aplicación sin gritar.
    borderWidth: 1,
    borderColor: colores.borde,
    borderStyle: 'dashed'
  },
  pulsado: { borderColor: colores.acento },
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colores.acento
  },
  textos: { flex: 1, gap: 2 },
  titulo: {
    color: colores.textoPrimario,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto,
    fontWeight: '600'
  },
  nota: {
    color: colores.textoTenue,
    fontSize: tipografia.pie.tamano,
    lineHeight: tipografia.pie.alto
  }
});
