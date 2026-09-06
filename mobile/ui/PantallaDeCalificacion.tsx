/**
 * Pantalla de Calificación Bidireccional (+58Express).
 *
 * Permite:
 * 1. Pasajera califica a Conductor:
 *    - Calificación con 5 estrellas interactivas
 *    - Opciones de propina (\.50, \.00, \.00, Personalizado, Sin propina)
 *    - Reconocimientos rápidos (Transporte seguro, Llegó rápido, Amable, etc.)
 *    - Tarjeta para dejar comentario de texto
 *    - Resumen del viaje y tarifa
 * 2. Conductor califica a Pasajera:
 *    - 5 estrellas interactivas
 *    - Reconocimientos de puntualidad, respeto, buena comunicación
 *    - Tarjeta para comentarios
 *    - Resumen de ganancias
 *
 * Funciona al 100% en Modo Claro y Modo Oscuro, sin colores hex literales.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icono } from './Icono';
import { useTema, useEsquema } from '../theme/ThemeContext';

export interface DatosDeCalificacion {
  readonly nombre: string;
  readonly iniciales: string;
  readonly vehiculo?: string;
  readonly placa?: string;
  readonly tarifa: string;
  readonly tarifaBs?: string;
  readonly duracion?: string;
  readonly origen?: string;
  readonly destino?: string;
}

export interface PropsPantallaDeCalificacion {
  readonly rol?: 'pasajera' | 'conductor';
  readonly datos?: DatosDeCalificacion;
  readonly onEnviar?: (resultado: {
    calificacion: number;
    propina: number;
    reconocimientos: string[];
    comentario: string;
  }) => void;
  readonly onOmitir?: () => void;
}

const OPCIONES_PROPINA = [
  { clave: 0, etiqueta: 'Sin propina' },
  { clave: 0.5, etiqueta: '+$0.50' },
  { clave: 1.0, etiqueta: '+$1.00' },
  { clave: 2.0, etiqueta: '+$2.00' },
  { clave: -1, etiqueta: 'Personalizado' }
] as const;

const TAGS_PASAJERA_A_CONDUCTOR = [
  { clave: 'seguro', etiqueta: 'Transporte seguro', emoji: '🛡️' },
  { clave: 'rapido', etiqueta: 'Llegó rápido', emoji: '⚡' },
  { clave: 'amable', etiqueta: 'Muy amable', emoji: '⭐' },
  { clave: 'manejo', etiqueta: 'Manejo impecable', emoji: '🏍️' },
  { clave: 'ruta', etiqueta: 'Ruta óptima', emoji: '📍' },
  { clave: 'comunicacion', etiqueta: 'Buena comunicación', emoji: '💬' }
] as const;

const TAGS_CONDUCTOR_A_PASAJERA = [
  { clave: 'puntual', etiqueta: 'Puntual en recogida', emoji: '⏰' },
  { clave: 'amable', etiqueta: 'Pasajera amable', emoji: '⭐' },
  { clave: 'comunicacion', etiqueta: 'Buena comunicación', emoji: '💬' },
  { clave: 'recogida_clara', etiqueta: 'Punto de recogida claro', emoji: '📍' },
  { clave: 'respeto', etiqueta: 'Trato respetuoso', emoji: '🤝' }
] as const;

export function PantallaDeCalificacion({
  rol = 'pasajera',
  datos = {
    nombre: rol === 'pasajera' ? 'Carlos Mendoza' : 'Ana Rondón',
    iniciales: rol === 'pasajera' ? 'CM' : 'AR',
    vehiculo: 'Bera SBR 150 · Azul',
    placa: 'AB123PR',
    tarifa: '$3.50',
    tarifaBs: 'Bs. 210,00',
    duracion: '14 min',
    origen: 'Av. 4 Bella Vista, Calle 72',
    destino: 'C.C. Sambil Maracaibo'
  },
  onEnviar,
  onOmitir
}: PropsPantallaDeCalificacion) {
  const tema = useTema();
  const esquema = useEsquema();
  const esOscuro = esquema === 'oscuro';
  const insets = useSafeAreaInsets();

  const [estrellas, setEstrellas] = useState(5);
  const [propinaSeleccionada, setPropinaSeleccionada] = useState<number>(1.0);
  const [esPropinaPersonalizada, setEsPropinaPersonalizada] = useState(false);
  const [montoPersonalizado, setMontoPersonalizado] = useState('');
  const [tagsSeleccionados, setTagsSeleccionados] = useState<string[]>([
    rol === 'pasajera' ? 'seguro' : 'puntual',
    'amable'
  ]);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  const tagsDisponibles = rol === 'pasajera' ? TAGS_PASAJERA_A_CONDUCTOR : TAGS_CONDUCTOR_A_PASAJERA;

  const toggleTag = (clave: string) => {
    setTagsSeleccionados(prev =>
      prev.includes(clave) ? prev.filter(t => t !== clave) : [...prev, clave]
    );
  };

  const seleccionarOpcionPropina = (valor: number) => {
    if (valor === -1) {
      setEsPropinaPersonalizada(true);
      setPropinaSeleccionada(0);
    } else {
      setEsPropinaPersonalizada(false);
      setPropinaSeleccionada(valor);
    }
  };

  const propinaFinal = esPropinaPersonalizada
    ? parseFloat(montoPersonalizado.replace(',', '.')) || 0
    : propinaSeleccionada;

  const etiquetaEstrellas = (() => {
    switch (estrellas) {
      case 5:
        return '¡Excelente servicio!';
      case 4:
        return 'Muy buen viaje';
      case 3:
        return 'Servicio regular';
      case 2:
        return 'Puede mejorar';
      case 1:
        return 'Mala experiencia';
      default:
        return 'Califica tu experiencia';
    }
  })();

  const manejarEnvio = () => {
    setEnviando(true);
    setTimeout(() => {
      setEnviando(false);
      onEnviar?.({
        calificacion: estrellas,
        propina: rol === 'pasajera' ? propinaFinal : 0,
        reconocimientos: tagsSeleccionados,
        comentario
      });
    }, 400);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        estilos.contenedorTodo,
        {
          backgroundColor: tema.color.fondo,
          paddingTop: Math.max(insets.top, 16),
          paddingBottom: Math.max(insets.bottom, 16)
        }
      ]}
    >
      <ScrollView
        contentContainerStyle={estilos.scrollContenido}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Cabecera con Icono de Éxito */}
        <View style={estilos.cabecera}>
          <View
            style={[
              estilos.insigniaExito,
              {
                backgroundColor: tema.color.superficieElevada,
                borderColor: tema.color.borde
              }
            ]}
          >
            <View style={[estilos.circuloCheck, { backgroundColor: tema.color.exito }]}>
              <Icono nombre="escudo" color={tema.color.sobreAcento} tamano={18} activo />
            </View>
            <Text style={[estilos.textoInsigniaExito, { color: tema.color.textoSecundario }]}>
              VIAJE COMPLETADO
            </Text>
          </View>

          <Text style={[estilos.tituloCabecera, { color: tema.color.textoPrimario }]}>
            {rol === 'pasajera' ? '¡Llegaste a tu destino!' : '¡Carrera finalizada con éxito!'}
          </Text>
          <Text style={[estilos.subtituloCabecera, { color: tema.color.textoSecundario }]}>
            {rol === 'pasajera'
              ? `¿Cómo calificarías tu viaje con ${datos.nombre}?`
              : `Califica a ${datos.nombre} para mantener la comunidad segura.`}
          </Text>
        </View>

        {/* 2. Tarjeta Resumen de Viaje */}
        <View
          style={[
            estilos.tarjetaResumen,
            {
              backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada,
              borderColor: tema.color.borde
            }
          ]}
        >
          <View style={estilos.filaResumenPrincipal}>
            <View>
              <Text style={[estilos.etiquetaResumen, { color: tema.color.textoTenue }]}>
                {rol === 'pasajera' ? 'TOTAL PAGADO' : 'GANANCIA DEL VIAJE'}
              </Text>
              <Text style={[estilos.valorResumenMonto, { color: tema.color.textoPrimario }]}>
                {datos.tarifa}
              </Text>
              {datos.tarifaBs ? (
                <Text style={[estilos.valorResumenBs, { color: tema.color.textoSecundario }]}>
                  {datos.tarifaBs}
                </Text>
              ) : null}
            </View>

            <View style={estilos.resumenColumnaDerecha}>
              <View
                style={[
                  estilos.pillDuracion,
                  { backgroundColor: tema.color.superficieHundida, borderColor: tema.color.borde }
                ]}
              >
                <Icono nombre="reloj" color={tema.color.textoSecundario} tamano={14} />
                <Text style={[estilos.textoDuracion, { color: tema.color.textoPrimario }]}>
                  {datos.duracion || '14 min'}
                </Text>
              </View>
            </View>
          </View>

          {/* Persona con la que viajó */}
          <View style={[estilos.divisorHorizontal, { backgroundColor: tema.color.borde }]} />

          <View style={estilos.filaPersona}>
            <View style={[estilos.avatarGrande, { backgroundColor: tema.color.superficieHundida }]}>
              <Text style={[estilos.avatarLetras, { color: tema.color.textoPrimario }]}>
                {datos.iniciales}
              </Text>
            </View>
            <View style={estilos.datosPersona}>
              <Text style={[estilos.nombrePersona, { color: tema.color.textoPrimario }]}>
                {datos.nombre}
              </Text>
              {rol === 'pasajera' && datos.vehiculo ? (
                <Text style={[estilos.vehiculoPersona, { color: tema.color.textoSecundario }]}>
                  {datos.vehiculo} {datos.placa ? `· ${datos.placa}` : ''}
                </Text>
              ) : (
                <Text style={[estilos.vehiculoPersona, { color: tema.color.textoSecundario }]}>
                  Pasajera verificada de +58Express
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* 3. Selector de 5 Estrellas Interactivo */}
        <View
          style={[
            estilos.tarjetaEstrellas,
            {
              backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada,
              borderColor: tema.color.borde
            }
          ]}
        >
          <Text style={[estilos.etiquetaEstrellasDinamica, { color: tema.color.textoPrimario }]}>
            {etiquetaEstrellas}
          </Text>

          <View style={estilos.filaCincoEstrellas}>
            {[1, 2, 3, 4, 5].map(num => {
              const activa = num <= estrellas;
              return (
                <Pressable
                  key={num}
                  onPress={() => setEstrellas(num)}
                  accessibilityRole="button"
                  accessibilityLabel={`${num} de 5 estrellas`}
                  style={({ pressed }) => [
                    estilos.botonEstrella,
                    { transform: [{ scale: pressed ? 0.9 : 1 }] }
                  ]}
                >
                  <Icono
                    nombre="estrella"
                    color={activa ? tema.color.acento : tema.color.borde}
                    tamano={38}
                    activo={activa}
                  />
                </Pressable>
              );
            })}
          </View>
          <Text style={[estilos.pistaEstrellas, { color: tema.color.textoTenue }]}>
            Toca las estrellas para calificar
          </Text>
        </View>

        {/* 4. Sección de Propinas (Solo Pasajera) */}
        {rol === 'pasajera' ? (
          <View
            style={[
              estilos.seccionPropina,
              {
                backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada,
                borderColor: tema.color.borde
              }
            ]}
          >
            <View style={estilos.cabeceraPropina}>
              <Text style={[estilos.tituloPropina, { color: tema.color.textoPrimario }]}>
                Añadir propina al conductor
              </Text>
              <Text style={[estilos.subtituloPropina, { color: tema.color.textoSecundario }]}>
                El 100% de la propina va directamente al conductor.
              </Text>
            </View>

            {/* Píldoras de Propina */}
            <View style={estilos.filaPildorasPropina}>
              {OPCIONES_PROPINA.map(op => {
                const seleccionada =
                  op.clave === -1
                    ? esPropinaPersonalizada
                    : !esPropinaPersonalizada && propinaSeleccionada === op.clave;

                return (
                  <Pressable
                    key={op.clave}
                    onPress={() => seleccionarOpcionPropina(op.clave)}
                    style={[
                      estilos.pildoraPropina,
                      {
                        backgroundColor: seleccionada
                          ? !esOscuro
                            ? tema.color.textoPrimario
                            : tema.color.acento
                          : tema.color.superficieHundida,
                        borderColor: seleccionada ? 'transparent' : tema.color.borde
                      }
                    ]}
                  >
                    <Text
                      style={[
                        estilos.textoPildoraPropina,
                        {
                          color: seleccionada
                            ? !esOscuro
                              ? tema.color.superficieElevada
                              : tema.color.sobreAcento
                            : tema.color.textoPrimario,
                          fontWeight: seleccionada ? '800' : '600'
                        }
                      ]}
                    >
                      {op.etiqueta}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Campo personalizable si eligió "Personalizado" */}
            {esPropinaPersonalizada ? (
              <View
                style={[
                  estilos.contenedorInputPersonalizado,
                  {
                    backgroundColor: tema.color.superficieHundida,
                    borderColor: tema.color.borde
                  }
                ]}
              >
                <Text style={[estilos.simboloDolar, { color: tema.color.textoPrimario }]}>
                  $
                </Text>
                <TextInput
                  value={montoPersonalizado}
                  onChangeText={setMontoPersonalizado}
                  placeholder="0.00"
                  placeholderTextColor={tema.color.textoTenue}
                  keyboardType="decimal-pad"
                  style={[estilos.inputPropina, { color: tema.color.textoPrimario }]}
                />
                <Text style={[estilos.monedaDolar, { color: tema.color.textoSecundario }]}>
                  USD
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* 5. Reconocimientos Rápidos (Tags) */}
        <View
          style={[
            estilos.seccionTags,
            {
              backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada,
              borderColor: tema.color.borde
            }
          ]}
        >
          <Text style={[estilos.tituloTags, { color: tema.color.textoPrimario }]}>
            {rol === 'pasajera' ? '¿Qué fue lo más destacado?' : 'Aspectos positivos del pasajero'}
          </Text>

          <View style={estilos.contenedorChips}>
            {tagsDisponibles.map(item => {
              const seleccionado = tagsSeleccionados.includes(item.clave);
              return (
                <Pressable
                  key={item.clave}
                  onPress={() => toggleTag(item.clave)}
                  style={[
                    estilos.chipTag,
                    {
                      backgroundColor: seleccionado
                        ? !esOscuro
                          ? tema.color.superficieHundida
                          : tema.color.superficieElevada
                        : tema.color.superficieHundida,
                      borderColor: seleccionado
                        ? !esOscuro
                          ? tema.color.textoPrimario
                          : tema.color.acento
                        : tema.color.borde
                    }
                  ]}
                >
                  <Text style={estilos.emojiTag}>{item.emoji}</Text>
                  <Text
                    style={[
                      estilos.textoChip,
                      {
                        color: seleccionado ? tema.color.textoPrimario : tema.color.textoSecundario,
                        fontWeight: seleccionado ? '700' : '500'
                      }
                    ]}
                  >
                    {item.etiqueta}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 6. Tarjeta de Comentarios de Texto */}
        <View
          style={[
            estilos.tarjetaComentario,
            {
              backgroundColor: esOscuro ? tema.color.superficie : tema.color.superficieElevada,
              borderColor: tema.color.borde
            }
          ]}
        >
          <Text style={[estilos.tituloComentario, { color: tema.color.textoPrimario }]}>
            {rol === 'pasajera' ? 'Comentarios adicionales' : 'Nota sobre la carrera (opcional)'}
          </Text>
          <TextInput
            value={comentario}
            onChangeText={setComentario}
            placeholder={
              rol === 'pasajera'
                ? 'Escribe qué te gustó o en qué puede mejorar el servicio...'
                : 'Detalles relevantes sobre el comportamiento o punto de recogida...'
            }
            placeholderTextColor={tema.color.textoTenue}
            multiline
            numberOfLines={3}
            maxLength={200}
            style={[
              estilos.inputArea,
              {
                backgroundColor: tema.color.superficieHundida,
                borderColor: tema.color.borde,
                color: tema.color.textoPrimario
              }
            ]}
          />
          <Text style={[estilos.contadorLetras, { color: tema.color.textoTenue }]}>
            {comentario.length}/200
          </Text>
        </View>

        {/* 7. Botones de Acción */}
        <View style={estilos.accionesFinales}>
          <Pressable
            onPress={manejarEnvio}
            disabled={enviando}
            accessibilityRole="button"
            accessibilityLabel={
              rol === 'pasajera' && propinaFinal > 0
                ? `Enviar calificación más ${propinaFinal.toFixed(2)} dólares de propina`
                : 'Enviar calificación'
            }
            style={({ pressed }) => [
              estilos.botonEnviar,
              {
                backgroundColor: !esOscuro
                  ? (pressed ? tema.color.textoSecundario : tema.color.textoPrimario)
                  : (pressed ? tema.color.acentoPresionado : tema.color.acento),
                opacity: enviando ? 0.6 : 1
              }
            ]}
          >
            {enviando ? (
              <ActivityIndicator color={!esOscuro ? tema.color.superficieElevada : tema.color.sobreAcento} />
            ) : (
              <Text
                style={[
                  estilos.textoBotonEnviar,
                  {
                    color: !esOscuro ? tema.color.superficieElevada : tema.color.sobreAcento
                  }
                ]}
              >
                {rol === 'pasajera' && propinaFinal > 0
                  ? `Enviar calificación (+ $${propinaFinal.toFixed(2)} propina)`
                  : 'Enviar calificación'}
              </Text>
            )}
          </Pressable>

          {onOmitir ? (
            <Pressable
              onPress={onOmitir}
              style={estilos.botonOmitir}
              accessibilityRole="button"
              accessibilityLabel="Omitir calificación por ahora"
            >
              <Text style={[estilos.textoOmitir, { color: tema.color.textoSecundario }]}>
                {rol === 'pasajera' ? 'Omitir por ahora' : 'Volver a turno activo'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  contenedorTodo: {
    flex: 1
  },
  scrollContenido: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 16
  },
  cabecera: {
    alignItems: 'center',
    gap: 8,
    marginTop: 8
  },
  insigniaExito: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1
  },
  circuloCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  textoInsigniaExito: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  tituloCabecera: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3
  },
  subtituloCabecera: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20
  },
  tarjetaResumen: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14
  },
  filaResumenPrincipal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  etiquetaResumen: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6
  },
  valorResumenMonto: {
    fontSize: 26,
    fontWeight: '800'
  },
  valorResumenBs: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1
  },
  resumenColumnaDerecha: {
    alignItems: 'flex-end'
  },
  pillDuracion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1
  },
  textoDuracion: {
    fontSize: 13,
    fontWeight: '700'
  },
  divisorHorizontal: {
    height: 1,
    width: '100%'
  },
  filaPersona: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  avatarGrande: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarLetras: {
    fontSize: 16,
    fontWeight: '800'
  },
  datosPersona: {
    flex: 1,
    gap: 2
  },
  nombrePersona: {
    fontSize: 15,
    fontWeight: '700'
  },
  vehiculoPersona: {
    fontSize: 12,
    fontWeight: '500'
  },
  tarjetaEstrellas: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8
  },
  etiquetaEstrellasDinamica: {
    fontSize: 16,
    fontWeight: '800'
  },
  filaCincoEstrellas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6
  },
  botonEstrella: {
    padding: 4
  },
  pistaEstrellas: {
    fontSize: 12
  },
  seccionPropina: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12
  },
  cabeceraPropina: {
    gap: 3
  },
  tituloPropina: {
    fontSize: 15,
    fontWeight: '700'
  },
  subtituloPropina: {
    fontSize: 12,
    lineHeight: 16
  },
  filaPildorasPropina: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  pildoraPropina: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1
  },
  textoPildoraPropina: {
    fontSize: 13
  },
  contenedorInputPersonalizado: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6
  },
  simboloDolar: {
    fontSize: 16,
    fontWeight: '700'
  },
  inputPropina: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 4
  },
  monedaDolar: {
    fontSize: 12,
    fontWeight: '600'
  },
  seccionTags: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12
  },
  tituloTags: {
    fontSize: 15,
    fontWeight: '700'
  },
  contenedorChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chipTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1
  },
  emojiTag: {
    fontSize: 14
  },
  textoChip: {
    fontSize: 13
  },
  tarjetaComentario: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10
  },
  tituloComentario: {
    fontSize: 15,
    fontWeight: '700'
  },
  inputArea: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top'
  },
  contadorLetras: {
    fontSize: 11,
    textAlign: 'right'
  },
  accionesFinales: {
    gap: 10,
    marginTop: 4
  },
  botonEnviar: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  textoBotonEnviar: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2
  },
  botonOmitir: {
    alignItems: 'center',
    paddingVertical: 10
  },
  textoOmitir: {
    fontSize: 13,
    fontWeight: '600'
  }
});
