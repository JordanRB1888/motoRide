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
  /** Pieza que se enciende al enfocar este servicio. */
  screen: PiezaId;
};

export const SERVICES: Service[] = [
  {
    id: "mototaxi",
    name: "Mototaxi",
    line: "La forma más rápida de cruzar la ciudad.",
    screen: "viaje",
  },
  {
    id: "viajes",
    name: "Viajes",
    line: "Sales de casa sabiendo cuánto cuesta.",
    screen: "viaje",
  },
  {
    id: "delivery",
    name: "Delivery",
    line: "Lo que necesitas, hasta tu puerta.",
    screen: "delivery",
  },
  {
    id: "comida",
    name: "Comida",
    line: "Del local de siempre, sin salir.",
    screen: "delivery",
  },
  {
    id: "mercado",
    name: "Mercado",
    line: "La compra de la semana, resuelta.",
    screen: "delivery",
  },
  {
    id: "envios",
    name: "Envíos",
    line: "Manda algo al otro lado de la ciudad.",
    screen: "delivery",
  },
  {
    id: "encomiendas",
    name: "Encomiendas",
    line: "Paquetes que llegan cuando dices.",
    screen: "delivery",
  },
  {
    id: "comercios",
    name: "Comercios",
    line: "Tu negocio, dentro de la app.",
    screen: "delivery",
  },
  {
    id: "compraventa",
    name: "Compra y venta",
    line: "Publica, vende y coordina la entrega.",
    screen: "bienvenida",
  },
  {
    id: "seguro",
    name: "Transporte seguro",
    line: "Conductor identificado y viaje registrado.",
    screen: "conductores",
  },
];

/**
 * Imágenes del producto que enseña la portada.
 *
 * SON UNA DEMOSTRACIÓN VISUAL DEL PRODUCTO, Y NO UN ESCAPARATE DE PRECIOS
 *
 * La regla del principio de este fichero —«aquí no entra ni una cifra que no se
 * pueda respaldar»— vale igual dentro de una imagen: nadie distingue si una
 * promesa está escrita en HTML o pintada en un píxel. El 16 de septiembre de
 * 2026 se limpiaron por eso, una a una:
 *
 *   · una tarifa concreta en dólares, repetida tres veces, que se leería como el
 *     precio vigente de un viaje;
 *   · una categoría de auto para cuatro personas que el sitio no ofrece ni una
 *     sola vez;
 *   · una tasa de cambio en bolívares con dos decimales, que se lee como la de
 *     hoy;
 *   · una cifra de usuarios diarios —y encima a medio escribir, con el número
 *     literalmente ausente de la frase—;
 *   · una cobertura nacional, de todo el país, que no existe;
 *   · un programa de niveles con «mejores beneficios» sin confirmar;
 *   · los nombres de tres negocios reales sobre el mapa, sin ninguna relación
 *     comercial con ellos;
 *   · un nombre y una cara de una persona que no existe.
 *
 * Lo que se conserva es el diseño entero: mismas pantallas, misma composición,
 * mismas fotos, misma tipografía. Sólo cambió lo que afirmaba de más. La misma
 * regla vale para las piezas de campaña de abajo.
 */
export type PiezaId = "viaje" | "delivery" | "bienvenida" | "conductores" | "conductor-aprobado";

/**
 * Piezas de campaña (noviembre de 2026): sustituyen a las capturas sueltas, que
 * dentro del teléfono dibujado se veían pequeñas y borrosas. Cada una ya trae
 * sus propios teléfonos con pantallas reales; `conductor-aprobado` es el
 * teléfono de la derecha de la pieza de postulación, recortado.
 */
export const PIEZAS = [
  {
    id: "viaje",
    src: "/campana/viaje.webp",
    width: 1080,
    height: 1611,
    alt: "Así funciona un viaje en +58Express: mototaxi y taxi. Pide, sigue a tu conductor y llega a tu destino desde una sola app.",
  },
  {
    id: "delivery",
    src: "/campana/delivery.webp",
    width: 1080,
    height: 1595,
    alt: "Así funciona Delivery en +58Express: pide, sigue tu pedido y recíbelo en tu puerta.",
  },
  {
    id: "bienvenida",
    src: "/campana/bienvenida.webp",
    width: 1080,
    height: 1704,
    alt: "El acceso de +58Express cambia con tu ciudad y tu hora: Mara de día y Maracaibo de noche.",
  },
  {
    id: "conductores",
    src: "/campana/conductores.webp",
    width: 1080,
    height: 1708,
    alt: "Conduce con +58Express: te registras, te postulas y, cuando tu solicitud está aprobada, empiezas a conducir.",
  },
  {
    id: "conductor-aprobado",
    src: "/campana/conductor-aprobado.webp",
    width: 760,
    height: 1264,
    alt: "Inicio del conductor con la solicitud aprobada y el botón para entrar como conductor.",
  },
] as const satisfies readonly {
  id: PiezaId;
  src: string;
  width: number;
  height: number;
  alt: string;
}[];

/** Devuelve solo las piezas pedidas: cada tarjeta carga lo que muestra. */
export function piezas(...ids: PiezaId[]) {
  return ids
    .map((id) => PIEZAS.find((s) => s.id === id))
    .filter((s): s is (typeof PIEZAS)[number] => Boolean(s));
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
  "Efectivo",
];

/**
 * Dónde se descarga la app. Publicada en Google Play (noviembre de 2026); en
 * App Store está en camino: mientras `apple` sea null su distintivo se ve,
 * pero no enlaza a ninguna parte (una URL inventada mandaría a una página que
 * no existe). Cuando Apple la publique, basta con poner aquí su URL.
 */
export const STORES = {
  available: true,
  google: "https://play.google.com/store/apps/details?id=com.plus58express.app" as string | null,
  apple: null as string | null,
  label: "Descargar",
};
