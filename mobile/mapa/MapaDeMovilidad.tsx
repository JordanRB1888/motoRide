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
import {
  claveDelNavegador,
  faltaLaClave,
  hayClaveDelNavegador,
  identificadorDelNavegador
} from './claves';
import { estiloLocalSiHaceFalta } from './estilos';
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
    if (typeof (globalThis as Google).google?.maps?.importLibrary === 'function') {
      return resolver(true);
    }

    const clave = claveDelNavegador();
    if (clave === '') return resolver(false);

    // EL `onload` DEL SCRIPT NO SIRVE, Y ES UNA CARRERA QUE SE GANA A VECES
    //
    // Con `loading=async` el fichero llega y se ejecuta, pero Google sigue
    // preparando la API un rato después. Justo en `onload`,
    // `google.maps.importLibrary` todavía no existe —comprobado— y el mapa
    // falla con un error que no dice nada de lo que pasa. Un instante más
    // tarde sí está, así que el fallo va y viene según lo que tarde la red.
    //
    // `callback` es el mecanismo que Google da para esto: llama cuando la API
    // está lista de verdad. Va en el objeto global porque el script sólo puede
    // llamar a algo que encuentre por nombre.
    const avisar = '__mapaDe58ExpressListo';
    (globalThis as Record<string, unknown>)[avisar] = () => {
      delete (globalThis as Record<string, unknown>)[avisar];
      resolver(true);
    };

    // `map_ids` declara el identificador por adelantado para que Google traiga
    // el estilo del dueño con el script y no en una segunda vuelta: sin esto
    // el mapa aparece un instante con los colores de fábrica y luego cambia.
    const identificador = identificadorDelNavegador();
    const precarga = identificador === ''
      ? ''
      : `&map_ids=${encodeURIComponent(identificador)}`;

    const etiqueta = document.createElement('script');
    // `loading=async` es lo que Google pide desde 2023; sin ello avisa por
    // consola en cada carga.
    etiqueta.src = 'https://maps.googleapis.com/maps/api/js'
      + `?key=${encodeURIComponent(clave)}&loading=async&callback=${avisar}${precarga}`;
    etiqueta.async = true;
    // Un fallo de Google no puede tumbar la aplicación: se resuelve en `false`
    // y la pantalla enseña el hueco.
    etiqueta.onerror = () => resolver(false);
    document.head.appendChild(etiqueta);
  });

  return cargando;
}

