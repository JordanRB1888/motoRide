/**
 * PASOS 4 y 5 — Tus documentos: foto a foto, y enviar.
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
import { Pantalla } from '../../components/Pantalla';
import { usePostulacion } from '../../context/PostulacionContext';
import { describirDocumento, documentosRequeridos } from '../../domain/postulacion';
import { MENSAJES_DE_CAPTURA, capturar, nombreDeArchivo, type ModoDeCaptura } from '../../media/captura';
import {
  enviarARevision,
  leerMiPostulacion,
  subirDocumento,
  type MotivoDePostulacion
} from '../../services/postulacion';
import { useTema } from '../../theme/ThemeContext';
import { espaciado, radios, tipografia } from '../../theme/tokens';

const MENSAJES: Readonly<Record<MotivoDePostulacion, string>> = {
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

export default function PasoDeDocumentos() {
  const tema = useTema();
  const estilos = useMemo(() => crearEstilos(tema.color), [tema.color]);
  const { solicitud, fijarSolicitud } = usePostulacion();
  const [cargando, setCargando] = useState(solicitud === null);
  const [ocupadoCon, setOcupadoCon] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const lectura = await leerMiPostulacion();
    setCargando(false);
    if (!lectura.ok) { setAviso(MENSAJES[lectura.motivo]); return; }
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
    if (!respuesta.ok) { setAviso(MENSAJES[respuesta.motivo]); return; }
    fijarSolicitud(respuesta.solicitud);
  };

  const enviar = async () => {
    setAviso(null);
    setEnviando(true);
    const respuesta = await enviarARevision();
    setEnviando(false);
    if (!respuesta.ok) {
      const faltan = respuesta.faltan?.map(tipo => describirDocumento(tipo)?.titulo ?? tipo).join(', ');
      setAviso(faltan ? `Faltan: ${faltan}.` : MENSAJES[respuesta.motivo]);
      return;
    }
    fijarSolicitud(respuesta.solicitud);
    router.replace('/postulacion/estado');
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

  const pedidos = documentosRequeridos(solicitud.vehicleType, solicitud.requirementsVersion);
  const entregados = new Set(solicitud.documents.map(documento => documento.type));
  const faltan = new Set(solicitud.missingDocuments);
  const porRepetir = new Map(solicitud.requestedChangeDetails.map(cambio => [cambio.type, cambio.reason]));
  const listaParaEnviar = faltan.size === 0 && porRepetir.size === 0 && ocupadoCon === null;
  const bloqueada = solicitud.status === 'pending' || solicitud.status === 'approved' || solicitud.status === 'suspended';

  return (
    <Pantalla desplazable testID="postulacion-documentos">
      <View style={estilos.contenido}>
        <Text style={estilos.paso}>Paso 4 de 5</Text>
        <Text style={estilos.titulo}>Tus documentos</Text>
        <Text style={estilos.detalle}>
          {solicitud.vehicleType === 'MOTO' ? 'Para tu moto' : 'Para tu carro'}: {pedidos.length} fotos.
          {' '}{faltan.size === 0 ? 'Ya están todas.' : `Faltan ${faltan.size}.`}
        </Text>
        {solicitud.textualCorrections ? <Text style={estilos.correccion}>Además: {solicitud.textualCorrections}</Text> : null}
        {aviso ? <Text style={estilos.aviso} testID="postulacion-aviso">{aviso}</Text> : null}

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
                  <Boton titulo={hecho ? 'Repetir foto' : 'Tomar foto'} onPress={() => { void adjuntar(tipo, 'TAKE_PHOTO'); }} cargando={ocupado} deshabilitado={ocupadoCon !== null} testID={`tomar-${tipo}`} />
                  <Boton titulo="Elegir de la galería" variante="secundario" onPress={() => { void adjuntar(tipo, 'CHOOSE_PHOTO'); }} deshabilitado={ocupadoCon !== null} testID={`elegir-${tipo}`} />
                </View>
              )}
            </View>
          );
        })}

        {bloqueada ? (
          <Boton titulo="Ver estado" onPress={() => { router.replace('/postulacion/estado'); }} />
        ) : (
          <>
            <Text style={estilos.paso}>Paso 5 de 5</Text>
            <Boton titulo="Enviar a revisión" onPress={() => { void enviar(); }} cargando={enviando} deshabilitado={!listaParaEnviar || enviando} descripcion={listaParaEnviar ? 'Lo revisamos y te avisamos.' : 'Se activa cuando estén todas las fotos.'} testID="postulacion-enviar" />
            <Boton titulo={`Cambiar vehículo o datos (${solicitud.vehicleType === 'MOTO' ? 'moto' : 'carro'})`} variante="secundario" onPress={() => { router.push('/postulacion/vehiculo'); }} deshabilitado={ocupadoCon !== null} testID="postulacion-cambiar-vehiculo" />
          </>
        )}
        <Boton titulo="Seguir más tarde" variante="secundario" onPress={() => { router.replace('/pasajero'); }} deshabilitado={ocupadoCon !== null || enviando} />
      </View>
    </Pantalla>
  );
}

const crearEstilos = (c: ReturnType<typeof useTema>['color']) => StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.lg },
  contenido: { padding: espaciado.lg, gap: espaciado.md },
  paso: { color: c.textoTenue, fontSize: tipografia.pie.tamano },
  titulo: { color: c.textoPrimario, fontSize: tipografia.titulo.tamano, lineHeight: tipografia.titulo.alto, fontWeight: '700' },
  detalle: { color: c.textoSecundario, fontSize: tipografia.cuerpo.tamano, lineHeight: tipografia.cuerpo.alto },
  correccion: { color: c.aviso, fontSize: tipografia.cuerpo.tamano, lineHeight: tipografia.cuerpo.alto },
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
  acciones: { gap: espaciado.sm, marginTop: espaciado.xs },
  aviso: { color: c.peligro, fontSize: tipografia.cuerpo.tamano, lineHeight: tipografia.cuerpo.alto }
});
