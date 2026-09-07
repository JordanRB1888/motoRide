/**
 * PASO 3 — Tus documentos: foto a foto.
 *
 * LA LISTA LA MANDA EL SERVIDOR
 *
 * Qué falta sale de `missingDocuments` del expediente, no de una lista local:
 * si el vehículo cambia, cambia lo que se pide, y si administración pidió
 * repetir algo, aparece marcado con su motivo. El dominio local sólo pone
 * nombres e instrucciones a cada tipo.
 *
 * LA CÁMARA SE PIDE AL TOCAR, Y LA FOTO NO SE QUEDA
 *
 * `capturar()` pide el permiso de cámara en el momento de pulsar «Tomar
 * foto», nunca al abrir la pantalla. La foto que devuelve se sube y se
 * olvida: no se guarda en el teléfono, no se muestra en grande, no se
 * reutiliza. Para verla luego hay que pedírsela al servidor con sesión.
 *
 * EL VÍDEO SE GRABA Y SE SUBE APARTE
 *
 * El vídeo de presentación está en la misma lista que las fotos porque el
 * servidor lo pide igual que a ellas, pero tiene su propia tarjeta: pesa diez
 * veces más y por eso no se sube solo al grabarlo. Primero se graba, se ve que
 * quedó bien, y entonces se pulsa subir. En una red móvil venezolana, gastar
 * cuarenta megas sin querer no es un detalle.
 */

import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { Boton } from '../../components/Boton';
import { CabeceraDePasos } from '../../components/CabeceraDePasos';
import { Formulario } from '../../components/Formulario';
import { Pantalla } from '../../components/Pantalla';
import { usePostulacion } from '../../context/PostulacionContext';
import { describirDocumento, describirPaso, documentosRequeridos } from '../../domain/postulacion';
import {
  MENSAJES_DE_CAPTURA,
  MENSAJES_DE_VIDEO,
  capturar,
  capturarVideo,
  nombreDeArchivo,
  nombreDelVideo,
  type ModoDeCaptura,
  type ModoDeVideo,
  type VideoCapturado
} from '../../media/captura';
import {
  leerMiPostulacion,
  subirDocumento,
  subirVideoDePresentacion,
  type MotivoDePostulacion
} from '../../services/postulacion';
import { useTema } from '../../theme/ThemeContext';
import { espaciado, radios, tipografia } from '../../theme/tokens';

const MENSAJES: Readonly<Record<MotivoDePostulacion, string>> = {
  VIDEO_DEMASIADO_LARGO: 'El vídeo dura más de 30 segundos. Grábalo más corto.',
  VIDEO_SIN_DURACION: 'No pudimos verificar la duración de este vídeo. Graba uno nuevo o elige otro archivo.',
  SESION_CADUCADA: 'Tu sesión caducó. Vuelve a entrar para seguir con tu solicitud.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.',
  DATOS_INVALIDOS: 'Falta algún dato del expediente. Revisa los pasos anteriores.',
  FALTAN_DOCUMENTOS: 'Todavía faltan documentos.',
  YA_TIENE_SOLICITUD: 'Ya tienes una postulación.',
  CUENTA_EXISTENTE: 'Ya existe una cuenta con esos datos.',
  NECESITA_CONTRASENA: 'Hace falta la contraseña de tu cuenta.',
  EN_REVISION: 'Tu postulación está en revisión: ahora no se puede cambiar.',
  DOCUMENTO_INVALIDO: 'Ese archivo no vale como documento. Usa una foto JPG, PNG o WebP.',
  ARCHIVO_DEMASIADO_GRANDE: 'La foto pesa más de 5 MB. Vuelve a tomarla.',
  SIN_CONEXION: 'Sin conexión. Revisa tu red e inténtalo de nuevo.',
  ERROR_DEL_SERVIDOR: 'No pudimos guardar. Inténtalo de nuevo en un momento.'
};

/**
 * En qué punto está el vídeo.
 *
 * Los cinco estados salen de lo que sabe el servidor —si el documento está
 * entregado, si administración pidió repetirlo— más el único paso que sólo
 * conoce el teléfono: haberlo grabado y no haberlo subido aún. No hay estados
 * inventados por encima de eso.
 */
/** El tipo del vídeo, tal como lo llama el servidor. */
const TIPO_DEL_VIDEO = 'presentation_video';

type EstadoDelVideo = 'SIN_VIDEO' | 'LISTO' | 'SUBIENDO' | 'SUBIDO' | 'REPETIR';

