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

/**
 * El pie es el centro institucional del sitio: recoge todo lo que no cabe en la
 * barra sin apretarla, agrupado por para quién es cada cosa. Aquí viven además
 * /pasajeros y /contacto, que no están en la navegación principal y no pueden
 * quedar sin ningún enlace que lleve a ellas.
 */
export const PIE_GRUPOS = [
  {
    titulo: "Producto",
    enlaces: [
      { label: "Servicios", href: "/servicios" },
      { label: "Pasajeros", href: "/pasajeros" },
      { label: "Seguridad", href: "/seguridad" },
    ],
  },
  {
    titulo: "Trabaja con nosotros",
    enlaces: [
      { label: "Conductores", href: "/conductores" },
      { label: "Aliados", href: "/aliados" },
    ],
  },
  {
    titulo: "Empresa",
    enlaces: [
      { label: "Nosotros", href: "/nosotros" },
      { label: "Ayuda", href: "/ayuda" },
      { label: "Contacto", href: "/contacto" },
    ],
  },
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
 * Pantallas reales de la aplicación, ya terminadas.
 *
 * `map-select` y `login` venían con marco de iPhone: se recortó el marco para
 * que el componente 3D aporte el suyo y no quede un teléfono dentro de otro.
 */
export const PHONE_SCREENS = [
  {
    id: "home",
    src: "/app/home.webp",
    alt: "Inicio de +58Express con los servicios disponibles",
  },
  {
    id: "map",
    src: "/app/map-select.webp",
    alt: "Mapa con la ruta trazada y el precio del viaje antes de confirmar",
  },
  {
    id: "login",
    src: "/app/login.webp",
    alt: "Pantalla de acceso a +58Express",
  },
  {
    id: "driver",
    src: "/app/driver-onboarding.webp",
    alt: "Los conductores eligen sus horas de actividad",
  },
];

/** Devuelve solo las pantallas pedidas: cada teléfono carga lo que muestra. */
export function screensById(...ids: string[]) {
  return ids
    .map((id) => PHONE_SCREENS.find((s) => s.id === id))
    .filter((s): s is (typeof PHONE_SCREENS)[number] => Boolean(s));
}

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
