/**
 * El estado de una postulación que ya está en manos del servidor.
 *
 * Se vuelve a pedir cada vez: no hay copia local que pueda quedarse vieja. Si
 * administración pidió cambios, aquí se ven, documento por documento y con
 * su motivo, y desde aquí se va a corregirlos.
 *
 * Y SE VUELVE A PEDIR AL VOLVER
 *
 * Esta es la pantalla donde alguien se queda mirando a ver si le contestan.
 * Preguntar sólo al abrirla dejaba a quien la tenía abierta viendo «estamos
 * revisando» después de que administración hubiera decidido: al volver la
 * aplicación del segundo plano se pregunta otra vez. Es la misma consulta que
 * usa el inicio, así que abrir las dos no son dos peticiones.
 */

import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View, type AppStateStatus } from 'react-native';

import { Boton } from '../../components/Boton';
import { Pantalla } from '../../components/Pantalla';
import { useSesion } from '../../context/AuthContext';
import { usePostulacion } from '../../context/PostulacionContext';
import { describirDocumento } from '../../domain/postulacion';
import { consultarEstadoDePostulacion } from '../../services/estadoDePostulacion';
import { type SolicitudPropia } from '../../services/postulacion';
import { useTema } from '../../theme/ThemeContext';
import { espaciado, tipografia } from '../../theme/tokens';

const TITULOS: Readonly<Record<SolicitudPropia['status'], string>> = {
  draft: 'Tu expediente está a medias',
  pending: 'Estamos revisando tu postulación',
  approved: 'Aprobada: ya puedes conducir',
  needs_changes: 'Hace falta corregir algo',
  rejected: 'No pudimos aprobarla',
  suspended: 'Tu cuenta de conductor está suspendida'
};

const DETALLES: Readonly<Record<SolicitudPropia['status'], string>> = {
  draft: 'Faltan documentos. Súbelos cuando quieras y envíala a revisión.',
  pending: 'Te avisamos en cuanto haya una decisión. No hace falta que hagas nada.',
  approved: 'Entra como conductor y ponte en línea cuando estés listo.',
  needs_changes: 'Administración revisó tu expediente y pide que repitas lo que ves abajo.',
  rejected: 'Puedes revisar el motivo y volver a postularte corrigiendo lo que se indica.',
  suspended: 'Contacta con soporte para saber más.'
};