export function MapaDeMovilidad({ modelo, onCentro }: {
  readonly modelo: ModeloDelMapa;
  /** El centro cada vez que el mapa deja de moverse, eligiendo punto. */
  readonly onCentro?: (centro: { lat: number; lng: number }) => void;
}) {
  const tema = useTema();
  const esquema = useEsquema();

  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<any>(null);
  const ultima = useRef<Camara | null>(null);

  // El escuchador de `idle` se registra UNA vez, al crear el mapa, asi que no
  // puede cerrar sobre el modelo ni sobre la funcion de este repintado: se
  // quedaria con los de aquel momento. Se leen por referencia, siempre al dia.
  const modeloVivo = useRef(modelo);
  modeloVivo.current = modelo;
  const alElegir = useRef(onCentro);
  alElegir.current = onCentro;

  // La proyección del mapa, para saber en qué píxel cae una coordenada.
  //
  // Sin esto los marcadores se colocaban por regla de tres sobre la cámara del
  // modelo, y al arrastrar el mapa se quedaban clavados en la pantalla
  // mientras las calles pasaban por debajo. Un marcador de origen que no
  // apunta al origen es peor que no tener marcador.
  const capa = useRef<any>(null);

  // Los nodos de cada marcador, para moverlos sin volver a dibujarlos.
  //
  // Google llama a `draw()` en cada fotograma mientras el mapa se mueve. Pedir
  // un repintado de React ahí dentro deja la página en un bucle: se repinta,
  // Google vuelve a dibujar, y otra vez. Movemos el nodo y ya está — es lo que
  // hace el propio Google con sus marcadores.
  const nodos = useRef(new Map<string, HTMLElement>());
  const colocar = useRef<() => void>(() => undefined);

  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(!hayClaveDelNavegador());

  const identificador = identificadorDelNavegador();

  // Con identificador manda Google Cloud y esto es `undefined`. Los dos a la
  // vez no se pueden: Google ignora `styles` en cuanto hay `mapId` y lo avisa
  // por consola.
  const estilo = useMemo(
    () => estiloLocalSiHaceFalta(esquema, identificador),
    [esquema, identificador]
  );

  // CREAR EL MAPA — y rehacerlo al cambiar de tema, sólo por eso
  //
  // `mapId` y `colorScheme` son opciones de construcción: Google no deja
  // cambiarlas después. Con el estilo en la nube, pasar de día a noche exige
  // un mapa nuevo.
  //
  // Es el precio del estilo en la nube. Se paga dos veces al día, y se
  // recupera dónde estaba mirando para que no salte a otro sitio.
  useEffect(() => {
    let vigente = true;

    void (async () => {
      const cargado = await cargarGoogle();
      if (!vigente) return;
      if (!cargado) return setFallo(true);

      const google = (globalThis as Google).google;
      if (!google?.maps || contenedor.current === null) return setFallo(true);

      // Con `loading=async` el script NO trae las clases: sólo el cargador.
      // `google.maps.Map` no existe hasta pedir su biblioteca, y usarlo antes
      // da «Map is not a constructor», que no dice nada de lo que pasa.
      const { Map, OverlayView } = await google.maps.importLibrary('maps');
      if (!vigente || contenedor.current === null) return;

      // Si ya había mapa, se conserva su vista y se limpia el hueco: dos
      // mapas dentro del mismo contenedor se apilan uno sobre otro.
      const centroPrevio = mapa.current?.getCenter?.();
      const zoomPrevio = mapa.current?.getZoom?.();
      if (mapa.current !== null) contenedor.current.innerHTML = '';

      mapa.current = new Map(contenedor.current, {
        center: centroPrevio ?? {
          lat: modelo.camara.centro.lat,
          lng: modelo.camara.centro.lng
        },
        zoom: zoomPrevio ?? 13,
        // El identificador trae el estilo del dueño. Sin él se usa el JSON
        // local, que es la red de seguridad.
        ...(identificador === '' ? { styles: estilo } : { mapId: identificador }),
        // Elige el estilo claro u oscuro DENTRO del identificador. Manda el
        // tema de +58express, no `prefers-color-scheme`: la aplicación decide
        // su hora por Caracas y el mapa tiene que ir con ella.
        colorScheme: esquema === 'oscuro' ? 'DARK' : 'LIGHT',
        // Los controles de Google se quitan: la aplicación tiene los suyos y
        // dos juegos de botones encima del mismo mapa es un desorden. El
        // logotipo y los créditos NO se tocan — son obligatorios.
        disableDefaultUI: true,
        clickableIcons: false
      });
      // Una capa vacía, sólo para que Google diga dónde cae cada coordenada.
      // Su `draw` se llama en cada movimiento del mapa —arrastrar, ampliar,
      // animar—, y ahí es donde los marcadores se vuelven a colocar.
      const superficie = new OverlayView();
      superficie.onAdd = () => undefined;
      superficie.onRemove = () => undefined;
      superficie.draw = () => colocar.current();
      superficie.setMap(mapa.current);

      // El centro al soltar. `idle` es el evento que Google dispara cuando el
      // mapa termina de moverse; `center_changed` saltaria por fotograma.
      mapa.current.addListener('idle', () => {
        if (!modeloVivo.current.eligiendoPunto) return;
        const centro = mapa.current?.getCenter?.();
        if (centro) alElegir.current?.({ lat: centro.lat(), lng: centro.lng() });
      });
      capa.current = superficie;

      ultima.current = modelo.camara;
      setListo(true);
    })();

    return () => {
      vigente = false;
      capa.current?.setMap(null);
      capa.current = null;
    };
    // Sólo el tema y el identificador rehacen el mapa. El modelo cambia a cada
    // rato y rehacerlo entonces sería un parpadeo constante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esquema, identificador]);

  // La cámara, sólo cuando merece la pena moverse.
  useEffect(() => {
    if (mapa.current === null || !listo) return;
    if (!mereceMoverse(ultima.current, modelo.camara)) return;
    ultima.current = modelo.camara;

    const google = (globalThis as Google).google;
    mapa.current.panTo({ lat: modelo.camara.centro.lat, lng: modelo.camara.centro.lng });

    // Con dos puntos o más se encuadra todo; con uno, sólo se centra.
    //
    // `LatLngBounds` sale del cargador dinámico igual que `Map`, así que se
    // comprueba antes de usarlo: si aún no llegó, el `panTo` de arriba ya dejó
    // la cámara en su sitio y sólo se pierde el encuadre holgado.
    const conCoordenadas = modelo.marcadores.length > 1 ? modelo.marcadores : [];
    if (conCoordenadas.length > 1 && typeof google?.maps?.LatLngBounds === 'function') {
      const limites = new google.maps.LatLngBounds();
      for (const marcador of conCoordenadas) {
        limites.extend({ lat: marcador.en.lat, lng: marcador.en.lng });
      }
      mapa.current.fitBounds(limites, { top: 60, right: 40, bottom: modelo.aireInferior + 40, left: 40 });
    }
  }, [modelo.camara, modelo.marcadores, modelo.aireInferior, listo]);

  /**
   * Poner cada marcador donde Google dice que cae su coordenada.
   *
   * Se llama en cada movimiento del mapa y toca el DOM directamente: mover
   * cuatro nodos es barato, repintar React sesenta veces por segundo no.
   *
   * Mientras Google no tenga proyección —los primeros fotogramas— los
   * marcadores se quedan ocultos: más vale que aparezcan un instante tarde a
   * que aparezcan en el sitio equivocado.
   */
  colocar.current = () => {
    const proyeccion = capa.current?.getProjection?.();
    const google = (globalThis as Google).google;

    for (const marcador of modelo.marcadores) {
      const nodo = nodos.current.get(marcador.clave);
      if (nodo === undefined) continue;

      const pixel = proyeccion && google?.maps
        ? proyeccion.fromLatLngToContainerPixel(new google.maps.LatLng(marcador.en.lat, marcador.en.lng))
        : null;

      if (pixel === null || pixel === undefined) {
        nodo.style.visibility = 'hidden';
        continue;
      }

      const lado = tamanoDelMarcador(marcador);
      nodo.style.visibility = 'visible';
      nodo.style.transform = `translate(${pixel.x - lado / 2}px, ${pixel.y - lado / 2}px)`;
    }
  };

  // Al cambiar los marcadores hay que recolocarlos aunque el mapa no se mueva.
  useEffect(() => { colocar.current(); }, [modelo.marcadores, listo]);

  if (fallo) return <HuecoDelMapa />;

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo, overflow: 'hidden' }}>
      {/* El lienzo de Google. `any` en la referencia porque en el paquete web
          este View ES un div, y el tipado de React Native no lo sabe. */}
      <View
        ref={contenedor as unknown as never}
        style={{ flex: 1 }}
      />

      {/* Los marcadores, encima del lienzo pero anclados al mapa: su sitio lo
          da la proyección de Google, así que siguen a las calles cuando el
          mapa se arrastra o se amplía.

          Se pintan como capas de React y no con `google.maps.Marker` para que
          sean las MISMAS piezas que en el teléfono —la moto amarilla
          aprobada— y no un icono aparte que mantener en dos sitios.

          Cada uno se dibuja UNA vez y luego sólo se mueve: su sitio lo pone
          `colocar()` sobre el nodo, en cada movimiento del mapa. */}
      {listo ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          {modelo.marcadores.map(marcador => (
            <View
              key={marcador.clave}
              ref={(nodo: unknown) => {
                if (nodo === null) nodos.current.delete(marcador.clave);
                else nodos.current.set(marcador.clave, nodo as HTMLElement);
                colocar.current();
              }}
              // Oculto hasta que la proyección diga dónde va: en la esquina
              // superior izquierda se leería como un marcador en el mar.
              style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden' }}
            >
              <PiezaDelMarcador marcador={marcador} />
            </View>
          ))}
        </View>
      ) : null}

      {modelo.eligiendoPunto ? <ReticulaCentral /> : null}
    </View>
  );
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
