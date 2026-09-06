/**
 * El mapa en el teléfono: Google Maps nativo.
 *
 * `PROVIDER_GOOGLE` en las dos plataformas, como decidió el dueño. En iOS eso
 * significa que se usa el SDK de Google y no Apple Maps, y por eso hace falta
 * su propia clave.
 *
 * NO PIDE UBICACIÓN
 *
 * `showsUserLocation` está desactivado a propósito: encenderlo dispara el
 * permiso del sistema, y esta fase no toca el GPS. La ubicación llega en
 * LOCATION-INTEGRATION-1, con su explicación al usuario.
 *
 * LA CÁMARA NO SE MUEVE POR NADA
 *
 * Animar el mapa en cada repintado lo deja temblando y gasta batería. Aquí se
 * compara con lo último que se mandó y sólo se anima cuando el destino está de
 * verdad en otro sitio.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';

import { useEsquema, useTema } from '../theme/ThemeContext';
import { identificadorDeAndroid, identificadorDeIOS } from './claves';
import { estiloLocalSiHaceFalta } from './estilos';
import { PiezaDelMarcador, ReticulaCentral } from './Marcadores';
import { mereceMoverse, type Camara, type ModeloDelMapa } from './modelo';

/** Traduce la cámara del modelo a la región que entiende react-native-maps. */
const region = (camara: Camara) => ({
  latitude: camara.centro.lat,
  longitude: camara.centro.lng,
  latitudeDelta: camara.abarca,
  longitudeDelta: camara.abarca
});

/**
 * El identificador de ESTA plataforma, nunca el de la otra.
 *
 * Google valida el tipo del identificador contra el SDK que lo pide: el de
 * JavaScript en Android deja el mapa gris, y sin mensaje que lo explique.
 */
const identificadorDeLaPlataforma = (): string =>
  Platform.OS === 'ios' ? identificadorDeIOS() : identificadorDeAndroid();

/**
 * Cuánto se sigue redibujando un marcador antes de congelarlo.
 *
 * Android dibuja el marcador una vez y guarda esa imagen. Si se congela antes
 * de que la ilustración del vehículo haya cargado, guarda un hueco vacío: la
 * moto y el carro no aparecían en el emulador mientras el origen y el destino
 * —que son sólo color— sí. Un segundo y medio da margen de sobra para una
 * imagen que ya está dentro del paquete, y luego se congela para no repintar
 * en cada fotograma.
 */
const MARGEN_PARA_DIBUJARSE = 1500;

