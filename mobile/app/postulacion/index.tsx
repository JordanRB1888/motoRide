/**
 * PASO 1 — Información personal.
 *
 * Es el primer paso del formulario que eligió el dueño: los datos de la
 * persona, tal como aparecen en sus documentos, con la ciudad y el estado
 * dentro de la cobertura. Con qué vehículo trabaja y para qué se pregunta en
 * el paso siguiente, donde está el resto de lo suyo.
 *
 * Si ya hay sesión, antes de nada se pregunta al servidor si existe un
 * expediente: uno editable lleva directo a los documentos; uno en revisión o
 * decidido, a su estado. Nadie rellena dos veces lo que el servidor ya tiene.
 */

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Boton } from '../../components/Boton';
import { CabeceraDePasos } from '../../components/CabeceraDePasos';
import { CampoDeTexto } from '../../components/CampoDeTexto';
import { Formulario } from '../../components/Formulario';
import { Opcion } from '../../components/Opcion';
import { Pantalla } from '../../components/Pantalla';
import { Pareja } from '../../components/Pareja';
import { useSesion } from '../../context/AuthContext';
import { usePostulacion } from '../../context/PostulacionContext';
import {
  CIUDADES,
  describirPaso,
  destinoDePostulacion,
  pasoCompleto,
  regionDeLaCiudad,
  validarContrasena,
  validarPersonales,
  type DatosPersonales,
  type ErroresDePaso
} from '../../domain/postulacion';
import { leerMiPostulacion, retratoDelExpediente } from '../../services/postulacion';
import { useTema } from '../../theme/ThemeContext';
import { espaciado, tipografia } from '../../theme/tokens';

