/**
 * PASO 4 — Confirmación: qué se va a enviar, y enviarlo.
 *
 * El cuarto paso del formulario. Aquí no se escribe nada: se lee lo que el
 * SERVIDOR tiene guardado —no el borrador local— y se manda a revisión. Si
 * algo está mal, cada bloque tiene su enlace al paso donde se corrige.
 *
 * Nada de esto concede nada: el envío deja el expediente en manos de
 * administración, que decide.
 */

import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Boton } from '../../components/Boton';
import { CabeceraDePasos } from '../../components/CabeceraDePasos';
import { Formulario } from '../../components/Formulario';
import { Pantalla } from '../../components/Pantalla';
import { usePostulacion } from '../../context/PostulacionContext';
import { describirDocumento, describirPaso, describirServicio } from '../../domain/postulacion';
import {
  enviarARevision,
  leerMiPostulacion,
  type MotivoDePostulacion
} from '../../services/postulacion';
import { useTema } from '../../theme/ThemeContext';
import { espaciado, radios, tipografia } from '../../theme/tokens';

const MENSAJES: Readonly<Record<MotivoDePostulacion, string>> = {
  SESION_CADUCADA: 'Tu sesión caducó. Vuelve a entrar para seguir con tu solicitud.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.',
  DATOS_INVALIDOS: 'Falta algún dato. Revisa los pasos anteriores.',
  FALTAN_DOCUMENTOS: 'Todavía faltan documentos.',
  YA_TIENE_SOLICITUD: 'Ya tienes una postulación.',
  CUENTA_EXISTENTE: 'Ya existe una cuenta con esos datos.',
  NECESITA_CONTRASENA: 'Hace falta la contraseña de tu cuenta.',
  EN_REVISION: 'Tu postulación ya está en revisión.',
  DOCUMENTO_INVALIDO: 'Algún documento no es válido.',
  ARCHIVO_DEMASIADO_GRANDE: 'Algún archivo pesa demasiado.',
  SIN_CONEXION: 'Sin conexión. Revisa tu red e inténtalo de nuevo.',
  ERROR_DEL_SERVIDOR: 'No pudimos enviar. Inténtalo de nuevo en un momento.'
};

const texto = (valor: unknown) => (typeof valor === 'string' ? valor : typeof valor === 'number' ? String(valor) : '');

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

