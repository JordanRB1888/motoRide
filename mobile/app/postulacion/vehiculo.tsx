/**
 * PASO 3 — Tu vehículo: marca, modelo, placa, documento legal y licencia.
 *
 * Al continuar pasa lo importante: si todavía no hay expediente, se CREA en el
 * servidor (cuenta y expediente, como borrador) y se entra con la contraseña
 * por el camino normal de sesión; si ya lo hay, se CORRIGE. En los dos casos
 * el servidor devuelve el expediente y él decide qué documentos faltan.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '../../components/Boton';
import { CampoDeTexto } from '../../components/CampoDeTexto';
import { Opcion } from '../../components/Opcion';
import { Pantalla } from '../../components/Pantalla';
import { useSesion } from '../../context/AuthContext';
import { usePostulacion } from '../../context/PostulacionContext';
import {
  DOCUMENTOS_LEGALES_DEL_VEHICULO,
  GRADOS_DE_LICENCIA,
  describirPaso,
  pasoCompleto,
  validarCertificadoMedico,
  validarLicencia,
  validarVehiculo,
  type DatosDelVehiculo,
  type ErroresDePaso
} from '../../domain/postulacion';
import {
  actualizarMiPostulacion,
  camposDelServidor,
  crearPostulacion,
  type MotivoDePostulacion
} from '../../services/postulacion';
import { colores, espaciado, tipografia } from '../../theme/tokens';

const MENSAJES: Readonly<Record<MotivoDePostulacion, string>> = {
  DATOS_INVALIDOS: 'El servidor no aceptó algún dato. Revisa los pasos anteriores.',
  FALTAN_DOCUMENTOS: 'Faltan documentos.',
  YA_TIENE_SOLICITUD: 'Ya tienes una postulación. Te llevamos a su estado.',
  CUENTA_EXISTENTE: 'Ya existe una cuenta con ese correo o teléfono que no es de pasajera.',
  NECESITA_CONTRASENA: 'Ya tienes cuenta con ese correo o teléfono: en el paso anterior escribe la contraseña de esa cuenta.',
  EN_REVISION: 'Tu postulación está en revisión y no se puede tocar ahora.',
  DOCUMENTO_INVALIDO: 'Documento no válido.',
  ARCHIVO_DEMASIADO_GRANDE: 'Archivo demasiado grande.',
  SIN_CONEXION: 'Sin conexión. Revisa tu red e inténtalo de nuevo.',
  ERROR_DEL_SERVIDOR: 'No pudimos guardar. Inténtalo de nuevo en un momento.'
};

export default function PasoDeVehiculo() {
  const { entrar } = useSesion();
  const { borrador, actualizar, solicitud, fijarSolicitud } = usePostulacion();
  const tipo = borrador.vehiculo ?? borrador.datosDelVehiculo.tipo;
  const [datos, setDatos] = useState<DatosDelVehiculo>({ ...borrador.datosDelVehiculo, tipo });
  const [licencia, setLicencia] = useState(borrador.licencia);
  const [certificado, setCertificado] = useState(borrador.certificadoMedico);
  const [errores, setErrores] = useState<ErroresDePaso>({});
  const [erroresDeLicencia, setErroresDeLicencia] = useState<ErroresDePaso>({});
  const [errorDeCertificado, setErrorDeCertificado] = useState<ErroresDePaso>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo: keyof DatosDelVehiculo) => (valor: string) => {
    setDatos(actual => ({ ...actual, [campo]: valor }));
  };

  const continuar = async () => {
    const fallos = validarVehiculo(datos);
    const fallosDeLicencia = validarLicencia(licencia, datos.tipo, { paraEnvio: true });
    const falloDeCertificado = validarCertificadoMedico(certificado);
    setErrores(fallos);
    setErroresDeLicencia(fallosDeLicencia);
    setErrorDeCertificado(falloDeCertificado);
    if (!pasoCompleto(fallos) || !pasoCompleto(fallosDeLicencia) || !pasoCompleto(falloDeCertificado)) return;

    const completo = {
      vehiculo: datos.tipo,
      servicios: borrador.servicios,
      personales: borrador.personales,
      datosDelVehiculo: datos,
      licencia,
      certificadoMedico: certificado
    };
    actualizar({ datosDelVehiculo: datos, licencia, certificadoMedico: certificado });
    setAviso(null);
    setGuardando(true);

    if (solicitud !== null) {
      // Ya hay expediente: se corrige lo que cambió.
      const respuesta = await actualizarMiPostulacion(camposDelServidor(completo));
      setGuardando(false);
      if (!respuesta.ok) { setAviso(MENSAJES[respuesta.motivo]); return; }
      fijarSolicitud(respuesta.solicitud);
      router.replace('/postulacion/documentos');
      return;
    }

    const creacion = await crearPostulacion({ ...completo, contrasena: borrador.contrasena });
    if (!creacion.ok) {
      setGuardando(false);
      setAviso(MENSAJES[creacion.motivo]);
      if (creacion.motivo === 'YA_TIENE_SOLICITUD') router.replace('/postulacion/estado');
      return;
    }
    // La sesión se abre por el camino de siempre: el contexto y su almacén.
    const acceso = await entrar({ identificador: creacion.correo, contrasena: borrador.contrasena });
    setGuardando(false);
    if (!acceso.ok) {
      setAviso('Tu expediente se creó, pero no pudimos abrir la sesión. Entra con tu correo y contraseña para seguir.');
      return;
    }
    fijarSolicitud(creacion.solicitud);
    actualizar({ contrasena: '' });
    router.replace('/postulacion/documentos');
  };

  const paso = describirPaso('vehiculo');
  return (
    <Pantalla desplazable testID="postulacion-vehiculo">
      <View style={estilos.contenido}>
        <Text style={estilos.paso}>Paso 3 de 5</Text>
        <Text style={estilos.titulo}>{paso.titulo}</Text>
        <Text style={estilos.detalle}>{datos.tipo === 'MOTO' ? 'Tu moto.' : 'Tu carro.'} {paso.detalle}</Text>

        <CampoDeTexto etiqueta="Marca" valor={datos.marca} onCambiar={cambiar('marca')} error={errores.marca} ejemplo="Bera" capitalizar="words" testID="campo-marca" />
        <CampoDeTexto etiqueta="Modelo" valor={datos.modelo} onCambiar={cambiar('modelo')} error={errores.modelo} ejemplo="SBR" capitalizar="characters" testID="campo-modelo" />
        <CampoDeTexto etiqueta="Año" valor={datos.ano} onCambiar={cambiar('ano')} error={errores.ano} ejemplo="2021" teclado="number-pad" testID="campo-ano" />
        <CampoDeTexto etiqueta="Color" valor={datos.color} onCambiar={cambiar('color')} error={errores.color} capitalizar="words" testID="campo-color" />
        <CampoDeTexto etiqueta="Placa" valor={datos.placa} onCambiar={cambiar('placa')} error={errores.placa} ejemplo="AB123CD" capitalizar="characters" testID="campo-placa" />

        <Text style={estilos.seccion}>Con qué documento acreditas el vehículo</Text>
        {DOCUMENTOS_LEGALES_DEL_VEHICULO.map(item => (
          <Opcion
            key={item.clave}
            titulo={item.titulo}
            elegida={datos.documentoLegal === item.clave}
            onElegir={() => setDatos(actual => ({ ...actual, documentoLegal: item.clave }))}
            testID={`documento-legal-${item.clave}`}
          />
        ))}
        {errores.documentoLegal ? <Text style={estilos.aviso}>{errores.documentoLegal}</Text> : null}

        <Text style={estilos.seccion}>Tu licencia</Text>
        {GRADOS_DE_LICENCIA[datos.tipo].map(grado => (
          <Opcion
            key={grado}
            titulo={`Grado ${grado}`}
            elegida={licencia.grado === String(grado)}
            onElegir={() => setLicencia(actual => ({ ...actual, grado: String(grado) }))}
            testID={`licencia-grado-${grado}`}
          />
        ))}
        {erroresDeLicencia.grado ? <Text style={estilos.aviso}>{erroresDeLicencia.grado}</Text> : null}
        <CampoDeTexto etiqueta="Vence el" valor={licencia.vencimiento} onCambiar={valor => setLicencia(actual => ({ ...actual, vencimiento: valor }))} error={erroresDeLicencia.vencimiento} ejemplo="2028-01-01" ayuda="Año-mes-día." teclado="numbers-and-punctuation" testID="campo-licencia-vencimiento" />

        <Text style={estilos.seccion}>Certificado médico</Text>
        <CampoDeTexto etiqueta="Vence el (si lo sabes)" valor={certificado.vencimiento} onCambiar={valor => setCertificado({ vencimiento: valor })} error={errorDeCertificado.vencimiento} ejemplo="2027-03-01" ayuda="Año-mes-día. Déjalo vacío si no lo tienes a mano; no lo inventes." teclado="numbers-and-punctuation" testID="campo-certificado-vencimiento" />

        {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}
        <Boton titulo={solicitud ? 'Guardar cambios' : 'Crear mi expediente'} onPress={() => { void continuar(); }} cargando={guardando} deshabilitado={guardando} testID="postulacion-continuar" />
        <Boton titulo="Atrás" variante="secundario" onPress={() => { router.back(); }} deshabilitado={guardando} />
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espaciado.lg, gap: espaciado.md },
  paso: { color: colores.textoTenue, fontSize: tipografia.pie.tamano },
  titulo: { color: colores.textoPrimario, fontSize: tipografia.titulo.tamano, lineHeight: tipografia.titulo.alto, fontWeight: '700' },
  detalle: { color: colores.textoSecundario, fontSize: tipografia.cuerpo.tamano, lineHeight: tipografia.cuerpo.alto },
  seccion: { color: colores.textoSecundario, fontSize: tipografia.pie.tamano, fontWeight: '600', marginTop: espaciado.md },
  aviso: { color: colores.peligro, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto }
});