export default function EstadoDePostulacion() {
  const tema = useTema();
  const estilos = useMemo(() => crearEstilos(tema.color), [tema.color]);
  const { sesion, revalidar } = useSesion();
  const { solicitud, fijarSolicitud } = usePostulacion();
  const [cargando, setCargando] = useState(solicitud === null);
  const [error, setError] = useState<string | null>(null);

  const consultar = useCallback(() => {
    let vigente = true;
    void consultarEstadoDePostulacion({ forzar: true }).then(async lectura => {
      if (!vigente) return;
      setCargando(false);
      if (!lectura.ok) { setError('No pudimos consultar tu postulación. Inténtalo de nuevo.'); return; }
      setError(null);
      if (lectura.solicitud === null) { router.replace('/postulacion'); return; }
      fijarSolicitud(lectura.solicitud);

      // APROBADA: la identidad se pide otra vez AL BACKEND.
      //
      // Aquí no se escribe `role = 'driver'`: el permiso no se concede desde el
      // teléfono. Se revalida la sesión, y si el backend ya dice que esta
      // persona es conductora, entonces —y sólo entonces— se abre su inicio.
      // Si todavía no lo dice, se queda mirando el estado, que es la verdad.
      if (lectura.solicitud.status === 'approved') {
        await revalidar();
      }
    });
    return () => { vigente = false; };
  }, [fijarSolicitud, revalidar]);

  useEffect(() => consultar(), [consultar]);

  // Volver del segundo plano es cuando alguien viene a ver si le contestaron.
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (siguiente: AppStateStatus) => {
      if (siguiente === 'active') consultar();
    });
    return () => { suscripcion.remove(); };
  }, [consultar]);

  // El rol ya refrescado manda: en cuanto el backend reconoce a la conductora,
  // su sitio es el inicio de conductor.
  useEffect(() => {
    if (sesion.estado === 'AUTENTICADO' && sesion.usuario.role === 'driver') {
      router.replace('/conductor');
    }
  }, [sesion]);

  if (cargando || solicitud === null) {
    return (
      <Pantalla testID="postulacion-estado-cargando">
        <View style={estilos.centro}>
          {error ? <Text style={estilos.aviso}>{error}</Text> : <ActivityIndicator color={tema.color.acento} size="large" />}
        </View>
      </Pantalla>
    );
  }

  const editable = solicitud.status === 'draft' || solicitud.status === 'needs_changes' || solicitud.status === 'rejected';
  return (
    <Pantalla desplazable testID="postulacion-estado">
      <View style={estilos.contenido}>
        <Text style={estilos.titulo}>{TITULOS[solicitud.status]}</Text>
        <Text style={estilos.detalle}>{DETALLES[solicitud.status]}</Text>
        {solicitud.decisionReason ? <Text style={estilos.motivo}>{solicitud.decisionReason}</Text> : null}

        {solicitud.requestedChangeDetails.length > 0 ? (
          <View style={estilos.lista}>
            <Text style={estilos.seccion}>Documentos que hay que repetir</Text>
            {solicitud.requestedChangeDetails.map(cambio => (
              <View key={cambio.type} style={estilos.fila} testID={`correccion-${cambio.type}`}>
                <Text style={estilos.filaTitulo}>{describirDocumento(cambio.type)?.titulo ?? cambio.type}</Text>
                {cambio.reason ? <Text style={estilos.filaDetalle}>{cambio.reason}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
        {solicitud.textualCorrections ? (
          <View style={estilos.lista}>
            <Text style={estilos.seccion}>Datos que hay que corregir</Text>
            <Text style={estilos.filaDetalle}>{solicitud.textualCorrections}</Text>
          </View>
        ) : null}

        <Text style={estilos.pie}>Servicios: {solicitud.servicesAppliedFor.join(', ') || 'PASSENGER_TRANSPORT'} · Vehículo: {solicitud.vehicleType}</Text>

        {editable ? <Boton titulo="Corregir y reenviar" onPress={() => { router.replace('/postulacion/documentos'); }} testID="postulacion-corregir" /> : null}
        <Boton titulo="Volver" variante="secundario" onPress={() => { router.replace('/pasajero'); }} />
      </View>
    </Pantalla>
  );
}

const crearEstilos = (c: ReturnType<typeof useTema>['color']) => StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.lg },
  contenido: { padding: espaciado.lg, gap: espaciado.md },
  titulo: { color: c.textoPrimario, fontSize: tipografia.titulo.tamano, lineHeight: tipografia.titulo.alto, fontWeight: '700' },
  detalle: { color: c.textoSecundario, fontSize: tipografia.cuerpo.tamano, lineHeight: tipografia.cuerpo.alto },
  motivo: { color: c.aviso, fontSize: tipografia.cuerpo.tamano, lineHeight: tipografia.cuerpo.alto },
  lista: { gap: espaciado.sm },
  seccion: { color: c.textoSecundario, fontSize: tipografia.pie.tamano, fontWeight: '600', marginTop: espaciado.sm },
  fila: { gap: 2 },
  filaTitulo: { color: c.textoPrimario, fontSize: tipografia.cuerpoFuerte.tamano, fontWeight: '600' },
  filaDetalle: { color: c.textoSecundario, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  pie: { color: c.textoTenue, fontSize: tipografia.pie.tamano, marginTop: espaciado.sm },
  aviso: { color: c.peligro, fontSize: tipografia.cuerpo.tamano, textAlign: 'center' }
});
