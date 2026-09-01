/**
 * El lienzo del mapa.
 *
 * NO HAY PROVEEDOR ELEGIDO
 *
 * Google Navigation SDK frente a Mapbox sigue sin decidirse, y meter uno aquí
 * sería tomar la decisión por la puerta de atrás: en cuanto una pantalla
 * dependiera de su componente, cambiar de proveedor dejaría de ser una
 * comparación de precios para pasar a ser una reescritura.
 *
 * Esto pinta calles con vistas normales. Cuando llegue el mapa real, se
 * sustituye el interior de `LienzoDeMapa` y la composición de alrededor —las
 * hojas, los marcadores, los controles— no se entera.
 *
 * POR QUÉ OCUPA TODA LA PANTALLA
 *
 * Antes el mapa era un rectángulo de 220 puntos dentro de una tarjeta, y eso
 * lo convertía en una ilustración: algo que se mira, no algo con lo que se
 * trabaja. En una aplicación de movilidad el mapa es el suelo sobre el que
 * pasa todo lo demás; el resto flota encima.
 */

import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Txt } from './componentes';
import { Icono } from './Icono';
import { MarcadorDeVehiculo } from './Marca';
import { useEsquema, useTema } from '../theme/ThemeContext';
import { useAireDeArriba } from './seguro';
import { OPACIDAD_DE_CALLE_POR_ESQUEMA } from '../theme/esquemas';
import type { TipoDeVehiculo } from '../theme/marca';

/** Una posición dentro del lienzo, en porcentaje. Nada de coordenadas reales. */
export interface PuntoDelLienzo {
  readonly x: number;
  readonly y: number;
}

export interface VehiculoEnMapa {
  readonly clave: string;
  readonly tipo: TipoDeVehiculo;
  readonly en: PuntoDelLienzo;
  readonly rumbo: number;
  /** El vehículo propio o el asignado se pinta más grande y con halo. */
  readonly destacado?: boolean;
}

/** Un punto con nombre: recogida, destino, un favorito. */
export interface HitoEnMapa {
  readonly clave: string;
  readonly en: PuntoDelLienzo;
  readonly tipo: 'origen' | 'destino';
  readonly etiqueta?: string;
}

// ---------------------------------------------------------------------------
// El suelo
// ---------------------------------------------------------------------------

/**
 * Las calles.
 *
 * Anchos distintos y una diagonal, porque una retícula perfecta se lee como
 * papel milimetrado y no como una ciudad. Maracaibo tiene avenidas largas y
 * una costa en diagonal; sin llegar a dibujar el plano real, basta con que la
 * silueta no sea un tablero de ajedrez.
 */
