/**
 * Componente presentacional para adjuntos multimedia en el detalle del viaje.
 * TRIP-ATTACHMENT-VISUAL — +58Express
 *
 * MODO DÍA Y MODO NOCHE PARITARIOS
 *
 * Diseñado con las dimensiones, relación de aspecto (16:9 / 4:3) y estados
 * visuales de alta gama necesarios:
 * - Cargando (Skeleton/Shimmer pulido)
 * - Cargado (Imagen con esquinas redondeadas y apertura en visor fullscreen)
 * - Error de renderizado (Aviso visual nítido y botón de reintento)
 * - Placeholder / Maqueta (Marco discontinuo cuando no hay imagen disponible)
 *
 * AISLADO: No toca loaders del backend ni llamadas de red de producción.
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTema, useEsquema } from '../theme/ThemeContext';
import { Icono } from './Icono';

export interface PropiedadesAdjuntoDetalle {
  readonly rotulo: string;
  readonly fuente?: { readonly uri: string; readonly headers?: Record<string, string> };
  /** Permite forzar un estado en pruebas y previews sin depender de la red */
  readonly estadoForzado?: 'cargando' | 'error' | 'cargado' | 'placeholder';
  readonly onReintentar?: () => void;
  readonly onAbrir?: (uri: string) => void;
}

