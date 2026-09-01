/**
 * Los activos de marca de +58express.
 *
 * QUÉ ES ESTO
 *
 * El equivalente en React Native de `src/utils/vehicleMedia.js`, que es donde
 * la aplicación web resuelve qué imagen corresponde a cada vehículo. Mismo
 * criterio, misma pareja de variantes: una para tarjeta y otra para mapa.
 *
 * No se ha dibujado nada nuevo. Las cinco imágenes son las OFICIALES que ya
 * usa la web, copiadas sin recortar, sin recolorear y sin cambiar la
 * proporción. Sólo el logotipo apaisado se guardó a la mitad exacta de sus
 * píxeles —1476x522 pasa a 738x261, división entera, misma proporción—, porque
 * a 850 KB pesaba casi tanto como el resto del paquete junto y en pantalla
 * nunca supera los 240 puntos de ancho.
 *
 * POR QUÉ IMPORTA QUE ESTÉN AQUÍ
 *
 * Los vehículos amarillos, el emblema y el logotipo son activos de marca, no
 * ilustraciones de relleno. Un pictograma genérico en su lugar se lee como otra
 * aplicación cualquiera; de hecho ya pasó una vez en la web, donde el icono de
 * moto del control de disponibilidad «se leía como bicicleta» y hubo que
 * sustituirlo por la fotografía real.
 *
 * DOS VARIANTES POR VEHÍCULO, Y NO SON INTERCAMBIABLES
 *
 *   tarjeta  vista en tres cuartos, para elegir servicio
 *   mapa     vista cenital, para pintar encima del mapa
 *
 * La cenital es cuadrada a propósito: girándola sobre su centro apunta hacia
 * donde va el vehículo sin deformarse. Usar la de tarjeta sobre el mapa daría
 * una moto de perfil que siempre mira a la derecha.
 */

import type { ImageSourcePropType } from 'react-native';

/** Los tipos de vehículo que la plataforma reconoce hoy. */
export const TIPOS_DE_VEHICULO = ['MOTO', 'AUTO'] as const;
export type TipoDeVehiculo = (typeof TIPOS_DE_VEHICULO)[number];

/** Para qué se va a usar la imagen. Determina qué toma se necesita. */
export type VarianteDeVehiculo = 'tarjeta' | 'mapa';

interface ActivoDeVehiculo {
  readonly tarjeta: ImageSourcePropType;
  readonly mapa: ImageSourcePropType;
  /** Cómo se nombra el vehículo de cara a la persona. */
  readonly nombre: string;
  /** Cuántas personas caben. Lo usa el selector de servicio. */
  readonly plazas: number;
  /** Proporción de la toma de tarjeta, para reservar el hueco sin deformar. */
  readonly proporcionDeTarjeta: number;
}

/**
 * Las rutas van literales dentro de `require` a propósito: el empaquetador de
 * Metro resuelve estas llamadas en tiempo de compilación y una ruta construida
 * con variables no la puede seguir.
 */
export const VEHICULOS: Readonly<Record<TipoDeVehiculo, ActivoDeVehiculo>> = Object.freeze({
  MOTO: Object.freeze({
    tarjeta: require('../assets/marca/moto.png') as ImageSourcePropType,
    mapa: require('../assets/marca/moto-mapa.png') as ImageSourcePropType,
    nombre: 'Moto',
    plazas: 1,
    proporcionDeTarjeta: 640 / 427
  }),
  AUTO: Object.freeze({
    tarjeta: require('../assets/marca/auto.png') as ImageSourcePropType,
    mapa: require('../assets/marca/auto-mapa.png') as ImageSourcePropType,
    nombre: 'Auto',
    plazas: 4,
    proporcionDeTarjeta: 640 / 427
  })
});

/**
 * El logotipo apaisado: la marca completa con el motociclista en movimiento.
 *
 * Va en el arranque y en el acceso, donde hay sitio para que se lea. No debe
 * repetirse en cada pantalla: una marca que aparece en todas partes deja de
 * significar nada, y dentro de la aplicación la persona ya sabe dónde está.
 */
export const LOGO_HORIZONTAL: ImageSourcePropType =
  require('../assets/marca/logo-horizontal.png') as ImageSourcePropType;

/** Proporción real del logotipo, para dimensionarlo por el ancho sin deformarlo. */
export const PROPORCION_DEL_LOGO = 738 / 261;

/**
 * El emblema circular: el pin con la moto y el nombre.
 *
 * Es el icono de la aplicación, y ya venía en el proyecto desde la fundación.
 * Se reutiliza tal cual en el arranque.
 */
export const EMBLEMA: ImageSourcePropType =
  require('../assets/splash-icon.png') as ImageSourcePropType;