function Calles() {
  const tema = useTema();
  const esquema = useEsquema();

  // En noche las calles ACLARAN sobre manzanas oscuras; en día tienen que
  // aclarar mucho más, porque van casi blancas sobre marfil. Con el mismo valor
  // en los dos, el mapa de día salía con rayas grises y parecía roto.
  const opacidadDeCalle = OPACIDAD_DE_CALLE_POR_ESQUEMA[esquema];

  const colorDeCalle = tema.color.calleDelMapa;

  const horizontales = [
    { y: 12, grosor: 2 }, { y: 27, grosor: 7 }, { y: 41, grosor: 2 },
    { y: 56, grosor: 3 }, { y: 70, grosor: 8 }, { y: 86, grosor: 2 }
  ];
  const verticales = [
    { x: 9, grosor: 2 }, { x: 24, grosor: 6 }, { x: 43, grosor: 2 },
    { x: 61, grosor: 3 }, { x: 79, grosor: 7 }, { x: 93, grosor: 2 }
  ];

  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: tema.color.fondoDelMapa }} pointerEvents="none">
      {/* Las calles van CLARAS sobre las manzanas, que es como se leen los mapas
          en tema oscuro. Se pintan con el gris de texto a poca opacidad porque
          es el único tono de la paleta que aclara de verdad sobre grafito: con
          los tonos de superficie el mapa entero salía negro y no se distinguía
          ni una calle. */
      }
      {horizontales.map(calle => (
        <View key={`h${calle.y}`} style={{
          position: 'absolute', left: 0, right: 0,
          top: `${calle.y}%`, height: calle.grosor,
          backgroundColor: colorDeCalle, opacity: opacidadDeCalle
        }} />
      ))}
      {verticales.map(calle => (
        <View key={`v${calle.x}`} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${calle.x}%`, width: calle.grosor,
          backgroundColor: colorDeCalle, opacity: opacidadDeCalle
        }} />
      ))}

      {/* La diagonal: rompe la cuadrícula y da la sensación de avenida larga. */}
      <View style={{
        position: 'absolute', left: '-30%', right: '-30%', top: '58%',
        height: 10, backgroundColor: colorDeCalle, opacity: opacidadDeCalle,
        transform: [{ rotate: '-19deg' }]
      }} />

      {/* Una lámina de agua en la esquina: el lago está siempre a un lado.

          SIN AZUL. Iba en el token de información y era el último fondo azulado
          que quedaba, que es justo lo que el dueño pidió quitar. Estaba
          escondido debajo de la hoja del conductor y apareció al retirarla.

          Va en el color de las calles con más cuerpo: se lee como una masa
          distinta del asfalto sin meter un color que no es de la marca. */}
      <View style={{
        position: 'absolute', right: '-18%', bottom: '-14%',
        width: '58%', height: '38%', borderRadius: 999,
        backgroundColor: colorDeCalle, opacity: 0.16,
        transform: [{ rotate: '-12deg' }]
      }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Los hitos
// ---------------------------------------------------------------------------

/** Origen y destino. El origen es un punto; el destino, un banderín cuadrado. */
function Hito({ hito }: { readonly hito: HitoEnMapa }) {
  const tema = useTema();
  const esOrigen = hito.tipo === 'origen';

  return (
    <View style={{
      position: 'absolute',
      left: `${hito.en.x}%`,
      top: `${hito.en.y}%`,
      marginLeft: -11,
      marginTop: -11,
      alignItems: 'center'
    }}>
      <View style={{
        width: 22, height: 22,
        borderRadius: esOrigen ? 11 : 5,
        backgroundColor: esOrigen ? tema.color.textoPrimario : tema.color.acento,
        borderWidth: 3,
        borderColor: tema.color.fondo
      }} />
    </View>
  );
}

/**
 * La ruta entre dos puntos.
 *
 * Una recta con la inclinación correcta, no el trazado real: sin proveedor no
 * hay por dónde ir. Lo que importa aquí es que la composición reserve el sitio
 * y que se vea que origen y destino están conectados.
 */
function Ruta({ desde, hasta }: { readonly desde: PuntoDelLienzo; readonly hasta: PuntoDelLienzo }) {
  const tema = useTema();
  const dx = hasta.x - desde.x;
  const dy = hasta.y - desde.y;
  const largo = Math.sqrt(dx * dx + dy * dy);
  const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${desde.x}%`,
        top: `${desde.y}%`,
        width: `${largo}%`,
        height: 4,
        marginTop: -2,
        borderRadius: 2,
        backgroundColor: tema.color.acento,
        opacity: 0.85,
        transform: [{ rotate: `${angulo}deg` }],
        transformOrigin: 'left center'
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// El lienzo
// ---------------------------------------------------------------------------

export interface PropiedadesDelLienzo {
  readonly vehiculos?: readonly VehiculoEnMapa[];
  readonly hitos?: readonly HitoEnMapa[];
  /** Dibuja la línea entre el primer origen y el primer destino. */
  readonly conRuta?: boolean;
  /**
   * Modo de elegir un punto: aparece el retículo central fijo y el mapa se
   * atenúa. Es el gesto de «mueve el mapa, no el pin» que usan las
   * aplicaciones de movilidad. Aquí sólo se pinta el estado; arrastrar de
   * verdad llegará con el mapa real.
   */
  readonly eligiendoPunto?: boolean;
  /** Controles flotantes sobre el mapa (recentrar, capas). */
  readonly conControles?: boolean;
  /** Lo que flota encima: hojas, barras, avisos. */
  readonly children?: ReactNode;
}

export function LienzoDeMapa({
  vehiculos = [],
  hitos = [],
  conRuta = false,
  eligiendoPunto = false,
  conControles = true,
  children
}: PropiedadesDelLienzo) {
  const tema = useTema();
  const arriba = useAireDeArriba();
  const origen = hitos.find(hito => hito.tipo === 'origen');
  const destino = hitos.find(hito => hito.tipo === 'destino');

  return (
    <View style={{ flex: 1, backgroundColor: tema.color.fondo, overflow: 'hidden' }}>
      <Calles />

      {conRuta && origen && destino ? <Ruta desde={origen.en} hasta={destino.en} /> : null}

      {hitos.map(hito => <Hito key={hito.clave} hito={hito} />)}

      {vehiculos.map(vehiculo => (
        <View
          key={vehiculo.clave}
          style={{
            position: 'absolute',
            left: `${vehiculo.en.x}%`,
            top: `${vehiculo.en.y}%`,
            marginLeft: vehiculo.destacado ? -31 : -21,
            marginTop: vehiculo.destacado ? -31 : -21
          }}
        >
          <MarcadorDeVehiculo
            tipo={vehiculo.tipo}
            tamano={vehiculo.destacado ? 62 : 42}
            rumbo={vehiculo.rumbo}
            halo={vehiculo.destacado === true}
          />
        </View>
      ))}

      {/* Elegir un punto en el mapa. */}
      {eligiendoPunto ? (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', inset: 0, backgroundColor: tema.color.fondo, opacity: 0.25 }} />
          <View style={{ alignItems: 'center' }}>
            <View style={{
              paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10,
              borderRadius: tema.radio.insignia,
              backgroundColor: tema.color.superficieElevada
            }}>
              <Txt nivel="etiqueta">Mueve el mapa</Txt>
            </View>
            <View style={{
              width: 26, height: 26, borderRadius: 13,
              borderWidth: 3, borderColor: tema.color.acento,
              backgroundColor: `${tema.color.acento}33`
            }} />
            {/* El pie del retículo: marca el punto exacto en el suelo. */}
            <View style={{ width: 2, height: 16, backgroundColor: tema.color.acento }} />
            <View style={{
              width: 8, height: 4, borderRadius: 2,
              backgroundColor: tema.color.fondo, opacity: 0.5
            }} />
          </View>
        </View>
      ) : null}

      {/* El control va por debajo de la cabecera flotante: a 14 puntos se
          solapaba con la pastilla de la tasa, que ocupa la esquina derecha. */}
      {conControles ? (
        <View style={{ position: 'absolute', right: 14, top: 92 + arriba, gap: 10 }}>
          <BotonDeMapa icono="destino" etiqueta="Centrar en mi ubicación" />
        </View>
      ) : null}

      {children}
    </View>
  );
}

/** Un control redondo flotando sobre el mapa. */
function BotonDeMapa({ icono, etiqueta, onPress }: {
  readonly icono: 'destino' | 'inicio';
  readonly etiqueta: string;
  readonly onPress?: () => void;
}) {
  const tema = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={({ pressed }) => ({
        width: 42, height: 42, borderRadius: 21,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? tema.color.borde : tema.color.superficieElevada,
        // Flota sobre el mapa, que pinta sus manzanas con `superficie`: sin
        // subir un escalón el control desaparecería sobre el propio suelo.
        shadowColor: '#000000',
        shadowOpacity: 0.4,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
        elevation: 8
      })}
    >
      <Icono nombre={icono} color={tema.color.textoSecundario} tamano={20} />
    </Pressable>
  );
}
