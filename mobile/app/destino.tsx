/**
 * «¿A dónde vas?» — buscar el destino escribiéndolo.
 *
 * POR QUÉ ES UNA PANTALLA Y NO UN CAMPO DENTRO DE LA HOJA
 *
 * Escribir una dirección es una tarea con su propio foco: se abre el teclado,
 * la lista crece y encoge, y hace falta sitio para leer cuatro resultados con
 * su dirección completa. Metido en la hoja de pedir viaje, el teclado tapaba
 * justo la lista y quedaba un campo donde no se veía lo que se elegía.
 *
 * LA BÚSQUEDA LA HACE EL SERVIDOR
 *
 * Aquí no hay ninguna clave de Google, y no puede haberla: viajaría dentro del
 * APK. Ver `services/lugares.ts`.
 *
 * NO SE BUSCA EN CADA TECLA
 *
 * Cada búsqueda es una llamada de PAGO. Se espera a que la persona deje de
 * escribir un momento, y por debajo de tres letras no se pregunta nada: con
 * dos, los resultados no valen y la llamada se paga igual.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Pantalla } from '../components/Pantalla';
import { Boton, Txt } from '../ui/componentes';
import { Icono } from '../ui/Icono';
import { useTema } from '../theme/ThemeContext';
import {
  MINIMO_PARA_BUSCAR,
  buscarLugares,
  type FalloDeBusqueda,
  type LugarEncontrado
} from '../services/lugares';

/** Lo que se espera a que pare de escribir antes de preguntar. */
const ESPERA_MS = 450;

const MOTIVOS: Readonly<Record<FalloDeBusqueda, string>> = {
  SIN_RED: 'Sin conexión. Revisa tus datos o el wifi.',
  CORTA: '',
  NO_DISPONIBLE: 'La búsqueda no está disponible ahora mismo. Puedes elegir el sitio en el mapa.',
  ERROR: 'No pudimos buscar. Inténtalo otra vez.'
};