export function AdjuntoDetalleViaje({
  rotulo,
  fuente,
  estadoForzado,
  onReintentar,
  onAbrir
}: PropiedadesAdjuntoDetalle) {
  const tema = useTema();
  const esquema = useEsquema();
  const esOscuro = esquema === 'oscuro';
  const insets = useSafeAreaInsets();

  const [estadoCarga, setEstadoCarga] = useState<'cargando' | 'cargado' | 'error' | 'placeholder'>(
    estadoForzado ?? (fuente ? 'cargando' : 'placeholder')
  );
  const [modalAbierto, setModalAbierto] = useState(false);

  // Si se fuerza un estado explícito por props (en el laboratorio visual):
  const estadoEfectivo = estadoForzado ?? (fuente ? estadoCarga : 'placeholder');

  const uri = fuente?.uri;

  // LA FUENTE LLEGA TARDE, Y HAY QUE ENTERARSE.
  //
  // El estado de arriba se calcula UNA vez, al montar. En el laboratorio eso
  // basta porque el adjunto viene del fixture y ya está en el primer render;
  // en la aplicación real no: la pantalla se monta sin imagen, `fuenteDeAdjunto`
  // va al servidor con la sesión y el data URI aparece un momento después.
  //
  // Sin esto, el estado inicial quedaba en «placeholder» y ya nunca salía de
  // ahí: la imagen llegaba entera —200, sus 27 KB, su data URI— y la pantalla
  // seguía enseñando el marco vacío. No fallaba nada, y por eso costó verlo.
  useEffect(() => {
    if (estadoForzado !== undefined) return;
    setEstadoCarga(uri === undefined ? 'placeholder' : 'cargando');
  }, [uri, estadoForzado]);
  const colorAcento = tema.color.acento;

  const handleAbrir = () => {
    if (uri) {
      if (onAbrir) {
        onAbrir(uri);
      } else {
        setModalAbierto(true);
      }
    }
  };

  return (
    <View style={estilos.contenedor}>
      {/* 1. ESTADO: PLACEHOLDER (SIN FUENTE O EN MAQUETA) */}
      {estadoEfectivo === 'placeholder' && (
        <View style={[
          estilos.marcoPlaceholder,
          {
            backgroundColor: esOscuro ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            borderColor: esOscuro ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
            borderRadius: tema.radio.campo
          }
        ]}>
          <View style={[
            estilos.iconoPlaceholderCirculo,
            { backgroundColor: esOscuro ? tema.color.superficieHundida : '#E9ECEF' }
          ]}>
            <Icono nombre="imagen" color={tema.color.textoSecundario} tamano={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[estilos.rotuloPlaceholder, { color: tema.color.textoPrimario }]} numberOfLines={1}>
              {rotulo}
            </Text>
            <Text style={[estilos.subtituloPlaceholder, { color: tema.color.textoTenue }]}>
              Fotografía adjunta registrada en el viaje
            </Text>
          </View>
        </View>
      )}

      {/* 2. ESTADOS CON IMAGEN (CARGANDO / ERROR / CARGADO) */}
      {estadoEfectivo !== 'placeholder' && (
        <View style={[
          estilos.marcoImagen,
          {
            backgroundColor: esOscuro ? tema.color.superficieHundida : '#F1F3F5',
            borderColor: esOscuro ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            borderRadius: 12
          }
        ]}>
          {/* Skeleton / Cargando */}
          {estadoEfectivo === 'cargando' && (
            <View style={estilos.overlayCargando}>
              <ActivityIndicator color={colorAcento} size="small" />
              <Text style={[estilos.textoCargando, { color: tema.color.textoTenue }]}>
                Cargando imagen adjunta...
              </Text>
            </View>
          )}

          {/* Error de Renderizado en Android / Red */}
          {estadoEfectivo === 'error' && (
            <View style={estilos.overlayError}>
              <View style={[
                estilos.iconoErrorCirculo,
                { backgroundColor: esOscuro ? 'rgba(211,47,47,0.16)' : '#FDE8E8' }
              ]}>
                <Text style={{ color: tema.color.peligro, fontSize: 16, fontWeight: '700' }}>⚠</Text>
              </View>
              <Text style={[estilos.tituloError, { color: tema.color.textoPrimario }]}>
                No se pudo renderizar la imagen
              </Text>
              <Text style={[estilos.subtituloError, { color: tema.color.textoTenue }]}>
                {rotulo}
              </Text>
              <Pressable
                onPress={() => {
                  setEstadoCarga('cargando');
                  onReintentar?.();
                }}
                accessibilityRole="button"
                accessibilityLabel="Reintentar carga de imagen"
                style={({ pressed }) => [
                  estilos.botonReintentar,
                  {
                    backgroundColor: pressed ? tema.color.acentoPresionado : colorAcento
                  }
                ]}
              >
                <Text style={[estilos.textoBotonReintentar, { color: tema.color.sobreAcento }]}>
                  Reintentar
                </Text>
              </Pressable>
            </View>
          )}

          {/* Imagen Cargada con Apertura Fullscreen */}
          {uri && estadoEfectivo !== 'error' && (
            <Pressable
              onPress={handleAbrir}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Ver ${rotulo} en tamaño completo`}
              style={estilos.flex}
            >
              <Image
                source={{ uri }}
                style={estilos.imagenMiniatura}
                resizeMode="cover"
                onLoadStart={() => setEstadoCarga('cargando')}
                onLoad={() => setEstadoCarga('cargado')}
                onError={() => setEstadoCarga('error')}
              />

              {/* Píldora inferior de metadatos de la imagen */}
              <View style={[
                estilos.pildoraMetadata,
                {
                  backgroundColor: esOscuro ? 'rgba(16, 17, 18, 0.78)' : 'rgba(255, 255, 255, 0.88)',
                  borderColor: esOscuro ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'
                }
              ]}>
                <Icono nombre="imagen" color={tema.color.acentoTexto} tamano={14} />
                <Text style={[estilos.rotuloMetadata, { color: tema.color.textoPrimario }]} numberOfLines={1}>
                  {rotulo}
                </Text>
                <Text style={[estilos.accionMetadata, { color: tema.color.acentoTexto }]}>
                  Ampliar
                </Text>
              </View>
            </Pressable>
          )}
        </View>
      )}

      {/* 3. VISOR FULLSCREEN PROPIO */}
      {uri && (
        <Modal
          visible={modalAbierto}
          transparent
          animationType="fade"
          onRequestClose={() => setModalAbierto(false)}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.94)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: insets.top,
            paddingBottom: insets.bottom
          }}>
            <View style={{
              position: 'absolute',
              top: insets.top + 12,
              left: 16,
              right: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 10
            }}>
              <View style={{
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
                  {rotulo} · +58Express
                </Text>
              </View>

              <Pressable
                onPress={() => setModalAbierto(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar visor"
                style={({ pressed }) => [{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: pressed ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.18)',
                  alignItems: 'center',
                  justifyContent: 'center'
                }]}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 20 }}>✕</Text>
              </Pressable>
            </View>

            <Image
              source={{ uri }}
              style={{ width: '92%', height: '76%', borderRadius: 14 }}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    marginVertical: 4
  },
  flex: {
    flex: 1
  },
  marcoPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderStyle: 'dashed'
  },
  iconoPlaceholderCirculo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rotuloPlaceholder: {
    fontSize: 13,
    fontWeight: '600'
  },
  subtituloPlaceholder: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2
  },
  // EL MARCO NO PUEDE DEPENDER SÓLO DEL PORCENTAJE.
  //
  // En el detalle del viaje este adjunto vive dentro de una burbuja que se
  // ajusta a su contenido —`alignSelf`, sin ancho fijo—, y en un padre así un
  // `width: '100%'` no tiene contra qué medirse: se resuelve a cero y la
  // imagen, ya cargada, se pintaba como un recuadro vacío. Costó descubrirlo
  // porque no falla nada: el `onLoad` llega, el estado pasa a «cargado», y lo
  // que no hay es sitio donde pintar.
  //
  // El `minWidth` es el suelo que lo impide, y se conserva el porcentaje para
  // que en un padre ancho —las maquetas del laboratorio— siga ocupándolo todo.
  // Doscientos veinte es la misma medida que la miniatura del chat en vivo,
  // para que las dos se lean igual.
  marcoImagen: {
    width: '100%',
    minWidth: 220,
    height: 180,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative'
  },
  imagenMiniatura: {
    width: '100%',
    height: '100%'
  },
  overlayCargando: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  textoCargando: {
    fontSize: 12,
    fontWeight: '500'
  },
  overlayError: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16
  },
  iconoErrorCirculo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6
  },
  tituloError: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  subtituloError: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10
  },
  botonReintentar: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8
  },
  textoBotonReintentar: {
    fontSize: 12,
    fontWeight: '700'
  },
  pildoraMetadata: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth
  },
  rotuloMetadata: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1
  },
  accionMetadata: {
    fontSize: 11,
    fontWeight: '700'
  }
});
