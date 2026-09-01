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

import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';

import { useEsquema, useTema } from '../theme/ThemeContext';
import { estiloDelMapa } from './estilos';
import { PiezaDelMarcador, ReticulaCentral } from './Marcadores';
import { mereceMoverse, type Camara, type ModeloDelMapa } from './modelo';

/** Traduce la cámara del modelo a la región que entiende react-native-maps. */
const region = (camara: Camara) => ({
  latitude: camara.centro.lat,
  longitude: camara.centro.lng,
  latitudeDelta: camara.abarca,
  longitudeDelta: camara.abarca
});

export function MapaDeMovilidad({ modelo }: { readonly modelo: ModeloDelMapa }) {
  const tema = useTema();
  const esquema = useEsquema();
  const mapa = useRef<MapView>(null);
  const ultima = useRef<Camara | null>(null);

  // El estilo se recalcula sólo al cambiar de tema, no en cada repintado: es
  // un array grande y darle una identidad nueva remonta capas del mapa.
  const estilo = useMemo(() => estiloDelMapa(esquema), [esquema]);

  useEffect(() => {
    if (!mereceMoverse(ultima.current, modelo.camara)) return;
    ultima.current = modelo.camara;
    // 450 ms: se nota que se movió y no marea. Sin animación, el mapa da un
    // salto que se lee como un fallo.
    mapa.current?.animateToRegion(region(modelo.camara), 450);
  }, [modelo.camara]);

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo, overflow: 'hidden' }}>
      <MapView
        ref={mapa}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={region(modelo.camara)}
        // El tipo de react-native-maps exige su propia forma; la nuestra es la
        // misma con `readonly`, que su firma no admite.
        customMapStyle={estilo as unknown as MapStyleElement[]}
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
        {modelo.ruta.length > 1 ? (
          <Polyline
            coordinates={modelo.ruta.map(punto => ({ latitude: punto.lat, longitude: punto.lng }))}
            strokeColor={tema.color.acento}
            strokeWidth={4}
          />
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
            // Sin esto, cada repintado del padre vuelve a dibujar la vista del
            // marcador en Android y el mapa parpadea.
            tracksViewChanges={false}
          >
            <PiezaDelMarcador marcador={marcador} />
          </Marker>
        ))}
      </MapView>

      {modelo.eligiendoPunto ? <ReticulaCentral /> : null}
    </View>
  );
}