export default function PasoDeConfirmacion() {
  const tema = useTema();
  const estilos = useMemo(() => crearEstilos(tema.color), [tema.color]);
  const { solicitud, fijarSolicitud } = usePostulacion();
  const [cargando, setCargando] = useState(solicitud === null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const lectura = await leerMiPostulacion();
    setCargando(false);
    if (!lectura.ok) { if (!alPerderLaSesion(lectura.motivo)) setAviso(MENSAJES[lectura.motivo]); return; }
    if (lectura.solicitud === null) { router.replace('/postulacion'); return; }
    fijarSolicitud(lectura.solicitud);
  }, [fijarSolicitud]);

  useEffect(() => { void recargar(); }, [recargar]);

  const enviar = async () => {
    setAviso(null);
    setEnviando(true);
    const respuesta = await enviarARevision();
    setEnviando(false);
    if (!respuesta.ok) {
      if (alPerderLaSesion(respuesta.motivo)) return;
      const faltan = respuesta.faltan?.map(tipo => describirDocumento(tipo)?.titulo ?? tipo).join(', ');
      setAviso(faltan ? `Faltan: ${faltan}.` : MENSAJES[respuesta.motivo]);
      return;
    }
    fijarSolicitud(respuesta.solicitud);
    router.replace('/postulacion/estado');
  };

  if (cargando || solicitud === null) {
    return (
      <Pantalla testID="postulacion-confirmacion-cargando">
        <View style={estilos.centro}>
          {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : <ActivityIndicator color={tema.color.acento} size="large" />}
        </View>
      </Pantalla>
    );
  }

  const paso = describirPaso('confirmacion');
  const personal = solicitud.personal ?? {};
  const vehiculo = solicitud.vehicle ?? {};
  const listo = solicitud.missingDocuments.length === 0 && solicitud.requestedChangeDetails.length === 0;

  return (
    <Formulario
      testID="postulacion-confirmacion"
      cabecera={<CabeceraDePasos paso="confirmacion" hechos={['personal', 'vehiculo', 'documentos']} onCerrar={() => { router.replace('/pasajero'); }} />}
      pie={(
        <View style={estilos.pie}>
          {aviso ? <Text style={estilos.aviso} testID="postulacion-aviso">{aviso}</Text> : null}
          <View style={estilos.acciones}>
            <View style={estilos.mitad}>
              <Boton titulo="←  Atrás" variante="secundario" onPress={() => { router.back(); }} deshabilitado={enviando} />
            </View>
            <View style={estilos.mitad}>
              <Boton
                titulo="Enviar solicitud"
                onPress={() => { void enviar(); }}
                cargando={enviando}
                deshabilitado={!listo || enviando}
                descripcion={listo ? 'Lo revisamos y te avisamos.' : 'Faltan documentos por subir.'}
                testID="postulacion-enviar"
              />
            </View>
          </View>
        </View>
      )}
    >
      {(
        <View style={estilos.contenido}>
          <Text style={estilos.titulo}>{paso.titulo}</Text>
          <Text style={estilos.detalle}>{paso.detalle}</Text>

          <View style={estilos.tarjeta}>
            <View style={estilos.cabeceraDeTarjeta}>
              <Text style={estilos.tarjetaTitulo}>Información personal</Text>
              <Boton titulo="Editar" variante="secundario" onPress={() => { router.push('/postulacion'); }} testID="editar-personal" />
            </View>
            <Fila etiqueta="Nombre" valor={`${texto(personal.firstName)} ${texto(personal.lastName)}`.trim()} estilos={estilos} />
            <Fila etiqueta="Cédula" valor={texto(personal.identityNumber)} estilos={estilos} />
            <Fila etiqueta="RIF" valor={texto(personal.rif)} estilos={estilos} />
            <Fila etiqueta="Teléfono" valor={texto(personal.phone)} estilos={estilos} />
            <Fila etiqueta="Correo" valor={texto(personal.email)} estilos={estilos} />
            <Fila etiqueta="Ciudad" valor={`${texto(personal.city)}${personal.region ? `, ${texto(personal.region)}` : ''}`} estilos={estilos} />
          </View>

          <View style={estilos.tarjeta}>
            <View style={estilos.cabeceraDeTarjeta}>
              <Text style={estilos.tarjetaTitulo}>Vehículo y servicios</Text>
              <Boton titulo="Editar" variante="secundario" onPress={() => { router.push('/postulacion/vehiculo'); }} testID="editar-vehiculo" />
            </View>
            <Fila etiqueta="Vehículo" valor={solicitud.vehicleType === 'MOTO' ? 'Moto' : 'Carro'} estilos={estilos} />
            <Fila etiqueta="Datos" valor={[texto(vehiculo.brand), texto(vehiculo.model), texto(vehiculo.year), texto(vehiculo.color)].filter(Boolean).join(' · ')} estilos={estilos} />
            <Fila etiqueta="Placa" valor={texto(vehiculo.plate)} estilos={estilos} />
            <Fila etiqueta="Servicios" valor={solicitud.servicesAppliedFor.map(clave => describirServicio(clave).titulo).join(', ')} estilos={estilos} />
            <Fila etiqueta="Licencia" valor={solicitud.license.grade === null ? '' : `Grado ${solicitud.license.grade}${solicitud.license.expiration ? ` · vence ${solicitud.license.expiration}` : ''}`} estilos={estilos} />
            <Fila etiqueta="Certificado médico" valor={solicitud.medicalCertificate.expiration ? `Vence ${solicitud.medicalCertificate.expiration}` : 'Sin fecha'} estilos={estilos} />
          </View>

          <View style={estilos.tarjeta}>
            <View style={estilos.cabeceraDeTarjeta}>
              <Text style={estilos.tarjetaTitulo}>Documentos</Text>
              <Boton titulo="Editar" variante="secundario" onPress={() => { router.push('/postulacion/documentos'); }} testID="editar-documentos" />
            </View>
            <Fila etiqueta="Subidos" valor={`${solicitud.documents.length} fotos`} estilos={estilos} />
            {solicitud.missingDocuments.length > 0 ? (
              <Text style={estilos.faltan}>
                Faltan: {solicitud.missingDocuments.map(tipo => describirDocumento(tipo)?.titulo ?? tipo).join(', ')}.
              </Text>
            ) : (
              <Text style={estilos.completo}>Están todas.</Text>
            )}
          </View>

          <Text style={estilos.nota}>
            Al enviar, administración revisa tu solicitud. Te avisamos en cuanto haya una decisión; mientras tanto no
            recibirás carreras.
          </Text>
        </View>
      )}
    </Formulario>
  );
}

/** Una línea de resumen: etiqueta a la izquierda, valor a la derecha. */
function Fila({ etiqueta, valor, estilos }: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly estilos: ReturnType<typeof crearEstilos>;
}) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.filaEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.filaValor} numberOfLines={2}>{valor || '—'}</Text>
    </View>
  );
}

const crearEstilos = (c: ReturnType<typeof useTema>['color']) => StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.lg },
  contenido: { padding: espaciado.lg, gap: espaciado.md },
  titulo: { color: c.textoPrimario, fontSize: tipografia.subtitulo.tamano, lineHeight: tipografia.subtitulo.alto, fontWeight: '700' },
  detalle: { color: c.textoSecundario, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  tarjeta: {
    gap: espaciado.sm,
    padding: espaciado.lg,
    borderRadius: radios.md,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie
  },
  cabeceraDeTarjeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.md },
  tarjetaTitulo: { flex: 1, color: c.textoPrimario, fontSize: tipografia.cuerpoFuerte.tamano, fontWeight: '600' },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: espaciado.md },
  filaEtiqueta: { width: 120, color: c.textoTenue, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  filaValor: { flex: 1, color: c.textoPrimario, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  faltan: { color: c.aviso, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  completo: { color: c.exito, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  nota: { color: c.textoTenue, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  aviso: { color: c.peligro, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto, marginBottom: espaciado.sm },
  acciones: { flexDirection: 'row', gap: espaciado.md },
  mitad: { flex: 1, minWidth: 0 },
  pie: {
    borderTopWidth: 1,
    borderTopColor: c.borde,
    backgroundColor: c.superficieHundida,
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.md
  }
});
