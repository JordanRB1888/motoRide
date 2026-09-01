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

import { useState, type ComponentType } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ProveedorDeTema, useControlDeTema } from '../theme/ThemeContext';
import { esquemaAutomatico, type Esquema } from '../theme/horaVenezuela';
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
import {
  C2Acceso,
  C2Arranque,
  C2ConductorEnLinea,
  C2ConductorFueraDeLinea,
  C2BuscandoAuto,
  C2BuscandoVehiculo,
  C2ConfirmarViaje,
  C2ElegirPuntoPasajera,
  C2ParaQuienEsElViaje,
  C2PanelDeJornada,
  C2PedirViaje,
  C2SelectorDeRol,
  C2Viaje
} from '../preview/pantallasC2';
import { C2Aliados, C2Comercio } from '../preview/pantallasAliados';
import { C2InicioPasajera } from '../preview/pantallaInicioPasajera';
import { C2Configuracion } from '../preview/pantallaConfiguracion';
import { C2SaldoConductorDeudor } from '../preview/pantallaSaldoConductor';
import { C2SaldoConductor, C2SaldoPasajera } from '../preview/pantallasSaldo';
import {
  C2Avisos,
  C2Ayuda,
  C2Historial,
  C2Perfil,
  C2Saldo,
  C2ViajeSeguro
} from '../preview/pantallasC2Secciones';

/** `true` sólo cuando Metro sirve la aplicación. En release, `false`. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

interface PantallaDelLaboratorio {
  readonly clave: string;
  readonly nombre: string;
  /** Se monta sin props: las que tenga han de traer valor por defecto. */
  readonly Componente: ComponentType;
}

/**
 * Un catálogo tiene siempre al menos una pantalla, y el tipo lo dice: así el
 * respaldo `pantallas[0]` no necesita una aserción para convencer al
 * compilador de algo que ya es cierto.
 */
type CatalogoDePantallas = readonly [PantallaDelLaboratorio, ...PantallaDelLaboratorio[]];

/**
 * Las pantallas de A, B y C: la composición original, con el mapa metido
 * dentro de una tarjeta. Se conservan tal cual para poder comparar contra C2.
 */
const PANTALLAS_ORIGINALES: CatalogoDePantallas = [
  { clave: 'arranque', nombre: 'Arranque', Componente: PreviewArranque },
  { clave: 'rol', nombre: 'Rol', Componente: PreviewSelectorDeRol },
  { clave: 'acceso', nombre: 'Acceso', Componente: PreviewAcceso },
  { clave: 'pasajera', nombre: 'Pasajera', Componente: PreviewInicioPasajera },
  { clave: 'destino', nombre: 'Destino', Componente: PreviewDestino },
  { clave: 'conductor', nombre: 'Conductor', Componente: PreviewInicioConductor },
  { clave: 'viaje', nombre: 'Viaje', Componente: PreviewViaje },
  { clave: 'perfil', nombre: 'Perfil', Componente: PreviewPerfil }
];

/**
 * Las de C2. Son OTRAS pantallas, no las mismas repintadas: el mapa pasa a ser
 * el suelo y aparecen estados que antes no existían —la hoja subida con el
 * selector de vehículo, elegir un punto en el mapa, el conductor conectado y
 * desconectado—.
 *
 * Por eso el laboratorio cambia de juego según la dirección activa: pulsando C
 * y luego C2 se ve exactamente qué cambia, que es la comparación que hay que
 * poder hacer para decidir.
 */
const PANTALLAS_C2: CatalogoDePantallas = [
  { clave: 'arranque', nombre: 'Arranque', Componente: C2Arranque },
  { clave: 'rol', nombre: 'Rol', Componente: C2SelectorDeRol },
  { clave: 'acceso', nombre: 'Acceso', Componente: C2Acceso },
  { clave: 'pasajera', nombre: 'Pasajera', Componente: C2InicioPasajera },
  { clave: 'pedir', nombre: 'Pedir viaje', Componente: C2PedirViaje },
  { clave: 'para-quien', nombre: '¿Para quién?', Componente: C2ParaQuienEsElViaje },
  { clave: 'punto', nombre: 'Elegir punto', Componente: C2ElegirPuntoPasajera },
  { clave: 'confirmar', nombre: 'Confirmar', Componente: C2ConfirmarViaje },
  { clave: 'buscando-moto', nombre: 'Buscando moto', Componente: C2BuscandoVehiculo },
  { clave: 'buscando-auto', nombre: 'Buscando auto', Componente: C2BuscandoAuto },
  { clave: 'conductor', nombre: 'Conductor', Componente: C2ConductorFueraDeLinea },
  { clave: 'conductor-online', nombre: 'Conductor en línea', Componente: C2ConductorEnLinea },
  { clave: 'jornada', nombre: 'Panel del disco', Componente: C2PanelDeJornada },
  { clave: 'saldo-conductor', nombre: 'Saldo conductor', Componente: C2SaldoConductor },
  { clave: 'saldo-pasajera', nombre: 'Saldo pasajera', Componente: C2SaldoPasajera },
  { clave: 'saldo-deuda', nombre: 'Saldo en deuda', Componente: C2SaldoConductorDeudor },
  { clave: 'viaje', nombre: 'Viaje', Componente: C2Viaje },
  { clave: 'aliados', nombre: 'Aliados', Componente: C2Aliados },
  { clave: 'comercio', nombre: 'Ficha de comercio', Componente: C2Comercio },
  // Las secciones: sin mapa, porque consultar un historial o leer un aviso no
  // pasa en ningún sitio. Mapa donde hay movimiento; lista donde hay que leer.
  { clave: 'historial', nombre: 'Historial', Componente: C2Historial },
  { clave: 'viaje-seguro', nombre: 'Viaje seguro', Componente: C2ViajeSeguro },
  { clave: 'perfil', nombre: 'Perfil', Componente: C2Perfil },
  { clave: 'saldo', nombre: 'Saldo', Componente: C2Saldo },
  { clave: 'avisos', nombre: 'Avisos', Componente: C2Avisos },
  { clave: 'ayuda', nombre: 'Ayuda', Componente: C2Ayuda },
  { clave: 'configuracion', nombre: 'Configuración', Componente: C2Configuracion }
];