export function MapaDeMovilidad({ modelo, onCentro }: {
  readonly modelo: ModeloDelMapa;
  /**
   * El centro del mapa cada vez que deja de moverse.
   *
   * Es el gesto de <<mueve el mapa, no el pin>>: el reticulo esta fijo en el
   * centro, asi que el centro ES el punto elegido. Se avisa al soltar y no
   * mientras se arrastra, que dispararia una peticion por fotograma.
   */
  readonly onCentro?: (centro: { lat: number; lng: number }) => void;
}) {
  const tema = useTema();
  const esquema = useEsquema();
  const mapa = useRef<MapView>(null);
  const ultima = useRef<Camara | null>(null);

  const [redibujando, setRedibujando] = useState(true);

  useEffect(() => {
    setRedibujando(true);
    const cuando = setTimeout(() => setRedibujando(false), MARGEN_PARA_DIBUJARSE);
    return () => clearTimeout(cuando);
  }, [modelo.marcadores]);

  const identificador = identificadorDeLaPlataforma();

  // Con identificador manda Google Cloud y esto es `undefined`: los dos a la
  // vez no se pueden, Google ignora el JSON en cuanto hay identificador.
  const estilo = useMemo(
    () => estiloLocalSiHaceFalta(esquema, identificador),
    [esquema, identificador]
  );

  useEffect(() => {
    if (!mereceMoverse(ultima.current, modelo.camara)) return;
    ultima.current = modelo.camara;

    // CON VARIOS PUNTOS SE ENCUADRAN TODOS, NO SE CENTRA Y YA
    //
    // Una `Region` lleva un ancho en grados para cada eje, pero el mapa no
    // puede respetar los dos a la vez: los ajusta al aspecto de la vista. En
    // un teléfono alto y estrecho, pedir el mismo ancho en los dos ejes deja
    // fuera casi la mitad de la longitud — se vio en el emulador: el destino
    // se veía y el origen se quedaba fuera de la pantalla.
    //
    // `fitToCoordinates` es lo que hay que usar para «que quepan estos
    // puntos»: calcula el encuadre él mismo y respeta el margen, igual que
    // `fitBounds` en el navegador.
    const puntos = modelo.marcadores.map(marcador => ({
      latitude: marcador.en.lat,
      longitude: marcador.en.lng
    }));

    if (puntos.length > 1) {
      mapa.current?.fitToCoordinates(puntos, {
        // El de abajo deja sitio a la hoja y al logotipo de Google.
        edgePadding: { top: 60, right: 40, bottom: modelo.aireInferior + 40, left: 40 },
        animated: true
      });
      return;
    }

    // 450 ms: se nota que se movió y no marea. Sin animación, el mapa da un
    // salto que se lee como un fallo.
    mapa.current?.animateToRegion(region(modelo.camara), 450);
  }, [modelo.camara, modelo.marcadores, modelo.aireInferior]);

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo, overflow: 'hidden' }}>
      <MapView
        // REMONTAR AL CAMBIAR DE TEMA, Y SÓLO POR ESO
        //
        // `googleMapId` y `userInterfaceStyle` son propiedades de creación:
        // react-native-maps las pasa a `GoogleMapOptions` y sus setters no
        // hacen nada («do nothing (initialProp)»). Con el estilo en Google
        // Cloud, cambiar de día a noche exige un mapa nuevo.
        //
        // Es el precio del estilo en la nube y no se puede negociar desde
        // aquí. Se paga sólo al cambiar de tema —dos veces al día, o cuando
        // alguien lo cambia a mano—, y se recupera la vista de abajo para que
        // el mapa no salte a otro sitio.
        key={`${identificador}:${esquema}`}
        ref={mapa}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={region(ultima.current ?? modelo.camara)}
        // El aspecto: o Google Cloud, o el estilo local. Nunca los dos.
        googleMapId={identificador === '' ? undefined : identificador}
        // Elige el estilo claro u oscuro DENTRO del identificador. Manda el
        // tema de +58express, no el del sistema: la aplicación decide su hora
        // por Caracas, y el mapa tiene que ir con ella.
        userInterfaceStyle={esquema === 'oscuro' ? 'dark' : 'light'}
        // El tipo de react-native-maps exige su propia forma; la nuestra es la
        // misma con `readonly`, que su firma no admite.
        customMapStyle={estilo as unknown as MapStyleElement[] | undefined}
        // Dónde se quedó mirando, para que un remontaje no pierda la vista.
        onRegionChangeComplete={vista => {
          const centro = { lat: vista.latitude, lng: vista.longitude };
          ultima.current = { centro, abarca: vista.latitudeDelta };
          // Solo cuando alguien esta eligiendo: fuera de ese modo el centro es
          // el encuadre, no una decision de nadie.
          if (modelo.eligiendoPunto) onCentro?.(centro);
        }}
        // El logotipo de Google y la brújula son obligatorios y no se pueden
        // tapar. Este relleno los sube por encima de la hoja inferior.
        mapPadding={{ top: 0, right: 0, bottom: modelo.aireInferior, left: 0 }}
        // Sin permisos de ubicación en esta fase.
        showsUserLocation={false}
        showsMyLocationButton={false}
        // Lo que sobra en un mapa de movilidad: los puntos de interés compiten
        // con lo único que importa, que es dónde está tu moto.
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        toolbarEnabled={false}
        // Elegir un punto se hace moviendo el mapa bajo un retículo fijo, así
        // que rotarlo o inclinarlo sólo desorienta.
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {/* LA RUTA. Verde, y no amarilla.
            El amarillo es la identidad de +58express —el botón de pedir, el
            disco del conductor, la cabecera— y además es el color de las vías
            principales en el propio mapa de Maracaibo: una ruta amarilla se
            perdía justo encima de las calles por las que pasa. El token la
            resuelve por esquema, más profunda en día que en noche.

            Dos trazos, no uno: debajo va un contorno más ancho y translúcido
            que la separa del asfalto pase por donde pase. Sin él, sobre una
            avenida clara la línea se confunde con la propia calle. No es un
            resplandor —eso sería adorno— es el filo que la hace legible. */}
        {modelo.ruta.length > 1 ? (
          <>
            <Polyline
              coordinates={modelo.ruta.map(punto => ({ latitude: punto.lat, longitude: punto.lng }))}
              strokeColor={`${tema.color.rutaDelMapa}55`}
              strokeWidth={11}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={modelo.ruta.map(punto => ({ latitude: punto.lat, longitude: punto.lng }))}
              strokeColor={tema.color.rutaDelMapa}
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
            />
          </>
        ) : null}

        {modelo.marcadores.map(marcador => (
          <Marker
            key={marcador.clave}
            coordinate={{ latitude: marcador.en.lat, longitude: marcador.en.lng }}
            // Centrado sobre su coordenada: por defecto Google ancla la punta
            // abajo, que es lo correcto para un pin y no para una moto vista
            // desde arriba.
            anchor={{ x: 0.5, y: 0.5 }}
            title={marcador.etiqueta}
            // Se deja de redibujar en cuanto la ilustración ha tenido tiempo
            // de cargar. Congelarlo desde el primer momento guardaba un hueco
            // vacío; dejarlo siempre encendido repinta en cada fotograma.
            tracksViewChanges={redibujando}
          >
            <PiezaDelMarcador marcador={marcador} />
          </Marker>
        ))}
      </MapView>

      {modelo.eligiendoPunto ? <ReticulaCentral aireInferior={modelo.aireInferior} /> : null}
    </View>
  );
}
