/**
 * Vista previa y laboratorio visual para POSTULACIÓN → PASO 3 · DOCUMENTOS.
 *
 * QUÉ ES ESTO
 *
 * Implementación visual completa del Paso 3 (Documentos) según los estándares
 * de +58Express, organizada en cuatro grupos documentales con jerarquía limpia,
 * tarjetas consistentes para fotos, tarjeta distintiva para vídeo, resumen de
 * progreso superior y pie de navegación.
 *
 * SÓLO UI / PREVIEW: sin backend, sin llamadas nativas de cámara reales.
 * Lista para que Claude la conecte al flujo en D4.
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { Boton, Txt } from '../ui/componentes';
import { CabeceraDePasos } from '../components/CabeceraDePasos';
import {
  CabeceraGrupoDocumental,
  GRUPOS_DOCUMENTALES,
  ResumenProgresoDocumentos,
  TarjetaDocumento,
  TarjetaVideoPresentacion,
  clasificarDocumentoEnGrupo,
  type EstadoDocumentoVisual,
  type EstadoVideoVisual
} from '../ui/DocumentosPostulacion';

export interface DocumentoMock {
  readonly tipo: string;
  readonly titulo: string;
  readonly instruccion: string;
  readonly estado: EstadoDocumentoVisual;
  readonly motivo?: string | null;
}

export const DOCUMENTOS_DEMO_PASO_3: readonly DocumentoMock[] = Object.freeze([
  // IDENTIDAD
  {
    tipo: 'identity_front',
    titulo: 'Cédula, por delante',
    instruccion: 'Que se lean el número y el nombre. Sin reflejos ni dedos encima.',
    estado: 'SUBIDO'
  },
  {
    tipo: 'identity_back',
    titulo: 'Cédula, por detrás',
    instruccion: 'La cara de atrás, completa y enfocada.',
    estado: 'SUBIDO'
  },
  {
    tipo: 'rif',
    titulo: 'RIF',
    instruccion: 'El comprobante del SENIAT, con el número completo visible.',
    estado: 'REQUIERE_CAMBIOS',
    motivo: 'El código QR y la fecha de vencimiento no se aprecian por un reflejo de luz. Vuelve a tomarla sobre fondo oscuro.'
  },
  {
    tipo: 'driver_selfie',
    titulo: 'Tu foto (selfie)',
    instruccion: 'Cara descubierta, sin casco ni lentes oscuros. Es para verificar tu identidad.',
    estado: 'PENDIENTE'
  },

  // CONDUCCIÓN
  {
    tipo: 'driver_license',
    titulo: 'Licencia de conducir',
    instruccion: 'Vigente. Que se vean el grado y la fecha de vencimiento.',
    estado: 'SUBIDO'
  },
  {
    tipo: 'medical_certificate',
    titulo: 'Certificado médico',
    instruccion: 'El certificado médico vial vigente, con su fecha de vencimiento.',
    estado: 'PENDIENTE'
  },

  // VEHÍCULO
  {
    tipo: 'vehicle_registration',
    titulo: 'Documento del vehículo',
    instruccion: 'El carnet de circulación, el título o el certificado de origen, con la placa visible.',
    estado: 'SUBIDO'
  },
  {
    tipo: 'vehicle_front',
    titulo: 'Vehículo, por delante',
    instruccion: 'De frente y entero, con luz. Como lo verá tu pasajera al subirse.',
    estado: 'SUBIDO'
  },
  {
    tipo: 'vehicle_rear',
    titulo: 'Vehículo, por detrás',
    instruccion: 'Desde atrás y entero. Que se vea la placa.',
    estado: 'SUBIDO'
  },
  {
    tipo: 'plate_photo',
    titulo: 'Placa',
    instruccion: 'De cerca y recta. Los caracteres tienen que leerse sin esfuerzo.',
    estado: 'SUBIDO'
  },
  {
    tipo: 'moto_helmets',
    titulo: 'Los cascos',
    instruccion: 'Los cascos con los que vas a prestar el servicio, juntos y enteros.',
    estado: 'PENDIENTE'
  }
]);

export function C2PostulacionDocumentos({
  documentos = DOCUMENTOS_DEMO_PASO_3,
  tipoVehiculo = 'MOTO',
  estadoVideo = 'LISTO',
  duracionVideo = 24,
  motivoVideo = null,
  onAtras,
  onSiguiente,
  onCerrar
}: {
  readonly documentos?: readonly DocumentoMock[];
  readonly tipoVehiculo?: 'MOTO' | 'CAR';
  readonly estadoVideo?: EstadoVideoVisual;
  readonly duracionVideo?: number;
  readonly motivoVideo?: string | null;
  readonly onAtras?: () => void;
  readonly onSiguiente?: () => void;
  readonly onCerrar?: () => void;
}) {
  const tema = useTema();

  // Estados locales para simulación visual sin afectar lógica de negocio
  const [docs, setDocs] = useState<readonly DocumentoMock[]>(documentos);
  const [ocupadoCon, setOcupadoCon] = useState<string | null>(null);
  const [videoState, setVideoState] = useState<EstadoVideoVisual>(estadoVideo);

  const listosFotos = docs.filter(d => d.estado === 'SUBIDO' || d.estado === 'CORREGIDO').length;
  const videoListo = videoState === 'SUBIDO';
  const totalListos = listosFotos + (videoListo ? 1 : 0);
  const totalRequeridos = docs.length + 1; // +1 del vídeo
  const porRepetir = docs.filter(d => d.estado === 'REQUIERE_CAMBIOS').length + (videoState === 'REPETIR' ? 1 : 0);
  const puedeContinuar = totalListos === totalRequeridos && porRepetir === 0;

  // Acciones demo
  const simularCaptura = (tipo: string) => {
    setOcupadoCon(tipo);
    setTimeout(() => {
      setDocs(prev => prev.map(d => d.tipo === tipo ? { ...d, estado: 'SUBIDO', motivo: null } : d));
      setOcupadoCon(null);
    }, 600);
  };

  const simularSubirVideo = () => {
    setOcupadoCon('presentation_video');
    setTimeout(() => {
      setVideoState('SUBIDO');
      setOcupadoCon(null);
    }, 700);
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      {/* Cabecera oficial de 4 pasos */}
      <CabeceraDePasos
        paso="documentos"
        hechos={['personal', 'vehiculo']}
        onCerrar={onCerrar}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: tema.ritmo.margenPantalla,
          paddingTop: 14,
          paddingBottom: 110,
          gap: 16
        }}
      >
        {/* Resumen Superior de Progreso */}
        <ResumenProgresoDocumentos
          listos={totalListos}
          total={totalRequeridos}
          porRepetir={porRepetir}
          subtituloVehiculo={tipoVehiculo === 'MOTO' ? 'Para tu moto (+ cascos de protección)' : 'Para tu carro (+ interior trasero)'}
        />

        {/* Agrupación en 4 secciones visuales */}
        {GRUPOS_DOCUMENTALES.map(grupo => {
          const docsDelGrupo = docs.filter(d => clasificarDocumentoEnGrupo(d.tipo) === grupo.clave);
          const listosGrupo = docsDelGrupo.filter(d => d.estado === 'SUBIDO' || d.estado === 'CORREGIDO').length;
          const totalGrupo = docsDelGrupo.length + (grupo.clave === 'presentacion' ? 1 : 0);
          const listosFinal = listosGrupo + (grupo.clave === 'presentacion' && videoListo ? 1 : 0);

          if (grupo.clave === 'presentacion') {
            return (
              <View key={grupo.clave} style={{ gap: 10 }}>
                <CabeceraGrupoDocumental
                  grupo={grupo}
                  listosEnGrupo={videoListo ? 1 : 0}
                  totalEnGrupo={1}
                />
                <TarjetaVideoPresentacion
                  titulo="Vídeo de presentación"
                  instruccion="Máximo 30 segundos, con tu cara y tu voz: di tu nombre y con qué trabajas. Con luz y sin ruido de fondo."
                  estado={videoState}
                  duracion={duracionVideo}
                  motivo={motivoVideo}
                  ocupado={ocupadoCon === 'presentation_video'}
                  onGrabarVideo={() => setVideoState('LISTO')}
                  onElegirVideo={() => setVideoState('LISTO')}
                  onSubirVideo={simularSubirVideo}
                  onRepetirVideo={() => setVideoState('SIN_VIDEO')}
                />
              </View>
            );
          }

          return (
            <View key={grupo.clave} style={{ gap: 10 }}>
              <CabeceraGrupoDocumental
                grupo={grupo}
                listosEnGrupo={listosFinal}
                totalEnGrupo={totalGrupo}
              />

              <View style={{ gap: 10 }}>
                {docsDelGrupo.map(doc => (
                  <TarjetaDocumento
                    key={doc.tipo}
                    tipo={doc.tipo}
                    titulo={doc.titulo}
                    instruccion={doc.instruccion}
                    estado={doc.estado}
                    motivo={doc.motivo}
                    ocupado={ocupadoCon === doc.tipo}
                    onTomarFoto={() => simularCaptura(doc.tipo)}
                    onElegirGaleria={() => simularCaptura(doc.tipo)}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Pie de navegación fijo */}
      <View style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopWidth: 1,
        borderTopColor: tema.color.borde,
        backgroundColor: tema.color.superficieElevada,
        paddingHorizontal: tema.ritmo.margenPantalla,
        paddingVertical: 12,
        gap: 8,
        ...tema.superficie.sombra
      }}>
        {!puedeContinuar ? (
          <Txt nivel="pie" tono="tenue" centrado estilo={{ fontSize: 11.5 }}>
            {porRepetir > 0
              ? 'Corrige los documentos marcados para continuar'
              : `Faltan ${totalRequeridos - totalListos} documentos por adjuntar para enviar a revisión`}
          </Txt>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Boton
              titulo="←  Atrás"
              variante="secundario"
              onPress={onAtras ?? (() => undefined)}
            />
          </View>

          <View style={{ flex: 1.4 }}>
            <Boton
              titulo="Siguiente  →"
              deshabilitado={!puedeContinuar}
              onPress={onSiguiente ?? (() => undefined)}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