export default function PasoPersonal() {
  const tema = useTema();
  const estilos = useMemo(() => crearEstilos(tema.color), [tema.color]);
  const { sesion } = useSesion();
  // El rol REAL, del backend. La intención de la bienvenida no pinta aquí.
  const rol = sesion.estado === 'AUTENTICADO' ? sesion.usuario.role : null;
  const { borrador, actualizar, solicitud, fijarSolicitud } = usePostulacion();
  const [datos, setDatos] = useState<DatosPersonales>(borrador.personales);
  const [contrasena, setContrasena] = useState(borrador.contrasena);
  const [errores, setErrores] = useState<ErroresDePaso>({});
  const [errorDeContrasena, setErrorDeContrasena] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(sesion.estado === 'AUTENTICADO');
  const [errorDeConsulta, setErrorDeConsulta] = useState<string | null>(null);
  // Con sesión abierta la cuenta ya existe: no se pide contraseña otra vez.
  const conCuenta = sesion.estado === 'AUTENTICADO' || solicitud !== null;

  // Con sesión: el servidor dice si ya hay expediente y a dónde ir. Si ya se
  // leyó en esta sesión de la aplicación, se salta sin volver a preguntar:
  // volver aquí desde un paso posterior no debe repetir el formulario.
  useEffect(() => {
    if (solicitud !== null) {
      const destino = destinoDePostulacion(retratoDelExpediente(solicitud), { rolReal: rol });
      // El propio paso 1 es un destino válido: quien tiene el expediente a
      // medias por aquí se queda, y rellena lo que le falta.
      if (destino !== '/postulacion') router.replace(destino);
      return;
    }
    if (sesion.estado !== 'AUTENTICADO') { setConsultando(false); return; }
    let vigente = true;
    void leerMiPostulacion().then(lectura => {
      if (!vigente) return;
      if (lectura.ok && lectura.solicitud) {
        fijarSolicitud(lectura.solicitud);
        const destino = destinoDePostulacion(retratoDelExpediente(lectura.solicitud), { rolReal: rol });
        if (destino !== '/postulacion') { router.replace(destino); return; }
        setConsultando(false);
        return;
      }
      // Si la consulta falló, la persona puede tener ya un expediente que no
      // hemos podido leer. Pedirle que rellene el formulario otra vez sería
      // hacerle perder el tiempo: se le dice qué pasó y que vuelva a entrar.
      if (!lectura.ok) setErrorDeConsulta('No pudimos consultar tu solicitud. Vuelve a entrar en un momento.');
      setConsultando(false);
    });
    return () => { vigente = false; };
  }, [sesion.estado, solicitud, fijarSolicitud]);

  const cambiar = (campo: keyof DatosPersonales) => (valor: string) => {
    setDatos(actual => ({ ...actual, [campo]: valor }));
  };

  const continuar = () => {
    const fallos = validarPersonales(datos, { paraEnvio: true });
    const fallo = conCuenta ? null : validarContrasena(contrasena);
    setErrores(fallos);
    setErrorDeContrasena(fallo);
    if (!pasoCompleto(fallos) || fallo) return;
    actualizar({ personales: datos, contrasena });
    router.push('/postulacion/vehiculo');
  };

  if (consultando) {
    return (
      <Pantalla testID="postulacion-consultando">
        <View style={estilos.centro}><ActivityIndicator color={tema.color.acento} size="large" /></View>
      </Pantalla>
    );
  }

  const paso = describirPaso('personal');
  const region = regionDeLaCiudad(datos.ciudad) ?? '';

  return (
    <Formulario
      testID="postulacion-personal"
      cabecera={<CabeceraDePasos paso="personal" hechos={[]} onCerrar={() => { router.replace('/pasajero'); }} />}
      pie={(
        <View style={estilos.pie}>
          {errorDeConsulta ? <Text style={estilos.error}>{errorDeConsulta}</Text> : null}
          <Boton titulo="Siguiente  →" onPress={continuar} testID="postulacion-continuar" />
        </View>
      )}
    >
      {(
        <View style={estilos.contenido}>
          <Text style={estilos.titulo}>{paso.titulo}</Text>
          <Text style={estilos.detalle}>{paso.detalle}</Text>

          <Pareja>
            <CampoDeTexto enPareja obligatorio etiqueta="Nombre" valor={datos.nombre} onCambiar={cambiar('nombre')} error={errores.nombre} ejemplo="Ej. Gabriel" capitalizar="words" testID="campo-nombre" />
            <CampoDeTexto enPareja obligatorio etiqueta="Apellido" valor={datos.apellido} onCambiar={cambiar('apellido')} error={errores.apellido} ejemplo="Ej. Zambrano" capitalizar="words" testID="campo-apellido" />
          </Pareja>

          <Pareja>
            <CampoDeTexto enPareja obligatorio etiqueta="Cédula / documento" valor={datos.cedula} onCambiar={cambiar('cedula')} error={errores.cedula} ejemplo="V-12345678" capitalizar="characters" testID="campo-cedula" />
            <CampoDeTexto enPareja obligatorio etiqueta="Fecha de nacimiento" valor={datos.nacimiento} onCambiar={cambiar('nacimiento')} error={errores.nacimiento} ejemplo="1995-04-12" ayuda="Año-mes-día." teclado="numbers-and-punctuation" testID="campo-nacimiento" />
          </Pareja>

          <Pareja>
            <CampoDeTexto enPareja obligatorio etiqueta="Teléfono / WhatsApp" valor={datos.telefono} onCambiar={cambiar('telefono')} error={errores.telefono} ejemplo="+58 414-000-0000" teclado="phone-pad" testID="campo-telefono" />
            <CampoDeTexto enPareja obligatorio etiqueta="Correo electrónico" valor={datos.correo} onCambiar={cambiar('correo')} error={errores.correo} ejemplo="correo@ejemplo.com" teclado="email-address" capitalizar="none" testID="campo-correo" />
          </Pareja>

          <CampoDeTexto obligatorio etiqueta="RIF" valor={datos.rif} onCambiar={cambiar('rif')} error={errores.rif} ejemplo="V-12345678-9" ayuda="El del SENIAT, con el dígito final." capitalizar="characters" testID="campo-rif" />
          <CampoDeTexto obligatorio etiqueta="Dirección" valor={datos.direccion} onCambiar={cambiar('direccion')} error={errores.direccion} ejemplo="Urbanización, avenida, calle y referencia" testID="campo-direccion" />

          <View style={estilos.bloque}>
            <Text style={estilos.etiqueta}>Ciudad <Text style={estilos.asterisco}>*</Text></Text>
            <Pareja>
              {CIUDADES.map(item => (
                <View key={item.ciudad} style={estilos.mitad}>
                  <Opcion
                    titulo={item.ciudad}
                    elegida={datos.ciudad === item.ciudad}
                    onElegir={() => setDatos(actual => ({ ...actual, ciudad: item.ciudad }))}
                    testID={`ciudad-${item.ciudad}`}
                  />
                </View>
              ))}
            </Pareja>
            {errores.ciudad ? <Text style={estilos.error}>{errores.ciudad}</Text> : <Text style={estilos.ayuda}>Estado / región: {region || 'se completa al elegir la ciudad'}</Text>}
          </View>

          {conCuenta ? null : (
            <CampoDeTexto
              obligatorio
              etiqueta="Contraseña"
              valor={contrasena}
              onCambiar={setContrasena}
              error={errorDeContrasena}
              ejemplo="Mínimo 8 caracteres"
              ayuda="Si ya tienes cuenta de pasajera con este correo o teléfono, escribe la de esa cuenta."
              secreto
              capitalizar="none"
              testID="campo-contrasena"
            />
          )}
        </View>
      )}
    </Formulario>
  );
}

const crearEstilos = (c: ReturnType<typeof useTema>['color']) => StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenido: { padding: espaciado.lg, gap: espaciado.md },
  titulo: { color: c.textoPrimario, fontSize: tipografia.subtitulo.tamano, lineHeight: tipografia.subtitulo.alto, fontWeight: '700' },
  detalle: { color: c.textoSecundario, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto, marginBottom: espaciado.xs },
  bloque: { gap: espaciado.xs },
  etiqueta: { color: c.textoSecundario, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto, fontWeight: '600' },
  asterisco: { color: c.acento },
  mitad: { flex: 1, minWidth: 0 },
  ayuda: { color: c.textoTenue, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  error: { color: c.peligro, fontSize: tipografia.pie.tamano, lineHeight: tipografia.pie.alto },
  pie: {
    borderTopWidth: 1,
    borderTopColor: c.borde,
    backgroundColor: c.superficieHundida,
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.md
  }
});
