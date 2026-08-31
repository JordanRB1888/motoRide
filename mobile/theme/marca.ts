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

/** Resuelve la imagen de un vehículo. Equivale a `getVehicleAsset` de la web. */
export function imagenDeVehiculo(
  tipo: TipoDeVehiculo,
  variante: VarianteDeVehiculo = 'tarjeta'
): ImageSourcePropType {
  return VEHICULOS[tipo][variante];
}
