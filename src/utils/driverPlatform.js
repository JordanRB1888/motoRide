/**
 * Desde dónde se puede conducir con +58Express.
 *
 * LA REGLA
 *
 * Un conductor sólo entra en servicio desde la aplicación móvil nativa. Desde
 * el navegador puede hacer todo lo demás —su perfil, sus datos, su historial,
 * sus ganancias, su configuración— pero no ponerse en línea.
 *
 * POR QUÉ
 *
 * El navegador no tiene el contrato de ubicación en segundo plano. En cuanto la
 * pestaña deja de estar activa —otra pestaña, el móvil bloqueado, el portátil
 * cerrado— el navegador suspende los temporizadores y deja de entregar
 * posiciones. Nadie avisa de que eso ha pasado.
 *
 * El resultado sería el peor estado posible: la pantalla diciendo «En línea»
 * mientras el despacho ve una posición rancia y descarta al conductor. Él cree
 * que trabaja, no le llegan viajes, y quien espera en la calle ve una moto que
 * no se mueve.
 *
 * Estar fuera de servicio es honesto. Parecer disponible sin serlo, no.
 *
 * DÓNDE SE APLICA
 *
 * En dos sitios, y ninguno es decorativo:
 *
 *   driverApp.setOnline        no marca en línea ni pide el cambio
 *   driverGpsTracker.start     no emite `driver:connect` ni arranca el GPS
 *
 * El segundo es el que de verdad cierra la puerta: un botón deshabilitado no
 * sirve de nada si el servicio que emite sigue accesible.
 */

/** La plataforma desde la que se conduce. No es una preferencia: es la regla. */
export const PLATAFORMA_OPERATIVA_DEL_CONDUCTOR = 'NATIVE_MOBILE_ONLY';

/** Lo que es esta aplicación. Todo `src/` corre en un navegador. */
export const PLATAFORMA_DE_ESTA_APLICACION = 'WEB';

/**
 * ¿Se puede entrar en servicio desde aquí?
 *
 * Se le pasa la plataforma en vez de mirarla dentro para que la regla se pueda
 * comprobar en los dos sentidos: que la web no puede y que la nativa sí. Una
 * función que sólo supiera decir «no» no probaría nada.
 */
export function puedeEntrarEnServicioDesde(plataforma = PLATAFORMA_DE_ESTA_APLICACION) {
  return plataforma === 'NATIVE_MOBILE';
}

/**
 * Lo que se le dice al conductor.
 *
 * Una frase, sin pantalla nueva ni modal. Dice qué hacer, no sólo que no se
 * puede: quien lee esto necesita saber por dónde sigue su jornada.
 */
export const AVISO_SOLO_DESDE_LA_APP =
  'Para conducir con +58Express, ponte en servicio desde la app móvil.';