/**
 * Los avatares del selector de rol.
 *
 * Los encargó el dueño y llegan con la identidad ya puesta: negro y amarillo,
 * el pin del mapa, la ruta trazada y la moto. Sustituyen a lo que había —un
 * recorte de mapa y la fotografía del vehículo—, que servía pero era un apaño.
 *
 * Se guardan a 288 píxeles: se usan en un hueco de 96 puntos, así que eso cubre
 * pantallas de tres veces la densidad. Los originales venían a 1254 y pesaban
 * 1,3 y 1,5 MB; a ese tamaño son 82 y 100 KB.
 */
export const AVATARES_DE_ROL = Object.freeze({
  pasajero: require('../assets/marca/rol-pasajero.png') as ImageSourcePropType,
  conductor: require('../assets/marca/rol-conductor.png') as ImageSourcePropType
});

/**
 * Dónde cae la cara de la pasajera dentro de su avatar.
 *
 * En fracciones del lado y no en píxeles: el activo está guardado a 288 y
 * podría volver a exportarse a otro tamaño sin que el encuadre se mueva.
 *
 * La ilustración es apaisada de contenido —la persona a la izquierda, la moto y
 * la ruta a la derecha—, así que recortarla por el centro daría mapa y nada de
 * persona. Estos dos números son el punto que hay que dejar en el centro para
 * que se vea cabeza y hombros.
 */
export const ENCUADRE_DE_LA_PASAJERA = Object.freeze({ x: 135 / 320, y: 118 / 320 });

/**
 * Cuánto se agranda el avatar respecto al diámetro del disco.
 *
 * Con 1 se vería la ilustración entera y la persona quedaría minúscula; con 3
 * se vería un ojo. 1,85 deja el plano medio corto que se lee a 64 puntos.
 */
export const ACERCAMIENTO_DE_LA_PASAJERA = 1.85;

/**
 * El arte de las casillas del inicio.
 *
 * Son las ilustraciones que encargó el dueño: mismo lenguaje que los avatares
 * de rol —render 3D, grafito y amarillo, sobre fondo oscuro y en formato
 * cuadrado—. Cada una dice de qué va su casilla mejor de lo que puede decirlo
 * ninguno de los doce glifos que tenemos.
 *
 * EL REGISTRO ES PARCIAL A PROPÓSITO
 *
 * Una casilla sin arte no se rompe: cae al icono de siempre. Así el arte puede
 * ir llegando por partes sin dejar la pantalla a medias, y el día que se
 * sustituya una ilustración sólo cambia esta línea.
 *
 * Las rutas van literales dentro de `require` porque Metro las resuelve en
 * tiempo de compilación: una ruta construida con variables no la puede seguir.
 *
 * Las seis llegaron a 1254 píxeles y pesaban 1,6 MB cada una —nueve megas y
 * medio para dibujarlas a cuarenta y seis puntos—. Se guardan a 288, que cubre
 * pantallas de tres veces la densidad: 594 KB las seis juntas.
 */
export const ARTE_DE_SERVICIO: Readonly<Partial<Record<string, ImageSourcePropType>>> =
  Object.freeze({
    // Viajes usa la moto de marca, que ya la teníamos: es la misma toma en tres
    // cuartos del selector de servicio.
    moto: VEHICULOS.MOTO.tarjeta,
    'servicio-comercios': require('../assets/marca/servicio-comercios.png') as ImageSourcePropType,
    'servicio-transporte-seguro': require('../assets/marca/servicio-transporte-seguro.png') as ImageSourcePropType,
    'servicio-envios': require('../assets/marca/servicio-envios.png') as ImageSourcePropType,
    'servicio-comida': require('../assets/marca/servicio-comida.png') as ImageSourcePropType,
    'servicio-mercado': require('../assets/marca/servicio-mercado.png') as ImageSourcePropType,
    'servicio-compra-vende': require('../assets/marca/servicio-compra-vende.png') as ImageSourcePropType
  });

/**
 * El arte de las campañas.
 *
 * Separado del de los servicios porque tienen dueños distintos: las casillas
 * son de +58express y cambian poco; los banners los entrega quien paga y
 * cambian cada semana.
 *
 * PENDIENTE: cuando el panel administrativo exista, esto deja de ser un
 * `require` local y pasa a ser una dirección del servidor. Un banner que cambia
 * cada semana no puede obligar a publicar en las tiendas.
 */
export const ARTE_DE_CAMPANA: Readonly<Partial<Record<string, ImageSourcePropType>>> =
  Object.freeze({
    // En JPEG y no en PNG: es una fotografía sin transparencia, y en PNG pesaba
    // 1,8 MB. Recortada a su propio marco —el arte traía un borde amarillo
    // dentro de un fondo negro, y pintarlo en una tarjeta con borde daba doble
    // marco— y guardada a 900 de ancho: 88 KB.
    'campana-repuestos': require('../assets/marca/campana-repuestos.jpg') as ImageSourcePropType
  });

/** Resuelve la imagen de un vehículo. Equivale a `getVehicleAsset` de la web. */
export function imagenDeVehiculo(
  tipo: TipoDeVehiculo,
  variante: VarianteDeVehiculo = 'tarjeta'
): ImageSourcePropType {
  return VEHICULOS[tipo][variante];
}