export function catalogoDePantallas(clave: ClaveDeDireccion): CatalogoDePantallas {
  return clave === 'C2' ? PANTALLAS_C2 : PANTALLAS_ORIGINALES;
}

/**
 * Qué esquema enseña el laboratorio.
 *
 * `auto` deja que mande la hora de Venezuela, como en la aplicación. Los otros
 * dos la ignoran, y es lo que hace útil este selector: comparar día y noche a
 * las cuatro de la tarde sin tocar el reloj del teléfono.
 *
 * Esto NO toca la preferencia de la persona. Es una herramienta de revisión.
 */
type EsquemaDeLaboratorio = 'auto' | Esquema;

export default function LaboratorioVisual() {
  const [esquemaDePrueba, setEsquemaDePrueba] = useState<EsquemaDeLaboratorio>('auto');

  if (!EN_DESARROLLO) return <FueraDeDesarrollo />;

  return (
    <ProveedorDeTema esquemaForzado={esquemaDePrueba === 'auto' ? undefined : esquemaDePrueba}>
      <Laboratorio
        esquemaDePrueba={esquemaDePrueba}
        onCambiarEsquema={setEsquemaDePrueba}
      />
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

function Laboratorio({ esquemaDePrueba, onCambiarEsquema }: {
  readonly esquemaDePrueba: EsquemaDeLaboratorio;
  readonly onCambiarEsquema: (esquema: EsquemaDeLaboratorio) => void;
}) {
  const { clave, cambiarDireccion } = useControlDeTema();
  const [pantalla, setPantalla] = useState<string>('rol');

  const pantallas = catalogoDePantallas(clave);
  // Al cambiar de direccion puede desaparecer la pantalla que se estaba viendo
  // -- «Perfil» no existe en C2, «Elegir punto» no existe en C --. En vez de
  // dejar la pantalla en blanco, se cae al selector de rol, que existe en las
  // dos.
  const actual = pantallas.find(item => item.clave === pantalla) ?? pantallas[0];
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

          {/* La salida.
              Al laboratorio se puede llegar por la ruta /preview —y entonces
              hay a dónde volver— o montado directamente desde la pantalla de
              configuración faltante, donde el router ni existe. Por eso se
              pregunta antes: sin esta comprobación, salir desde el segundo caso
              reventaría. */}
          {router.canGoBack() ? (
            <Pressable
              onPress={() => { router.back(); }}
              accessibilityRole="button"
              accessibilityLabel="Salir del laboratorio visual"
              testID="salir-laboratorio"
              style={estilos.salir}
            >
              <Text style={estilos.salirTexto}>Salir</Text>
            </Pressable>
          ) : null}
        </View>

        {/* El selector de esquema. Va junto al de dirección porque son las dos
            cosas que se comparan, y separado por una línea para que no parezca
            que la dirección tiene seis letras. */}
        <View style={estilos.selectorEsquema}>
          {([
            ['auto', 'Auto'],
            ['claro', 'Día'],
            ['oscuro', 'Noche']
          ] as const).map(([valor, etiqueta]) => {
            const activo = valor === esquemaDePrueba;
            return (
              <Pressable
                key={valor}
                onPress={() => onCambiarEsquema(valor)}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                accessibilityLabel={`Ver en modo ${etiqueta.toLowerCase()}`}
                style={[estilos.chipEsquema, activo && estilos.chipEsquemaActivo]}
                testID={`preview-esquema-${valor}`}
              >
                <Text style={[estilos.chipEsquemaTexto, activo && estilos.chipEsquemaTextoActivo]}>
                  {etiqueta}
                </Text>
              </Pressable>
            );
          })}
          <Text style={estilos.notaEsquema}>
            {esquemaDePrueba === 'auto'
              ? `Ahora en Venezuela: ${esquemaAutomatico(new Date()) === 'claro' ? 'día' : 'noche'}`
              : 'Forzado sólo para revisar'}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.pantallas}>
          {pantallas.map(item => {
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

  salir: {
    paddingVertical: 7, paddingHorizontal: 13, borderRadius: 8,
    backgroundColor: '#2a2a2a'
  },
  salirTexto: { color: '#dddddd', fontSize: 12, fontWeight: '600' },

  selectorEsquema: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingTop: 2
  },
  chipEsquema: {
    paddingVertical: 5, paddingHorizontal: 11, borderRadius: 7,
    backgroundColor: '#222222', borderWidth: 1, borderColor: '#333333'
  },
  chipEsquemaActivo: { backgroundColor: '#3a3a3a', borderColor: '#585858' },
  chipEsquemaTexto: { color: '#9a9a9a', fontSize: 11, fontWeight: '600' },
  chipEsquemaTextoActivo: { color: '#ffffff' },
  notaEsquema: { color: '#6e6e6e', fontSize: 10, marginLeft: 4, flex: 1 },

  pantallas: { paddingHorizontal: 12 },
  chip: {
    paddingVertical: 7, paddingHorizontal: 13, borderRadius: 8,
    backgroundColor: '#222222', marginRight: 7
  },
  chipActivo: { backgroundColor: '#3a3a3a' },
  chipTexto: { color: '#999999', fontSize: 12, fontWeight: '500' },
  chipTextoActivo: { color: '#ffffff' }
});
