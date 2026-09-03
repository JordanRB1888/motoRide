/**
 * PASO 2 — Quién eres: los datos como aparecen en la cédula, y la contraseña.
 *
 * La contraseña es la de la cuenta nueva o, si ya hay una de pasajera con el
 * mismo correo o teléfono, la de esa cuenta: el servidor exige demostrarla
 * antes de colgarle un expediente. No se guarda en ningún sitio: viaja en el
 * alta y en el acceso, y se olvida.
 */

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '../../components/Boton';
import { CampoDeTexto } from '../../components/CampoDeTexto';
import { Pantalla } from '../../components/Pantalla';
import { usePostulacion } from '../../context/PostulacionContext';
import {
  describirPaso,
  pasoCompleto,
  validarContrasena,
  validarPersonales,
  type DatosPersonales,
  type ErroresDePaso
} from '../../domain/postulacion';
import { useTema } from '../../theme/ThemeContext';
import { espaciado, tipografia } from '../../theme/tokens';

export default function PasoDeIdentidad() {
  const tema = useTema();
  const estilos = useMemo(() => crearEstilos(tema.color), [tema.color]);
  const { borrador, actualizar, solicitud } = usePostulacion();
  const [datos, setDatos] = useState<DatosPersonales>(borrador.personales);
  const [contrasena, setContrasena] = useState(borrador.contrasena);
  const [errores, setErrores] = useState<ErroresDePaso>({});
  const [errorDeContrasena, setErrorDeContrasena] = useState<string | null>(null);
  const editando = solicitud !== null;

  const cambiar = (campo: keyof DatosPersonales) => (valor: string) => {
    setDatos(actual => ({ ...actual, [campo]: valor }));
  };

  const continuar = () => {
    const fallos = validarPersonales(datos, { paraEnvio: true });
    const fallo = editando ? null : validarContrasena(contrasena);
    setErrores(fallos);
    setErrorDeContrasena(fallo);
    if (!pasoCompleto(fallos) || fallo) return;
    actualizar({ personales: datos, contrasena });
    router.push('/postulacion/vehiculo');
  };

  const paso = describirPaso('identidad');
  return (
    <Pantalla desplazable testID="postulacion-identidad">
      <View style={estilos.contenido}>
        <Text style={estilos.paso}>Paso 2 de 5</Text>
        <Text style={estilos.titulo}>{paso.titulo}</Text>
        <Text style={estilos.detalle}>{paso.detalle}</Text>

        <CampoDeTexto etiqueta="Nombre" valor={datos.nombre} onCambiar={cambiar('nombre')} error={errores.nombre} capitalizar="words" testID="campo-nombre" />
        <CampoDeTexto etiqueta="Apellido" valor={datos.apellido} onCambiar={cambiar('apellido')} error={errores.apellido} capitalizar="words" testID="campo-apellido" />
        <CampoDeTexto etiqueta="Cédula" valor={datos.cedula} onCambiar={cambiar('cedula')} error={errores.cedula} ejemplo="V-12345678" capitalizar="characters" testID="campo-cedula" />
        <CampoDeTexto etiqueta="RIF" valor={datos.rif} onCambiar={cambiar('rif')} error={errores.rif} ejemplo="V-12345678-9" ayuda="El del SENIAT, con el dígito final." capitalizar="characters" testID="campo-rif" />
        <CampoDeTexto etiqueta="Fecha de nacimiento" valor={datos.nacimiento} onCambiar={cambiar('nacimiento')} error={errores.nacimiento} ejemplo="1995-04-12" ayuda="Año-mes-día." teclado="numbers-and-punctuation" testID="campo-nacimiento" />
        <CampoDeTexto etiqueta="Teléfono" valor={datos.telefono} onCambiar={cambiar('telefono')} error={errores.telefono} ejemplo="04141234567" teclado="phone-pad" testID="campo-telefono" />
        <CampoDeTexto etiqueta="Correo" valor={datos.correo} onCambiar={cambiar('correo')} error={errores.correo} teclado="email-address" capitalizar="none" testID="campo-correo" />
        <CampoDeTexto etiqueta="Dirección" valor={datos.direccion} onCambiar={cambiar('direccion')} error={errores.direccion} ayuda="Calle y sector." testID="campo-direccion" />
        {editando ? null : (
          <CampoDeTexto
            etiqueta="Contraseña"
            valor={contrasena}
            onCambiar={setContrasena}
            error={errorDeContrasena}
            ayuda="Si ya tienes cuenta de pasajera con este correo o teléfono, escribe la de esa cuenta."
            secreto
            capitalizar="none"
            testID="campo-contrasena"
          />
        )}

        <Boton titulo="Continuar" onPress={continuar} testID="postulacion-continuar" />
        <Boton titulo="Atrás" variante="secundario" onPress={() => { router.back(); }} />
      </View>
    </Pantalla>
  );
}

const crearEstilos = (c: ReturnType<typeof useTema>['color']) => StyleSheet.create({
  contenido: { padding: espaciado.lg, gap: espaciado.md },
  paso: { color: c.textoTenue, fontSize: tipografia.pie.tamano },
  titulo: { color: c.textoPrimario, fontSize: tipografia.titulo.tamano, lineHeight: tipografia.titulo.alto, fontWeight: '700' },
  detalle: { color: c.textoSecundario, fontSize: tipografia.cuerpo.tamano, lineHeight: tipografia.cuerpo.alto }
});
