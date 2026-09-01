/**
 * El mapa en el navegador: Maps JavaScript API.
 *
 * POR QUÉ NO SE USA `react-native-maps` AQUÍ
 *
 * No tiene implementación web: en `node_modules` sólo hay `android/` e `ios/`.
 * Importarlo en el paquete del navegador rompería el arranque, así que este
 * fichero NO lo menciona.
 *
 * POR QUÉ ESTE ES EL FICHERO SIN SUFIJO
 *
 * Metro prefiere `.native.tsx` en el teléfono y cae a `.tsx` en el navegador,
 * así que este es el del navegador. Y TypeScript resuelve `.tsx`, con lo que
 * los tipos salen de aquí sin configurar nada. Nombrarlo `.web.tsx` obligaría
 * a tocar `moduleSuffixes` en el `tsconfig`.
 *
 * ES LA MISMA TÉCNICA QUE YA ESTABA PROBADA
 *
 * El proyecto web carga Google con un cargador único que comparte una sola
 * promesa —`src/services/googleMapsService.js`— para no inyectar el script dos
 * veces, que Google castiga con avisos y comportamiento indefinido. Aquí se
 * reutiliza esa idea, no ese fichero: aquel vive en el empaquetado de Vite y
 * lee su clave de `import.meta.env`, que en Expo no existe.
 *
 * SIN CLAVE, NO SE INVENTA NINGUNA
 *
 * Nada de caer a la de producción. Sin clave se enseña un hueco que explica qué
 * falta, y la pantalla —la hoja, el viaje, los botones— sigue entera.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Txt } from '../ui/componentes';
import { useEsquema, useTema } from '../theme/ThemeContext';
import { claveDelNavegador, faltaLaClave, hayClaveDelNavegador } from './claves';
import { estiloDelMapa } from './estilos';
import { PiezaDelMarcador, ReticulaCentral, tamanoDelMarcador } from './Marcadores';
import { mereceMoverse, type Camara, type ModeloDelMapa } from './modelo';

/** `true` sólo cuando Metro sirve la aplicación. */
const EN_DESARROLLO = typeof __DEV__ !== 'undefined' && __DEV__;

type Google = typeof globalThis & { readonly google?: any };

/** Una sola promesa para toda la aplicación: cargar el script dos veces rompe. */
let cargando: Promise<boolean> | null = null;