export default function Destino() {
  const tema = useTema();
  const parametros = useLocalSearchParams<{ campo?: string; lat?: string; lng?: string }>();
  /** Se busca la recogida o el destino. Cambia los textos, no el mecanismo. */
  const esOrigen = parametros.campo === 'origen';

  // Desde dónde se busca, para que salga primero lo que está cerca. Puede no
  // haberla: quien negó el permiso de ubicación tiene que poder buscar igual.
  const cerca = (() => {
    const lat = Number(parametros.lat);
    const lng = Number(parametros.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  })();

  const [texto, setTexto] = useState('');
  const [lugares, setLugares] = useState<readonly LugarEncontrado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState<FalloDeBusqueda | null>(null);
  const [buscado, setBuscado] = useState(false);

  // Cuál fue la última búsqueda que se lanzó. Una respuesta lenta de una
  // búsqueda vieja no puede pisar los resultados de la nueva.
  const ultima = useRef('');

  useEffect(() => {
    const consulta = texto.trim();
    if (consulta.length < MINIMO_PARA_BUSCAR) {
      setLugares([]);
      setFallo(null);
      setBuscado(false);
      return;
    }

    const reloj = setTimeout(async () => {
      ultima.current = consulta;
      setBuscando(true);
      const resultado = await buscarLugares(consulta, cerca);
      // Llegó tarde: entretanto se escribió otra cosa.
      if (ultima.current !== consulta) return;
      setBuscando(false);
      setBuscado(true);
      if (resultado.ok) {
        setLugares(resultado.lugares);
        setFallo(null);
      } else {
        setLugares([]);
        setFallo(resultado.motivo);
      }
    }, ESPERA_MS);

    return () => { clearTimeout(reloj); };
    // `cerca` se recalcula en cada render pero su contenido no cambia: se
    // dejan fuera sus dos números para no relanzar la búsqueda por nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const elegir = useCallback((lugar: LugarEncontrado) => {
    // El destino vuelve a la pantalla de pedir viaje por los parámetros de la
    // ruta: es lo que ya sabe leer, y evita un estado global para un dato que
    // sólo viaja de una pantalla a la siguiente.
    router.replace({
      pathname: '/pedir',
      params: {
        campo: esOrigen ? 'origen' : 'destino',
        puntoLat: String(lugar.lat),
        puntoLng: String(lugar.lng),
        puntoNombre: lugar.nombre
      }
    } as never);
  }, [esOrigen]);

  /** Deshacer una recogida elegida a mano y volver a la del telefono. */
  const volverAMiUbicacion = useCallback(() => {
    router.replace({ pathname: '/pedir', params: { volverAlGps: '1' } } as never);
  }, []);

  return (
    <Pantalla>
      <View style={{ flex: 1, padding: 20, gap: 14 }} testID="pantalla-destino">
        <Txt nivel="encabezado">{esOrigen ? '¿Dónde te recogemos?' : '¿A dónde vas?'}</Txt>

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          height: 52,
          borderRadius: tema.radio.campo,
          backgroundColor: tema.color.superficieHundida,
          borderWidth: 1,
          borderColor: tema.color.borde
        }}>
          <Icono nombre="buscar" color={tema.color.textoSecundario} tamano={18} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder={esOrigen ? 'Escribe dónde te recogemos' : 'Escribe una dirección o un sitio'}
            placeholderTextColor={tema.color.textoTenue}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={esOrigen ? 'Buscar el punto de recogida' : 'Buscar el destino'}
            testID="campo-buscar-destino"
            style={{ flex: 1, fontSize: 16, color: tema.color.textoPrimario, paddingVertical: 0 }}
          />
          {texto.length > 0 ? (
            <Pressable
              onPress={() => setTexto('')}
              accessibilityRole="button"
              accessibilityLabel="Borrar lo escrito"
              hitSlop={10}
              testID="borrar-busqueda"
            >
              <Txt nivel="cuerpo" tono="secundario">✕</Txt>
            </Pressable>
          ) : null}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
          {buscando ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={tema.color.acento} />
            </View>
          ) : null}

          {!buscando && fallo && MOTIVOS[fallo] ? (
            <View style={{ paddingVertical: 18 }} accessibilityRole="alert" testID="fallo-busqueda">
              <Txt nivel="cuerpo" tono="secundario">{MOTIVOS[fallo]}</Txt>
            </View>
          ) : null}

          {/* Buscado y sin nada: se dice, en vez de dejar la lista vacía y que
              parezca que todavía está cargando. */}
          {!buscando && !fallo && buscado && lugares.length === 0 ? (
            <View style={{ paddingVertical: 18 }} testID="sin-resultados">
              <Txt nivel="cuerpo" tono="secundario">
                No encontramos ese sitio. Prueba con otras palabras, o elígelo en el mapa.
              </Txt>
            </View>
          ) : null}

          {lugares.map(lugar => (
            <Pressable
              key={lugar.id}
              onPress={() => elegir(lugar)}
              accessibilityRole="button"
              accessibilityLabel={esOrigen ? `Recogerme en ${lugar.nombre}` : `Ir a ${lugar.nombre}`}
              testID={`lugar-${lugar.id}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 4,
                borderBottomWidth: 1,
                borderBottomColor: tema.color.borde,
                backgroundColor: pressed ? tema.color.superficieHundida : 'transparent'
              })}
            >
              <Icono nombre="destino" color={tema.color.acento} tamano={18} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt nivel="cuerpo" numberOfLines={1}>{lugar.nombre}</Txt>
                {lugar.direccion ? (
                  <Txt nivel="pie" tono="secundario" numberOfLines={1}>{lugar.direccion}</Txt>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {/* Volver a donde dice el teléfono. Sólo tiene sentido para la
            recogida: el destino nunca es donde ya estás. */}
        {esOrigen ? (
          <Boton
            titulo="Usar mi ubicación actual"
            variante="secundario"
            onPress={volverAMiUbicacion}
            testID="usar-mi-ubicacion"
          />
        ) : null}

        {/* Siempre a mano: hay sitios que no tienen nombre y sólo se pueden
            señalar. Que la salida esté abajo y no escondida en el texto de un
            error es parte de que la pantalla no sea un callejón. */}
        <Boton
          titulo="Mejor lo elijo en el mapa"
          variante="secundario"
          onPress={() => router.replace({
            pathname: '/pedir',
            params: { elegirEnMapa: esOrigen ? 'origen' : 'destino' }
          } as never)}
          testID="ir-al-mapa"
        />
        <Boton titulo="Cancelar" variante="silencioso" onPress={() => router.back()} testID="cancelar-destino" />
      </View>
    </Pantalla>
  );
}
