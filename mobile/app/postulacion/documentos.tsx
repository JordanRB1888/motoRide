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
 */

import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Boton } from '../../components/Boton';
import { CabeceraDePasos } from '../../components/CabeceraDePasos';
import { Formulario } from '../../components/Formulario';
import { Pantalla } from '../../components/Pantalla';
import { usePostulacion } from '../../context/PostulacionContext';
import { describirDocumento, describirPaso, documentosRequeridos } from '../../domain/postulacion';
import { MENSAJES_DE_CAPTURA, capturar, nombreDeArchivo, type ModoDeCaptura } from '../../media/captura';
import {
  leerMiPostulacion,
  subirDocumento,
  type MotivoDePostulacion
} from '../../services/postulacion';
import { useTema } from '../../theme/ThemeContext';
import { espaciado, radios, tipografia } from '../../theme/tokens';

const MENSAJES: Readonly<Record<MotivoDePostulacion, string>> = {
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

  const recargar = useCallback(async () => {
    const lectura = await leerMiPostulacion();
    setCargando(false);
    if (!lectura.ok) { if (!alPerderLaSesion(lectura.motivo)) setAviso(MENSAJES[lectura.motivo]); return; }
    if (lectura.solicitud === null) { router.replace('/postulacion'); return; }
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
            return (
              <View key={tipo} style={[estilos.tarjeta, motivo ? estilos.tarjetaConCorreccion : hecho ? estilos.tarjetaHecha : null]} testID={`documento-${tipo}`}>
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