function cargarGoogle(): Promise<boolean> {
  if (cargando !== null) return cargando;

  cargando = new Promise<boolean>(resolver => {
    if (typeof document === 'undefined') return resolver(false);
    if ((globalThis as Google).google?.maps) return resolver(true);

    const clave = claveDelNavegador();
    if (clave === '') return resolver(false);

    const etiqueta = document.createElement('script');
    // `loading=async` es lo que Google pide desde 2023; sin ello avisa por
    // consola en cada carga.
    etiqueta.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(clave)}&loading=async`;
    etiqueta.async = true;
    etiqueta.onload = () => resolver(true);
    // Un fallo de Google no puede tumbar la aplicación: se resuelve en `false`
    // y la pantalla enseña el hueco.
    etiqueta.onerror = () => resolver(false);
    document.head.appendChild(etiqueta);
  });

  return cargando;
}

export function MapaDeMovilidad({ modelo }: { readonly modelo: ModeloDelMapa }) {
  const tema = useTema();
  const esquema = useEsquema();

  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<any>(null);
  const marcadoresVivos = useRef<any[]>([]);
  const ultima = useRef<Camara | null>(null);

  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(!hayClaveDelNavegador());

  const estilo = useMemo(() => estiloDelMapa(esquema), [esquema]);

  // Crear el mapa. Una sola vez: recrearlo en cada cambio pierde la cámara y
  // vuelve a pedir los mosaicos.
  useEffect(() => {
    let vigente = true;

    void cargarGoogle().then(cargado => {
      if (!vigente) return;
      if (!cargado) return setFallo(true);

      const google = (globalThis as Google).google;
      if (!google?.maps || contenedor.current === null) return setFallo(true);

      mapa.current = new google.maps.Map(contenedor.current, {
        center: { lat: modelo.camara.centro.lat, lng: modelo.camara.centro.lng },
        zoom: 13,
        // Los controles de Google se quitan: la aplicación tiene los suyos y
        // dos juegos de botones encima del mismo mapa es un desorden. El
        // logotipo y los créditos NO se tocan — son obligatorios.
        disableDefaultUI: true,
        clickableIcons: false,
        styles: estilo
      });
      ultima.current = modelo.camara;
      setListo(true);
    });

    return () => { vigente = false; };
    // Sin dependencias: se monta una vez y vive mientras viva la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El tema. Cambiar el estilo NO remonta el mapa, así que la cámara, los
  // marcadores y el viaje siguen donde estaban.
  useEffect(() => {
    if (mapa.current === null) return;
    mapa.current.setOptions({ styles: estilo });
  }, [estilo]);

  // La cámara, sólo cuando merece la pena moverse.
  useEffect(() => {
    if (mapa.current === null || !listo) return;
    if (!mereceMoverse(ultima.current, modelo.camara)) return;
    ultima.current = modelo.camara;

    const google = (globalThis as Google).google;
    mapa.current.panTo({ lat: modelo.camara.centro.lat, lng: modelo.camara.centro.lng });

    // Con dos puntos o más se encuadra todo; con uno, sólo se centra.
    const conCoordenadas = modelo.marcadores.length > 1 ? modelo.marcadores : [];
    if (conCoordenadas.length > 1 && google?.maps) {
      const limites = new google.maps.LatLngBounds();
      for (const marcador of conCoordenadas) {
        limites.extend({ lat: marcador.en.lat, lng: marcador.en.lng });
      }
      mapa.current.fitBounds(limites, { top: 60, right: 40, bottom: modelo.aireInferior + 40, left: 40 });
    }
  }, [modelo.camara, modelo.marcadores, modelo.aireInferior, listo]);

  // Los marcadores se pintan como capas encima del contenedor, no con
  // `google.maps.Marker`: así son las MISMAS piezas de React que en el
  // teléfono —la moto amarilla aprobada— y no un icono aparte que habría que
  // mantener en dos sitios.
  useEffect(() => {
    if (mapa.current === null || !listo) return;
    const google = (globalThis as Google).google;
    if (!google?.maps) return;

    for (const vivo of marcadoresVivos.current) vivo.setMap(null);
    marcadoresVivos.current = [];
    // Los superpuestos se colocan en el efecto de abajo, sobre el DOM.
  }, [listo]);

  if (fallo) return <HuecoDelMapa />;

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo, overflow: 'hidden' }}>
      {/* El lienzo de Google. `any` en la referencia porque en el paquete web
          este View ES un div, y el tipado de React Native no lo sabe. */}
      <View
        ref={contenedor as unknown as never}
        style={{ flex: 1 }}
      />

      {/* Los marcadores, encima. Se colocan en porcentaje respecto a la cámara
          conocida: no hace falta proyección exacta para que la composición sea
          la aprobada, y evita mantener dos juegos de iconos. */}
      {listo ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          {modelo.marcadores.map(marcador => {
            const lado = tamanoDelMarcador(marcador);
            const posicion = enPorcentaje(marcador.en, modelo.camara);
            return (
              <View
                key={marcador.clave}
                style={{
                  position: 'absolute',
                  left: `${posicion.x}%`,
                  top: `${posicion.y}%`,
                  marginLeft: -lado / 2,
                  marginTop: -lado / 2
                }}
              >
                <PiezaDelMarcador marcador={marcador} />
              </View>
            );
          })}
        </View>
      ) : null}

      {modelo.eligiendoPunto ? <ReticulaCentral /> : null}
    </View>
  );
}

/**
 * Dónde cae una coordenada dentro de la vista, en porcentaje.
 *
 * Es una proyección plana, no la de Mercator que usa Google. A la escala de una
 * ciudad la diferencia es de píxeles, y a cambio los marcadores son las mismas
 * piezas de React que en el teléfono.
 */
function enPorcentaje(punto: { lat: number; lng: number }, camara: Camara) {
  const mitad = camara.abarca / 2;
  return {
    x: ((punto.lng - (camara.centro.lng - mitad)) / camara.abarca) * 100,
    y: (((camara.centro.lat + mitad) - punto.lat) / camara.abarca) * 100
  };
}

/**
 * Lo que se ve cuando no hay mapa.
 *
 * La pantalla sigue entera: la hoja, el viaje y los botones están encima de
 * esto. Un fallo de Google no puede dejar a nadie sin poder ver su viaje.
 */
function HuecoDelMapa() {
  const tema = useTema();

  return (
    <View style={{
      flex: 1,
      backgroundColor: tema.color.fondo,
      alignItems: 'center',
      justifyContent: 'center',
      padding: tema.ritmo.margenPantalla
    }}>
      {EN_DESARROLLO ? (
        <Txt nivel="pie" tono="tenue" centrado>{faltaLaClave()}</Txt>
      ) : (
        // En una versión publicada no se cuenta qué variable falta: es
        // información de dentro y al usuario no le sirve.
        <Txt nivel="pie" tono="tenue" centrado>El mapa no está disponible ahora mismo.</Txt>
      )}
    </View>
  );
}
