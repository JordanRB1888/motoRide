/**
 * Comprobar que el diagnóstico del teléfono llega de verdad a Sentry.
 *
 * POR QUÉ HACE FALTA UNA PANTALLA
 *
 * Porque «Sentry está configurado» y «los errores llegan a Sentry» son dos
 * afirmaciones distintas, y sólo la segunda sirve. Entre las dos caben un DSN
 * mal copiado, un `beforeSend` que devuelve `null` por un fallo propio, un
 * módulo nativo que no quedó enlazado en el APK, o una red que bloquea la
 * salida. Todo eso compila, instala, arranca, y no dice nada.
 *
 * Y en el móvil no vale la vía del servidor: no hay forma de provocar desde
 * fuera un error de JavaScript dentro de una aplicación instalada.
 *
 * POR QUÉ NO ES UNA PUERTA TRASERA
 *
 * Tres cierres, y hacen falta los tres:
 *
 *   1. NO TIENE ENTRADA. Ninguna pantalla enlaza aquí, ninguna fila la ofrece,
 *      no está en ninguna barra. Sólo se llega escribiendo el enlace profundo
 *      `plus58express://diagnostico`, que hay que conocer.
 *   2. Exige sesión de ADMINISTRACIÓN. Cualquier otro rol —o nadie— se va al
 *      inicio sin ver nada.
 *   3. No hace nada. Lanza un error, lo manda y lo dice. No lee ni escribe
 *      datos de nadie, no toca la sesión y no cambia ningún estado.
 *
 * Es la gemela de `POST /api/diagnostico/prueba` en el servidor, con el mismo
 * criterio.
 */

import { useState } from 'react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { Pantalla } from '../components/Pantalla';
import { Boton } from '../ui/componentes';
import { Txt } from '../ui/componentes';
import { useSesion } from '../context/AuthContext';
import { useTema } from '../theme/ThemeContext';
import { capturarExcepcion, observabilidadActiva } from '../observabilidad/sentry';

export default function PantallaDeDiagnostico() {
  const { sesion } = useSesion();
  const tema = useTema();
  const [ultimaMarca, setUltimaMarca] = useState<string | null>(null);

  if (sesion.estado === 'ARRANCANDO' || sesion.estado === 'AUTENTICANDO') return null;
  // Sin sesión de administración, esta pantalla no existe.
  if (sesion.estado !== 'AUTENTICADO' || sesion.usuario.role !== 'admin') return <Redirect href="/" />;

  const disparar = () => {
    const marca = `movil-${Date.now()}`;
    const error = new Error(`Error de prueba de observabilidad (${marca})`);
    error.name = 'PruebaDeObservabilidadMovil';
    capturarExcepcion(error, { etiquetas: { area: 'diagnostico', prueba: 'manual' }, extra: { marca } });
    setUltimaMarca(marca);
  };

  return (
    <Pantalla testID="pantalla-diagnostico">
      <View style={{ flex: 1, padding: 20, gap: tema.ritmo.entreBloques, justifyContent: 'center' }}>
        <Txt nivel="encabezado">Diagnóstico</Txt>
        <Txt nivel="cuerpo" tono="secundario">
          {observabilidadActiva()
            ? 'El envío de errores está encendido en esta aplicación.'
            : 'El envío de errores está APAGADO: falta el DSN, o esta compilación es de desarrollo.'}
        </Txt>
        <Boton titulo="Enviar un error de prueba" onPress={disparar} testID="disparar-diagnostico" />
        {ultimaMarca !== null ? (
          <View testID="marca-diagnostico">
            <Txt nivel="etiqueta" tono="tenue">Enviado: {ultimaMarca}</Txt>
          </View>
        ) : null}
      </View>
    </Pantalla>
  );
}
