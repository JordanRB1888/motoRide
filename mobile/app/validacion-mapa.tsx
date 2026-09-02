/**
 * Mirar el mapa de verdad, sin levantar el backend. SÓLO EN DESARROLLO.
 *
 * POR QUÉ HACE FALTA
 *
 * El mapa real sólo aparece donde hay coordenadas reales, y eso hoy es la
 * pantalla del viaje activo: exige servidor, sesión y un viaje en curso. Para
 * comprobar que Google carga, que el estilo del dueño se aplica y que los
 * marcadores aprobados están en su sitio, montar todo eso es desproporcionado.
 *
 * Esta pantalla arma el mismo modelo que arma `mapaDelViaje`, con coordenadas
 * fijas de Maracaibo, y se lo pasa al mismo `LienzoDeMapa` que usan las
 * pantallas de verdad. Lo que se ve aquí es exactamente lo que se verá allí.
 *
 * QUÉ NO ES
 *
 * No es una pantalla de la aplicación. No pide nada a ningún servidor, no
 * abre socket, no toca la sesión, y en una versión publicada redirige a la
 * raíz —`__DEV__` es falso—. Los datos son fijos y están escritos aquí a la
 * vista, no vienen de ningún sitio que pueda confundirse con producción.
 *
 * POR QUÉ NO ESTÁ EN /diseno
 *
 * Aquel recorrido es una maqueta y tiene una garantía que conviene conservar:
 * no abre Google ni pide una clave para poder mirarse. Esta pantalla hace
 * justo lo contrario a propósito, así que va aparte.
 *
 * `?tema=claro` y `?tema=oscuro` fuerzan el esquema, igual que en el recorrido
 * de diseño: sin eso habría que esperar a las seis de la tarde para ver el
 * mapa de noche.
 */

import { useCallback, useEffect, useState } from 'react';
import { Redirect, useGlobalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { LienzoDeMapa } from '../ui/Mapa';
import { Txt } from '../ui/componentes';
import { ProveedorDeTema, useTema } from '../theme/ThemeContext';
import { camaraQueAbarca, type Coordenada, type ModeloDelMapa } from '../mapa/modelo';
import { useUbicacion } from '../ubicacion/UbicacionDelDispositivo';

/** `true` sólo cuando Metro sirve la aplicación. En release, `false`. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Dos puntos reales de Maracaibo, escritos a mano.
 *
 * No salen de ningún viaje ni de ninguna base de datos: son dos sitios de la
 * ciudad elegidos para que la cámara tenga algo que encuadrar.
 */
const ORIGEN = { lat: 10.6666, lng: -71.6124 };
const DESTINO = { lat: 10.6427, lng: -71.6425 };

/** Los cuatro marcadores aprobados, para verlos todos a la vez. */
const MODELO: ModeloDelMapa = {
  camara: camaraQueAbarca([ORIGEN, DESTINO]),
  marcadores: [
    { clave: 'origen', clase: 'origen', en: ORIGEN, etiqueta: 'Origen', rumbo: null, destacado: false },
    { clave: 'destino', clase: 'destino', en: DESTINO, etiqueta: 'Destino', rumbo: null, destacado: false },
    {
      clave: 'moto',
      clase: 'moto',
      en: { lat: 10.6580, lng: -71.6210 },
      etiqueta: 'Moto',
      rumbo: null,
      destacado: true
    },
    {
      clave: 'auto',
      clase: 'auto',
      en: { lat: 10.6500, lng: -71.6330 },
      etiqueta: 'Auto',
      rumbo: null,
      destacado: false
    }
  ],
  ruta: [],
  eligiendoPunto: false,
  // Sin hoja encima, pero se deja aire para que el logotipo de Google —que es
  // obligatorio— quede donde quedará de verdad.
  aireInferior: 120
};

export default function ValidacionDelMapa() {
  const { tema } = useGlobalSearchParams<{ tema?: string }>();
  const forzado = tema === 'claro' || tema === 'oscuro' ? tema : undefined;

  if (!EN_DESARROLLO) return <Redirect href="/" />;

  return (
    <ProveedorDeTema esquemaForzado={forzado}>
      <Pantalla />
    </ProveedorDeTema>
  );
}

function Pantalla() {
  const tema = useTema();
  const { estado, pedirUbicacion, refrescar } = useUbicacion();

  // Aqui SI se pide el permiso al entrar: esta pantalla existe justamente
  // para mirar el mapa y la ubicacion, asi que el momento se explica solo.
  useEffect(() => { void pedirUbicacion(); }, [pedirUbicacion]);

  // Centrar es un evento: se guarda la posicion del instante en que se pulsa,
  // no se sigue a la posicion viva.
  const [centrarEn, setCentrarEn] = useState<Coordenada | null>(null);
  const centrar = useCallback(() => {
    void refrescar();
    if (estado.posicion !== null) {
      setCentrarEn({ lat: estado.posicion.lat, lng: estado.posicion.lng });
    }
  }, [refrescar, estado.posicion]);

  const yo = estado.posicion;
  const modelo: ModeloDelMapa = {
    ...MODELO,
    camara: centrarEn === null ? MODELO.camara : camaraQueAbarca([centrarEn]),
    marcadores: yo === null
      ? MODELO.marcadores
      : [
          ...MODELO.marcadores,
          {
            clave: 'usuario',
            clase: 'usuario' as const,
            en: { lat: yo.lat, lng: yo.lng },
            rumbo: null
          }
        ]
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <LienzoDeMapa modelo={modelo} onCentrar={centrar} />

      {/* Una etiqueta discreta, para no confundir esta pantalla con una de la
          aplicación al mirar una captura suelta. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 44,
          left: 16,
          backgroundColor: tema.color.superficieElevada,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8
        }}
      >
        <Txt nivel="etiqueta" tono="tenue">
          {`VALIDACIÓN · ${estado.fase}`}
          {estado.fueraDelArea === true ? ' · FUERA DE ZONA' : ''}
        </Txt>
      </View>
    </View>
  );
}
