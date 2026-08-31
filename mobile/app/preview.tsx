/**
 * El laboratorio visual. SÓLO EN DESARROLLO.
 *
 * Existe para que el dueño pueda ver las tres direcciones con los MISMOS datos
 * y decidir cuál es la cara definitiva de +58express.
 *
 * POR QUÉ NO PUEDE LLEGAR A UNA VERSIÓN PUBLICADA
 *
 * Enseña datos de demostración —una jornada, un viaje, un saldo— que no salen de
 * ninguna API. En manos de alguien que crea estar viendo su cuenta, eso es
 * información falsa presentada como verdadera.
 *
 * `__DEV__` es `false` en cualquier compilación de release, así que fuera de
 * desarrollo esta ruta no enseña nada: devuelve un aviso y no monta ni una sola
 * pantalla de preview. Hay una prueba que comprueba la guarda.
 *
 * Y no ejecuta nada: ni autenticación, ni red, ni operaciones financieras. Los
 * botones no llevan a ningún sitio a propósito.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ProveedorDeTema, useControlDeTema } from '../theme/ThemeContext';
import { CATALOGO, DIRECCIONES, type ClaveDeDireccion } from '../theme/directions';
import {
  PreviewAcceso,
  PreviewArranque,
  PreviewDestino,
  PreviewInicioConductor,
  PreviewInicioPasajera,
  PreviewPerfil,
  PreviewSelectorDeRol,
  PreviewViaje
} from '../preview/pantallas';

/** `true` sólo cuando Metro sirve la aplicación. En release, `false`. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

const PANTALLAS = [
  { clave: 'arranque', nombre: 'Arranque', Componente: PreviewArranque },
  { clave: 'rol', nombre: 'Rol', Componente: PreviewSelectorDeRol },
  { clave: 'acceso', nombre: 'Acceso', Componente: PreviewAcceso },
  { clave: 'pasajera', nombre: 'Pasajera', Componente: PreviewInicioPasajera },
  { clave: 'destino', nombre: 'Destino', Componente: PreviewDestino },
  { clave: 'conductor', nombre: 'Conductor', Componente: PreviewInicioConductor },
  { clave: 'viaje', nombre: 'Viaje', Componente: PreviewViaje },
  { clave: 'perfil', nombre: 'Perfil', Componente: PreviewPerfil }
] as const;

export default function LaboratorioVisual() {
  if (!EN_DESARROLLO) return <FueraDeDesarrollo />;
  return (
    <ProveedorDeTema>
      <Laboratorio />
    </ProveedorDeTema>
  );
}

function FueraDeDesarrollo() {
  return (
    <View style={estilos.bloqueado} testID="preview-bloqueada">
      <Text style={estilos.bloqueadoTexto}>
        El laboratorio visual sólo está disponible en desarrollo.
      </Text>
    </View>
  );
}

function Laboratorio() {
  const { clave, cambiarDireccion } = useControlDeTema();
  const [pantalla, setPantalla] = useState<string>('rol');

  const actual = PANTALLAS.find(item => item.clave === pantalla) ?? PANTALLAS[1];
  const direccion = CATALOGO[clave];

  return (
    <View style={estilos.raiz}>
      <StatusBar style="light" />

      {/* La pantalla, ocupando lo que ocuparía de verdad. */}
      <View style={estilos.lienzo}>
        <SafeAreaView style={estilos.seguro} edges={['top', 'bottom']}>
          <actual.Componente />
        </SafeAreaView>
      </View>

      {/* Los controles del laboratorio. No forman parte del diseño: van en gris
          neutro para no contaminar la percepción de la dirección que se evalúa. */}
      <View style={estilos.controles}>
        <View style={estilos.selectorDireccion}>
          {DIRECCIONES.map(letra => {
            const activa = letra === clave;
            return (
              <Pressable
                key={letra}
                onPress={() => cambiarDireccion(letra as ClaveDeDireccion)}
                accessibilityRole="button"
                accessibilityState={{ selected: activa }}
                accessibilityLabel={`Dirección ${letra}: ${CATALOGO[letra].nombre}`}
                style={[estilos.botonDireccion, activa && estilos.botonDireccionActivo]}
                testID={`preview-direccion-${letra}`}
              >
                <Text style={[estilos.letra, activa && estilos.letraActiva]}>{letra}</Text>
              </Pressable>
            );
          })}
          <View style={estilos.descripcion}>
            <Text style={estilos.nombreDireccion}>{direccion.nombre}</Text>
            <Text style={estilos.caracter} numberOfLines={2}>{direccion.caracter}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.pantallas}>
          {PANTALLAS.map(item => {
            const activa = item.clave === pantalla;
            return (
              <Pressable
                key={item.clave}
                onPress={() => setPantalla(item.clave)}
                accessibilityRole="button"
                accessibilityState={{ selected: activa }}
                style={[estilos.chip, activa && estilos.chipActivo]}
                testID={`preview-pantalla-${item.clave}`}
              >
                <Text style={[estilos.chipTexto, activa && estilos.chipTextoActivo]}>
                  {item.nombre}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#000000' },
  lienzo: { flex: 1 },
  seguro: { flex: 1 },
  bloqueado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0e0d0b' },
  bloqueadoTexto: { color: '#a3a09a', fontSize: 15, textAlign: 'center' },

  controles: {
    backgroundColor: '#141414',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    paddingTop: 10,
    paddingBottom: 22,
    gap: 10
  },
  selectorDireccion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  botonDireccion: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#222222', borderWidth: 1, borderColor: '#333333'
  },
  botonDireccionActivo: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  letra: { color: '#999999', fontSize: 15, fontWeight: '700' },
  letraActiva: { color: '#111111' },
  descripcion: { flex: 1, marginLeft: 4 },
  nombreDireccion: { color: '#eeeeee', fontSize: 13, fontWeight: '600' },
  caracter: { color: '#8a8a8a', fontSize: 11, lineHeight: 15 },

  pantallas: { paddingHorizontal: 12 },
  chip: {
    paddingVertical: 7, paddingHorizontal: 13, borderRadius: 8,
    backgroundColor: '#222222', marginRight: 7
  },
  chipActivo: { backgroundColor: '#3a3a3a' },
  chipTexto: { color: '#999999', fontSize: 12, fontWeight: '500' },
  chipTextoActivo: { color: '#ffffff' }
});