function estadoDelVideo(entrada: {
  readonly motivo: string | null | undefined;
  readonly subiendo: boolean;
  readonly entregado: boolean;
  readonly grabado: VideoCapturado | null;
}): EstadoDelVideo {
  if (entrada.subiendo) return 'SUBIENDO';
  // Lo recién grabado va PRIMERO, incluso con una corrección encima.
  //
  // Al revés se llega a un callejón sin salida: administración pide repetir el
  // vídeo, la persona lo graba, y la tarjeta sigue diciendo «hay que grabarlo
  // otra vez» sin ofrecer nunca el botón de subir. El motivo de la corrección
  // se sigue viendo en el texto de la tarjeta; lo que cambia es que ahora hay
  // algo que subir.
  if (entrada.grabado !== null) return 'LISTO';
  if (entrada.motivo) return 'REPETIR';
  if (entrada.entregado) return 'SUBIDO';
  return 'SIN_VIDEO';
}

/**
 * La sesion caduco: se vuelve al acceso.
 *
 * Un aviso rojo en una pantalla vacia deja a la persona sin salida; lo que
 * necesita es volver a entrar. El expediente sigue en el servidor y al
 * regresar continua donde estaba.
 */
function alPerderLaSesion(motivo: MotivoDePostulacion): boolean {
  if (motivo !== 'SESION_CADUCADA') return false;
  router.replace('/acceso');
  return true;
}

