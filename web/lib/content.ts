/**
 * Contenido del sitio, centralizado.
 *
 * Regla del proyecto: aquí no entra ni una cifra que no se pueda respaldar.
 * Nada de usuarios, viajes diarios, ciudades cubiertas, conductores, ratings
 * ni descuentos. Si algún día existen datos públicos verificables, entran aquí
 * con su fuente.
 */

export const NAV = [
  { label: "Servicios", href: "/servicios" },
  { label: "Seguridad", href: "/seguridad" },
  { label: "Conductores", href: "/conductores" },
  { label: "Aliados", href: "/aliados" },
  { label: "Nosotros", href: "/nosotros" },
  { label: "Ayuda", href: "/ayuda" },
] as const;

export type ServiceId =
  | "mototaxi"
  | "viajes"
  | "delivery"
  | "comida"
  | "mercado"
  | "envios"
  | "encomiendas"
  | "comercios"
  | "compraventa"
  | "seguro";

export type Service = {
  id: ServiceId;
  name: string;
  line: string;
  /** Pantalla del teléfono que se enciende al enfocar este servicio. */
  screen: string;
};

export const SERVICES: Service[] = [
  {
    id: "mototaxi",
    name: "Mototaxi",
    line: "La forma más rápida de cruzar la ciudad.",
    screen: "home",
  },
  {
    id: "viajes",
    name: "Viajes",
    line: "Sales de casa sabiendo cuánto cuesta.",
    screen: "home",
  },
  {
    id: "delivery",
    name: "Delivery",
    line: "Lo que necesitas, hasta tu puerta.",
    screen: "home",
  },
  {
    id: "comida",
    name: "Comida",
    line: "Del local de siempre, sin salir.",
    screen: "home",
  },
  {
    id: "mercado",
    name: "Mercado",
    line: "La compra de la semana, resuelta.",
    screen: "home",
  },
  {
    id: "envios",
    name: "Envíos",
    line: "Manda algo al otro lado de la ciudad.",
    screen: "home",
  },
  {
    id: "encomiendas",
    name: "Encomiendas",
    line: "Paquetes que llegan cuando dices.",
    screen: "home",
  },
  {
    id: "comercios",
    name: "Comercios",
    line: "Tu negocio, dentro de la app.",
    screen: "home",
  },
  {
    id: "compraventa",
    name: "Compra y venta",
    line: "Publica, vende y coordina la entrega.",
    screen: "home",
  },
  {
    id: "seguro",
    name: "Transporte seguro",
    line: "Conductor identificado y viaje registrado.",
    screen: "driver",
  },
];

/**
 * Pantallas reales de la aplicación, verificadas una por una contra la captura.
 *
 * Solo entran aquí las que muestran producto. Quedan fuera `c-oferta2.png` y
 * `c-tras-aceptar.png`: pese a su nombre son el historial VACÍO del conductor
 * («Todavía no has hecho ningún viaje») y no sirven para mostrar el servicio.
 *
 * PENDIENTE: faltan los estados intermedios del viaje (buscando conductor,
 * conductor asignado, viaje en curso). Se capturan levantando la app real.
 */
export const PHONE_SCREENS = [
  { id: "home", src: "/app/passenger-home.png", alt: "Pantalla de inicio del pasajero en +58Express" },
  { id: "driver", src: "/app/driver-profile.png", alt: "Perfil del conductor verificado" },
  { id: "earnings", src: "/app/driver-earnings.png", alt: "Ganancias del conductor" },
];

/**
 * Los pasos siguen la máquina de estados real del backend:
 * DRAFT → SEARCHING → DRIVER_ASSIGNED → DRIVER_EN_ROUTE → IN_TRIP → COMPLETED
 */
export const HOW_IT_WORKS = [
  {
    state: "DRAFT",
    title: "Dinos a dónde vas",
    body: "Marcas tu punto de partida y tu destino. Antes de confirmar, ves el precio.",
  },
  {
    state: "SEARCHING",
    title: "Buscamos tu conductor",
    body: "La solicitud sale hacia los conductores disponibles más cercanos.",
  },
  {
    state: "DRIVER_ASSIGNED",
    title: "Alguien la toma",
    body: "Un conductor verificado acepta. Ves quién es y cuánto tarda en llegar.",
  },
  {
    state: "IN_TRIP",
    title: "Sigues todo en vivo",
    body: "La ruta avanza en el mapa en tiempo real, y puedes escribirle si hace falta.",
  },
  {
    state: "COMPLETED",
    title: "Llegaste",
    body: "Pagas como prefieras y queda el registro del viaje.",
  },
];

/** Capacidades verificadas en el código del producto. */
export const SAFETY = [
  {
    title: "Conductor verificado",
    body: "Cada conductor sube su documentación y un administrador la revisa y aprueba antes de que pueda trabajar.",
  },
  {
    title: "Viaje registrado",
    body: "Cada carrera queda con su recorrido, sus tiempos y su estado. Si algo pasa, hay registro.",
  },
  {
    title: "Ubicación en vivo",
    body: "La posición del conductor viaja en tiempo real mientras dura el viaje.",
  },
  {
    title: "Conversación dentro del viaje",
    body: "Puedes escribirle al conductor desde la app. Los adjuntos son privados.",
  },
  {
    title: "Soporte con historial",
    body: "Escribes al equipo desde la app y la conversación queda guardada.",
  },
];

export const PAYMENTS = [
  "Wallet +58express",
  "Pago Móvil",
  "Zelle",
  "Zinli",
  "Efectivo",
];

/**
 * La app todavía no está publicada. Mientras no exista una URL real de tienda,
 * el botón no lleva a ninguna parte y lo dice.
 */
export const STORES = {
  available: false,
  google: null as string | null,
  apple: null as string | null,
  label: "Próximamente",
};
