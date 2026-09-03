/**
 * Aviso de estado de postulación a Driver para el Home Passenger.
 *
 * QUÉ ES ESTO
 *
 * Una superficie compacta, premium y contextual que informa a la persona
 * sobre el estado de su postulación a conductor sin invadir ni competir con:
 *   · la cabecera
 *   · el buscador («¿A dónde vas?»)
 *   · el mapa
 *   · el botón central «Pedir»
 *   · la navegación inferior
 *
 * TRES VARIANTES VISUALES REUTILIZABLES:
 *   1. `review`: neutro / informativo («Solicitud en revisión»). Sin CTA dominante.
 *   2. `changes_required`: prioritario con amarillo/ámbar de marca («Solicitud requiere cambios»). CTA «Revisar solicitud».
 *   3. `approved`: éxito positivo y premium («Solicitud aprobada»). CTA «Entrar como Driver».
 *
 * SÓLO UI: sin lógica de negocio, sin llamadas a API, sin navegación forzada.
 * Todo el cableado y persistencia se realizará en D4.
 */

import { StyleSheet, Text, View, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { Txt, Insignia, type TonoDeEstado } from './componentes';
import { Icono } from './Icono';
import { FlechaDerecha } from './IconosDeCampo';

export type VarianteAvisoPostulacion = 'review' | 'changes_required' | 'approved';

export interface PropiedadesAvisoPostulacion {
  /** Variante visual de la postulación: 'review' | 'changes_required' | 'approved' */
  readonly variante: VarianteAvisoPostulacion;
  /** Título personalizado (opcional; si se omite, usa el título oficial de la variante) */
  readonly titulo?: string;
  /** Descripción o mensaje secundario corto (opcional) */
  readonly descripcion?: string;
  /**
   * Texto de la insignia (opcional; si se omite, usa el de la variante).
   *
   * Las tres variantes visuales cubren más de tres estados del expediente: un
   * borrador, un rechazo y una suspensión comparten la forma neutra pero no
   * pueden decir «En revisión». El estado se lee siempre con palabras, nunca
   * sólo por el color.
   */
  readonly etiqueta?: string;
  /** Etiqueta de texto para el botón de acción (CTA) */
  readonly textoCTA?: string;
  /** Forzar visibilidad del CTA independientemente de la variante */
  readonly mostrarCTA?: boolean;
  /** Pulsación sobre la tarjeta completa (opcional, para cuando se cablee) */
  readonly onPress?: () => void;
  /** Pulsación sobre el botón CTA (opcional, para cuando se cablee) */
  readonly onPressCTA?: () => void;
  /** Visibilidad general del aviso (por defecto true) */
  readonly visible?: boolean;
  /** Estilo de contenedor adicional */
  readonly estilo?: StyleProp<ViewStyle>;
  /** Identificador para pruebas y accesibilidad */
  readonly testID?: string;
}

/** Icono de documento con aviso para la variante `changes_required`. */
function IconoDocumentoAviso({ color }: { readonly color: string }) {
  return (
    <View style={estilosIcono.contenedor} accessibilityElementsHidden importantForAccessibility="no">
      {/* Contorno del documento */}
      <View style={[estilosIcono.documento, { borderColor: color }]}>
        <View style={[estilosIcono.lineaDoc, { backgroundColor: color, width: 8, top: 4 }]} />
        <View style={[estilosIcono.lineaDoc, { backgroundColor: color, width: 10, top: 8 }]} />
      </View>
      {/* Insignia / punto de atención en esquina superior */}
      <View style={[estilosIcono.puntoAviso, { backgroundColor: color }]} />
    </View>
  );
}

/** Icono de tilde / checkmark de éxito para la variante `approved`. */
function IconoCheckAprobado({ color }: { readonly color: string }) {
  return (
    <View style={estilosIcono.contenedor} accessibilityElementsHidden importantForAccessibility="no">
      <View style={[estilosIcono.circuloCheck, { borderColor: color }]}>
        <View style={[estilosIcono.pataCorta, { backgroundColor: color }]} />
        <View style={[estilosIcono.pataLarga, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

export function AvisoPostulacionDriver({
  variante = 'review',
  titulo,
  descripcion,
  etiqueta,
  textoCTA,
  mostrarCTA,
  onPress,
  onPressCTA,
  visible = true,
  estilo,
  testID = `aviso-postulacion-${variante}`
}: PropiedadesAvisoPostulacion) {
  const tema = useTema();

  if (!visible) return null;

  // Configuración semántica según la variante
  const config = (() => {
    switch (variante) {
      case 'changes_required':
        return {
          tituloPorDefecto: 'Solicitud requiere cambios',
          descripcionPorDefecto: 'Necesitamos que revises algunos datos.',
          etiquetaInsignia: 'Requiere cambios',
          tonoInsignia: 'aviso' as TonoDeEstado,
          conFilo: true,
          filoColor: tema.color.acento,
          bordeColor: `${tema.color.acento}55`,
          iconoFondo: `${tema.color.acento}1e`,
          iconoBorde: `${tema.color.acento}55`,
          icono: <IconoDocumentoAviso color={tema.color.acento} />,
          tieneCTAPorDefecto: true,
          textoCTAPorDefecto: 'Revisar solicitud',
          ctaFondo: (pressed: boolean) => (pressed ? tema.color.acentoPresionado : tema.color.acento),
          ctaColorTexto: tema.color.sobreAcento
        };

      case 'approved':
        return {
          tituloPorDefecto: 'Solicitud aprobada',
          descripcionPorDefecto: 'Tu cuenta de conductor está lista para activarse.',
          etiquetaInsignia: 'Aprobada',
          tonoInsignia: 'exito' as TonoDeEstado,
          conFilo: true,
          filoColor: tema.color.exito,
          bordeColor: `${tema.color.exito}55`,
          iconoFondo: `${tema.color.exito}1a`,
          iconoBorde: `${tema.color.exito}55`,
          icono: <IconoCheckAprobado color={tema.color.exito} />,
          tieneCTAPorDefecto: true,
          textoCTAPorDefecto: 'Entrar como Driver',
          ctaFondo: (pressed: boolean) => (pressed ? tema.color.acentoPresionado : tema.color.acento),
          ctaColorTexto: tema.color.sobreAcento
        };

      case 'review':
      default:
        return {
          tituloPorDefecto: 'Solicitud en revisión',
          descripcionPorDefecto: 'Estamos revisando tu información.',
          etiquetaInsignia: 'En revisión',
          tonoInsignia: 'neutro' as TonoDeEstado,
          conFilo: false,
          filoColor: 'transparent',
          bordeColor: tema.color.borde,
          iconoFondo: `${tema.color.textoSecundario}16`,
          iconoBorde: `${tema.color.textoSecundario}30`,
          icono: <Icono nombre="reloj" color={tema.color.textoSecundario} tamano={19} />,
          tieneCTAPorDefecto: false,
          textoCTAPorDefecto: 'Ver solicitud',
          ctaFondo: (pressed: boolean) => (pressed ? tema.color.superficieElevada : tema.color.superficie),
          ctaColorTexto: tema.color.textoPrimario
        };
    }
  })();

  const tieneCTA = mostrarCTA ?? config.tieneCTAPorDefecto;
  const textoBoton = textoCTA ?? config.textoCTAPorDefecto;
  const etiquetaFinal = etiqueta ?? config.etiquetaInsignia;
  const tituloFinal = titulo ?? config.tituloPorDefecto;
  const descripcionFinal = descripcion ?? config.descripcionPorDefecto;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${tituloFinal}. ${descripcionFinal}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        {
          position: 'relative',
          backgroundColor: tema.color.superficieElevada,
          borderRadius: tema.radio.tarjeta,
          borderWidth: 1,
          borderColor: config.bordeColor,
          paddingVertical: 12,
          paddingHorizontal: 14,
          overflow: 'hidden',
          ...tema.superficie.sombra,
          ...(pressed && onPress ? { opacity: 0.92, transform: [{ scale: 0.995 }] } : {})
        },
        estilo
      ]}
    >
      {/* Filo lateral característico de marca para estados con acción */}
      {config.conFilo ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3.5,
            backgroundColor: config.filoColor
          }}
        />
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Contenedor circular/redondeado del icono */}
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: config.iconoFondo,
            borderWidth: 1,
            borderColor: config.iconoBorde
          }}
        >
          {config.icono}
        </View>

        {/* Textos centrales: título + descripción compacta */}
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <Txt nivel="etiqueta" estilo={{ fontWeight: '700', fontSize: 13.5 }} numberOfLines={1}>
              {tituloFinal}
            </Txt>
            <Insignia texto={etiquetaFinal} tono={config.tonoInsignia} />
          </View>

          <Txt nivel="pie" tono="secundario" numberOfLines={1} estilo={{ fontSize: 11.5, lineHeight: 15 }}>
            {descripcionFinal}
          </Txt>
        </View>
      </View>

      {/* CTA inferior integrado (visible en changes_required y approved) */}
      {tieneCTA ? (
        <View style={{ marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: `${tema.color.borde}77` }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textoBoton}
            onPress={onPressCTA ?? onPress}
            hitSlop={6}
            style={({ pressed }) => [
              {
                minHeight: 34,
                borderRadius: tema.radio.boton,
                backgroundColor: config.ctaFondo(pressed),
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingHorizontal: 12
              }
            ]}
          >
            <Text
              style={{
                color: config.ctaColorTexto,
                fontSize: 12.5,
                fontWeight: '700',
                letterSpacing: -0.1
              }}
            >
              {textoBoton}
            </Text>
            <FlechaDerecha tamano={13} color={config.ctaColorTexto} />
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const estilosIcono = StyleSheet.create({
  contenedor: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  documento: {
    width: 15,
    height: 18,
    borderRadius: 3,
    borderWidth: 1.5,
    position: 'relative'
  },
  lineaDoc: {
    position: 'absolute',
    left: 2,
    height: 1.5,
    borderRadius: 1
  },
  puntoAviso: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 6,
    height: 6,
    borderRadius: 3
  },
  circuloCheck: {
    width: 19,
    height: 19,
    borderRadius: 9.5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  pataCorta: {
    position: 'absolute',
    left: 4.5,
    bottom: 7,
    width: 4.5,
    height: 1.8,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }]
  },
  pataLarga: {
    position: 'absolute',
    left: 7,
    bottom: 8.5,
    width: 8,
    height: 1.8,
    borderRadius: 1,
    transform: [{ rotate: '-50deg' }]
  }
});