export default function PasoDeDocumentos() {
  const tema = useTema();
  const estilos = useMemo(() => crearEstilos(tema.color), [tema.color]);
  const { solicitud, fijarSolicitud } = usePostulacion();
  const [cargando, setCargando] = useState(solicitud === null);
  const [ocupadoCon, setOcupadoCon] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // El vídeo grabado y todavía no subido. Vive sólo mientras dura la pantalla:
  // no se guarda en disco ni se recuerda entre sesiones.
  const [videoGrabado, setVideoGrabado] = useState<VideoCapturado | null>(null);
  // Para colocarse en el documento que hay que repetir. Se guarda dónde quedó
  // cada tarjeta y se salta una sola vez, al llegar.
  const cuerpo = useRef<ScrollView | null>(null);
  const alturas = useRef(new Map<string, number>());
  const yaSeColoco = useRef(false);

  const recargar = useCallback(async () => {
    const lectura = await leerMiPostulacion();
    setCargando(false);
    if (!lectura.ok) { if (!alPerderLaSesion(lectura.motivo)) setAviso(MENSAJES[lectura.motivo]); return; }
    if (lectura.solicitud === null) { router.replace('/postulacion'); return; }
    // Una lectura buena deja sin sentido el aviso anterior. Sin esto, el error
    // de una operación que ya se arregló seguía en pantalla, contradiciendo a
    // las tarjetas que ya estaban en verde.
    setAviso(null);
    fijarSolicitud(lectura.solicitud);
  }, [fijarSolicitud]);

  useEffect(() => { void recargar(); }, [recargar]);

  const adjuntar = async (tipo: string, modo: ModoDeCaptura) => {
    setAviso(null);
    const captura = await capturar(modo);
    if (!captura.ok) {
      // Cancelar no es un error: no se dice nada.
      if (captura.motivo !== 'CANCELADO') setAviso(MENSAJES_DE_CAPTURA[captura.motivo]);
      return;
    }
    setOcupadoCon(tipo);
    const respuesta = await subirDocumento(tipo, {
      uri: captura.foto.uri,
      nombre: nombreDeArchivo(tipo, captura.foto.mimeType),
      tipo: captura.foto.mimeType,
      tamano: captura.foto.tamano
    });
    setOcupadoCon(null);
    if (!respuesta.ok) { if (!alPerderLaSesion(respuesta.motivo)) setAviso(MENSAJES[respuesta.motivo]); return; }
    fijarSolicitud(respuesta.solicitud);
  };

  /**
   * Lleva la vista al primer documento con corrección.
   *
   * Sólo una vez por visita y sólo si administración pidió algo: si no, la
   * pantalla se queda arriba, que es donde debe empezar quien viene a subir
   * sus fotos por primera vez.
   */
  const irALaCorreccion = useCallback((tipo: string) => {
    if (yaSeColoco.current) return;
    const altura = alturas.current.get(tipo);
    if (altura === undefined || cuerpo.current === null) return;
    yaSeColoco.current = true;
    cuerpo.current.scrollTo({ y: Math.max(0, altura - 12), animated: true });
  }, []);

  const grabar = async (modo: ModoDeVideo) => {
    setAviso(null);
    const captura = await capturarVideo(modo);
    if (!captura.ok) {
      if (captura.motivo !== 'CANCELADO') setAviso(MENSAJES_DE_VIDEO[captura.motivo]);
      return;
    }
    // Grabado, no subido: la persona decide cuándo gastar sus megas.
    setVideoGrabado(captura.video);
  };

  const subirElVideo = async (video: VideoCapturado) => {
    setAviso(null);
    setOcupadoCon(TIPO_DEL_VIDEO);
    const respuesta = await subirVideoDePresentacion({
      uri: video.uri,
      nombre: nombreDelVideo(video.mimeType),
      tipo: video.mimeType,
      tamano: video.tamano
    });
    setOcupadoCon(null);
    if (!respuesta.ok) { if (!alPerderLaSesion(respuesta.motivo)) setAviso(MENSAJES[respuesta.motivo]); return; }
    // Ya está en el servidor: la copia local sobra y se suelta.
    setVideoGrabado(null);
    fijarSolicitud(respuesta.solicitud);
  };

  if (cargando || solicitud === null) {
    return (
      <Pantalla testID="postulacion-documentos-cargando">
        <View style={estilos.centro}>
          {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : <ActivityIndicator color={tema.color.acento} size="large" />}
        </View>
      </Pantalla>
    );
  }

  const paso = describirPaso('documentos');
  const pedidos = documentosRequeridos(solicitud.vehicleType, solicitud.requirementsVersion);
  const entregados = new Set(solicitud.documents.map(documento => documento.type));
  const faltan = new Set(solicitud.missingDocuments);
  const porRepetir = new Map(solicitud.requestedChangeDetails.map(cambio => [cambio.type, cambio.reason]));
  const listos = pedidos.length - faltan.size;
  const puedeSeguir = faltan.size === 0 && porRepetir.size === 0 && ocupadoCon === null;
  const bloqueada = solicitud.status === 'pending' || solicitud.status === 'approved' || solicitud.status === 'suspended';

  return (
    <Formulario
      refDelCuerpo={cuerpo}
      testID="postulacion-documentos"
      cabecera={<CabeceraDePasos paso="documentos" hechos={['personal', 'vehiculo']} onCerrar={() => { router.replace('/pasajero'); }} />}
      pie={(
        <View style={estilos.pie}>
          {aviso ? <Text style={estilos.aviso} testID="postulacion-aviso">{aviso}</Text> : null}
          {bloqueada ? (
            <Boton titulo="Ver estado" onPress={() => { router.replace('/postulacion/estado'); }} />
          ) : (
            <View style={estilos.acciones}>
              <View style={estilos.mitad}>
                <Boton titulo="←  Atrás" variante="secundario" onPress={() => { router.push('/postulacion/vehiculo'); }} deshabilitado={ocupadoCon !== null} testID="postulacion-cambiar-vehiculo" />
              </View>
              <View style={estilos.mitad}>
                <Boton
                  titulo="Siguiente  →"
                  onPress={() => { router.push('/postulacion/confirmacion'); }}
                  deshabilitado={!puedeSeguir}
                  descripcion={puedeSeguir ? 'Revisa y envía tu solicitud.' : 'Se activa cuando estén todas las fotos.'}
                  testID="postulacion-continuar"
                />
              </View>
            </View>
          )}
        </View>
      )}
    >
      {(
        <View style={estilos.contenido}>
          <Text style={estilos.titulo}>{paso.titulo}</Text>
          <Text style={estilos.detalle}>
            {solicitud.vehicleType === 'MOTO' ? 'Para tu moto' : 'Para tu carro'}: {listos} de {pedidos.length} listas.
          </Text>
          {solicitud.textualCorrections ? <Text style={estilos.correccion}>Además: {solicitud.textualCorrections}</Text> : null}

          {pedidos.map(tipo => {
            const documento = describirDocumento(tipo);
            const hecho = entregados.has(tipo) && !faltan.has(tipo);
            const motivo = porRepetir.get(tipo);
            const ocupado = ocupadoCon === tipo;
            const alMedir = (evento: LayoutChangeEvent) => {
              alturas.current.set(tipo, evento.nativeEvent.layout.y);
              if (motivo) irALaCorreccion(tipo);
            };

            if (documento?.medio === 'video') {
              const estado = estadoDelVideo({ motivo, subiendo: ocupado, entregado: hecho, grabado: videoGrabado });
              const duracion = videoGrabado?.duracion;
              return (
                <View
                  key={tipo}
                  style={[estilos.tarjeta, motivo ? estilos.tarjetaConCorreccion : estado === 'SUBIDO' ? estilos.tarjetaHecha : null]}
                  onLayout={alMedir}
                  testID={`documento-${tipo}`}
                >
                  <Text style={estilos.tarjetaTitulo}>{documento.titulo}{estado === 'SUBIDO' ? ' · listo' : ''}</Text>
                  <Text style={estilos.tarjetaDetalle}>{motivo ? `Repetir: ${motivo}` : documento.instruccion}</Text>
                  <Text style={estilos.estadoDelVideo} testID="estado-video">
                    {estado === 'SUBIENDO' ? 'Subiendo el vídeo…'
                      : estado === 'LISTO' ? `Grabado${typeof duracion === 'number' ? `, ${Math.round(duracion)} segundos` : ''}. Falta subirlo.`
                      : estado === 'SUBIDO' ? 'Subido. Sólo administración puede verlo.'
                      : estado === 'REPETIR' ? 'Hay que grabarlo otra vez.'
                      : 'Todavía no has grabado el vídeo.'}
                  </Text>
                  {bloqueada ? null : estado === 'LISTO' && videoGrabado !== null ? (
                    <View style={estilos.acciones}>
                      <View style={estilos.mitad}>
                        <Boton titulo="Subir vídeo" onPress={() => { void subirElVideo(videoGrabado); }} deshabilitado={ocupadoCon !== null} testID="subir-video" />
                      </View>
                      <View style={estilos.mitad}>
                        <Boton titulo="Repetir" variante="secundario" onPress={() => { void grabar('TAKE_VIDEO'); }} deshabilitado={ocupadoCon !== null} testID="repetir-video" />
                      </View>
                    </View>
                  ) : (
                    <View style={estilos.acciones}>
                      <View style={estilos.mitad}>
                        <Boton titulo={estado === 'SUBIDO' ? 'Grabar otro' : 'Grabar vídeo'} onPress={() => { void grabar('TAKE_VIDEO'); }} cargando={ocupado} deshabilitado={ocupadoCon !== null} testID="grabar-video" />
                      </View>
                      <View style={estilos.mitad}>
                        <Boton titulo="Galería" variante="secundario" onPress={() => { void grabar('CHOOSE_VIDEO'); }} deshabilitado={ocupadoCon !== null} testID="elegir-video" />
                      </View>
                    </View>
                  )}
                </View>
              );
            }

            return (
              <View key={tipo} style={[estilos.tarjeta, motivo ? estilos.tarjetaConCorreccion : hecho ? estilos.tarjetaHecha : null]} onLayout={alMedir} testID={`documento-${tipo}`}>
                <Text style={estilos.tarjetaTitulo}>{documento?.titulo ?? tipo}{hecho && !motivo ? ' · listo' : ''}</Text>
                <Text style={estilos.tarjetaDetalle}>{motivo ? `Repetir: ${motivo}` : documento?.instruccion ?? ''}</Text>
                {bloqueada ? null : (
                  <View style={estilos.acciones}>
                    <View style={estilos.mitad}>
                      <Boton titulo={hecho ? 'Repetir' : 'Tomar foto'} onPress={() => { void adjuntar(tipo, 'TAKE_PHOTO'); }} cargando={ocupado} deshabilitado={ocupadoCon !== null} testID={`tomar-${tipo}`} />
                    </View>
                    <View style={estilos.mitad}>
                      <Boton titulo="Galería" variante="secundario" onPress={() => { void adjuntar(tipo, 'CHOOSE_PHOTO'); }} deshabilitado={ocupadoCon !== null} testID={`elegir-${tipo}`} />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Formulario>
  );
}

const crearEstilos = (c: ReturnType<typeof useTema>['color']) => StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.lg },
  contenido: { padding: espaciado.lg, gap: espaciado.md },
  titulo: { color: c.textoPrimario, fontSize: tipografia.subtitulo.tamano, lineHeight: tipografia.subtitulo.alto, fontWeight: '700' },
  detalle: { color: c.textoSecundario, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  correccion: { color: c.aviso, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  tarjeta: {
    gap: espaciado.sm,
    padding: espaciado.lg,
    borderRadius: radios.md,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie
  },
  tarjetaHecha: { borderColor: c.exito },
  tarjetaConCorreccion: { borderColor: c.aviso },
  tarjetaTitulo: { color: c.textoPrimario, fontSize: tipografia.cuerpoFuerte.tamano, fontWeight: '600' },
  tarjetaDetalle: { color: c.textoSecundario, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  estadoDelVideo: { color: c.textoPrimario, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto, fontWeight: '600' },
  acciones: { flexDirection: 'row', gap: espaciado.md },
  mitad: { flex: 1, minWidth: 0 },
  aviso: { color: c.peligro, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto, marginBottom: espaciado.sm },
  pie: {
    borderTopWidth: 1,
    borderTopColor: c.borde,
    backgroundColor: c.superficieHundida,
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.md
  }
});
