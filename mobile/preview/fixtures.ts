/**
 * Datos de demostración del laboratorio visual.
 *
 * OBVIAMENTE FICTICIOS, A PROPÓSITO
 *
 * Nada de nombres, teléfonos o documentos que puedan confundirse con datos
 * reales de alguien. Si una captura de estas acaba en una presentación, en un
 * chat o en un informe, no debe parecerse a la información de una persona.
 *
 * ESTO NO PUEDE LLEGAR A LA APLICACIÓN REAL
 *
 * Vive en `preview/`, sólo lo importan las pantallas del laboratorio, y el
 * laboratorio sólo existe en desarrollo. Hay una prueba que comprueba que
 * ningún fichero de `app/`, `services/` o `domain/` importa de aquí: unos datos
 * de demostración que acaban como respaldo en tiempo de ejecución son la forma
 * más silenciosa de enseñar información falsa como si fuera verdadera.
 */

export const PASAJERA_DEMO = {
  nombre: 'Demo Pasajera',
  iniciales: 'DP',
  zona: 'Zona demo · Maracaibo'
} as const;

export const CONDUCTOR_DEMO = {
  nombre: 'Demo Conductor',
  iniciales: 'DC',
  vehiculo: 'Moto demo · Placa DEMO-000',
  zona: 'Zona demo · Maracaibo'
} as const;

/**
 * La tasa del BCV.
 *
 * El dato es REAL en la aplicación: el servidor la guarda en su configuración
 * de precios (`bcvRate`) y la devuelve con las tarifas, así que enseñarla en la
 * cabecera no es inventar una funcionalidad. Esta cifra concreta sí es de
 * demostración, y por eso vive aquí y no en ningún sitio del que pueda salir a
 * la aplicación real.
 */
export const TASA_DEMO = {
  etiqueta: 'Tasa BCV',
  valor: 'Bs. 000,00',
  nota: 'Cifra de ejemplo'
} as const;

/**
 * Los sitios de siempre.
 *
 * «Trabajo» va sin dirección a propósito: hace falta ver cómo se muestra un
 * atajo que existe pero está sin configurar, que es el estado en el que va a
 * estar la mayoría de la gente el primer día.
 */
export const LUGARES_DEMO = [
  { clave: 'casa', icono: 'inicio' as const, nombre: 'Casa', direccion: 'Dirección de ejemplo' },
  { clave: 'trabajo', icono: 'maletin' as const, nombre: 'Trabajo' }
] as const;

export const SERVICIOS_DEMO = [
  {
    clave: 'mototaxi',
    icono: 'moto' as const,
    titulo: 'Mototaxi',
    detalle: 'Lo más rápido en ciudad',
    // A cero a propósito: la tarifa la calcula el servidor con su
    // configuración y la tasa del BCV. Una cifra creíble aquí acabaría citada
    // como si fuera el precio real.
    precio: '$0,00',
    disponible: true
  },
  {
    clave: 'seguro',
    icono: 'escudo' as const,
    titulo: 'Transporte Seguro',
    detalle: 'Traslados programados',
    precio: 'Plan',
    disponible: true
  }
] as const;

/**
 * Los servicios del inicio.
 *
 * LOS QUE NO EXISTEN LO DICEN
 *
 * Hoy +58express hace viajes. Comida, mercado, envíos y compraventa NO están
 * construidos: no hay backend, ni comercios dados de alta, ni forma de cobrar.
 * Salen en la rejilla porque el dueño quiere la estructura montada, y llevan
 * `listo: false`, que en pantalla es una etiqueta de PRONTO y un botón que no
 * navega a ninguna parte.
 *
 * Un botón de «Comida» que no lleva a nada, sin decirlo, es una promesa rota a
 * la primera pulsación —y de las que las tiendas rechazan—.
 *
 * VIAJES OCUPA EL ANCHO ENTERO
 *
 * No es una casualidad de maquetación. Es lo único que la aplicación hace hoy,
 * y una rejilla de seis casillas iguales diría que +58express es seis cosas a
 * medias en vez de una cosa bien.
 *
 * CADA UNA LLEVA SU ILUSTRACIÓN
 *
 * `arte` nombra el fichero de `assets/marca/`, sin extensión. Las ilustraciones
 * las encargó el dueño y hablan el mismo idioma que los avatares de rol. Si
 * una falta, la casilla cae al icono y no se rompe nada.
 */
export const SERVICIOS_DE_INICIO = [
  {
    clave: 'viajes',
    titulo: 'Viajes',
    detalle: 'Tu moto, a un toque',
    icono: 'moto' as const,
    arte: 'moto',
    listo: true,
    ancho: true
  },
  {
    clave: 'comercios',
    titulo: 'Comercios',
    detalle: 'Aliados cerca de ti',
    icono: 'maletin' as const,
    arte: 'servicio-comercios',
    listo: true,
    ancho: false
  },
  {
    clave: 'seguro',
    titulo: 'Transporte Seguro',
    detalle: 'Traslados programados',
    icono: 'escudo' as const,
    arte: 'servicio-transporte-seguro',
    listo: true,
    ancho: false
  },
  {
    clave: 'envios',
    titulo: 'Envíos',
    detalle: 'Manda un paquete',
    icono: 'maletin' as const,
    arte: 'servicio-envios',
    listo: false,
    ancho: false
  },
  {
    clave: 'comida',
    titulo: 'Comida',
    detalle: 'Pide y te lo llevamos',
    icono: 'inicio' as const,
    arte: 'servicio-comida',
    listo: false,
    ancho: false
  },
  {
    clave: 'mercado',
    titulo: 'Mercado',
    detalle: 'Sin salir de casa',
    icono: 'viajes' as const,
    arte: 'servicio-mercado',
    listo: false,
    ancho: false
  },
  {
    clave: 'tienda',
    titulo: 'Compra y vende',
    detalle: 'Entre vecinos',
    icono: 'dolar' as const,
    arte: 'servicio-compra-vende',
    listo: false,
    ancho: false
  }
] as const;

/**
 * Las campañas del inicio.
 *
 * El espacio donde caben una promoción, un aviso de la ciudad o una campaña
 * solidaria. Van con texto de ejemplo y SIN CIFRAS: una recaudación inventada
 * en una captura se lee como dinero recaudado de verdad, y eso con una causa
 * real sería grave.
 *
 * DOS FORMAS, Y LAS DOS HACEN FALTA
 *
 * Con `banner`, la campaña ES una imagen: el anunciante entrega su arte con su
 * texto dentro y la aplicación sólo lo enmarca. Es lo que quiere un comercio
 * que paga, y lo que va a llegar del panel administrativo.
 *
 * Sin `banner`, se compone con los tokens —rótulo, título, detalle—. Es lo que
 * usa +58express para lo suyo, donde una imagen sería un estorbo.
 *
 * Que las dos convivan no es indecisión: son dos dueños distintos del mismo
 * hueco.
 */
export const CAMPANAS_DEMO = [
  {
    clave: 'c1',
    rotulo: 'CAMPAÑA',
    titulo: 'Espacio de campaña',
    detalle: 'Aquí va una promoción, un aviso de la ciudad o una causa.',
    accion: 'Ver más',
    tono: 'acento' as const,
    // El nombre del fichero en `assets/marca/`, sin extensión. Mientras no
    // exista, la campaña se compone con texto y no se rompe nada.
    banner: 'campana-repuestos'
  },
  {
    clave: 'c2',
    rotulo: 'AVISO',
    titulo: 'Espacio de aviso',
    detalle: 'Para lo que +58express necesite contar ese día.',
    accion: 'Leer',
    tono: 'neutro' as const,
    banner: undefined
  }
] as const;

/**
 * Los comercios aliados.
 *
 * QUÉ SON Y QUÉ NO SON
 *
 * Son ESPACIOS PAGADOS. +58express cobra por aparecer aquí, no por lo que se
 * venda: no hay catálogo, ni carrito, ni cobro, ni pedido dentro de la
 * aplicación. El botón del comercio lleva FUERA —a su WhatsApp o a su web— y
 * lo que pase a partir de ahí es entre la persona y el negocio.
 *
 * Eso obliga a dos cosas en la pantalla, y ninguna es opcional:
 *
 *   1. que se vea que es publicidad, porque lo es y porque las tiendas lo
 *      exigen;
 *   2. que se vea que el pedido NO lo atiende +58express, para que nadie
 *      reclame aquí un pollo que llegó frío.
 *
 * SIN LOGOTIPOS TODAVÍA
 *
 * Cada comercio se dibuja con su inicial en un disco. No es un apaño: es el
 * hueco preparado para el logotipo de verdad, y mientras no lo haya, una
 * inicial es honesta donde un icono de categoría prestado mentiría —ya pasó
 * con la casa que resultaba ser la pestaña de inicio—.
 */
export const ALIADOS_DEMO = [
  {
    clave: 'a1',
    nombre: 'Sabor de ejemplo',
    inicial: 'S',
    categoria: 'Comida',
    gancho: 'Almuerzos y parrilla',
    zona: 'Zona demo · Maracaibo',
    salida: 'whatsapp' as const,
    destacado: true
  },
  {
    clave: 'a2',
    nombre: 'Farmacia de ejemplo',
    inicial: 'F',
    categoria: 'Salud',
    gancho: 'Medicinas y cuidado personal',
    zona: 'Zona demo · Maracaibo',
    salida: 'whatsapp' as const,
    destacado: false
  },
  {
    clave: 'a3',
    nombre: 'Repuestos de ejemplo',
    inicial: 'R',
    categoria: 'Moto',
    gancho: 'Cauchos, aceite y cascos',
    zona: 'Zona demo · Maracaibo',
    salida: 'whatsapp' as const,
    destacado: false
  },
  {
    clave: 'a4',
    nombre: 'Mercado de ejemplo',
    inicial: 'M',
    categoria: 'Mercado',
    gancho: 'Víveres y verduras',
    zona: 'Zona demo · Maracaibo',
    salida: 'web' as const,
    destacado: false
  },
  {
    clave: 'a5',
    nombre: 'Panadería de ejemplo',
    inicial: 'P',
    categoria: 'Panadería',
    gancho: 'Pan y pastelería',
    zona: 'Zona demo · Maracaibo',
    salida: 'whatsapp' as const,
    destacado: false
  }
] as const;

/** Las categorías que existen, sacadas de los propios comercios. */
export const CATEGORIAS_DEMO = [
  'Todos',
  ...new Set(ALIADOS_DEMO.map(aliado => aliado.categoria))
] as const;

export const DESTINOS_RECIENTES_DEMO = [
  { clave: 'd1', titulo: 'Destino de ejemplo 1', detalle: 'Guardado como «Casa»' },
  { clave: 'd2', titulo: 'Destino de ejemplo 2', detalle: 'Guardado como «Trabajo»' },
  { clave: 'd3', titulo: 'Destino de ejemplo 3', detalle: 'Visitado hace 2 días' }
] as const;

export const VIAJE_DEMO = {
  estado: 'En camino',
  eta: '4 min',
  conductor: 'Demo Conductor',
  iniciales: 'DC',
  vehiculo: 'Moto demo · DEMO-000',
  valoracion: '4,9',
  origen: 'Punto de recogida de ejemplo',
  destino: 'Destino de ejemplo 1',
  precio: '$0,00'
} as const;

/**
 * El historial de viajes.
 *
 * Sin importes. La tarifa la calcula el servidor, y un historial con cifras
 * inventadas es la clase de captura que acaba en una reunión citada como si
 * fueran las cuentas de alguien.
 */
export const HISTORIAL_DEMO = [
  { clave: 'h1', fecha: 'Hoy · 08:14', origen: 'Punto de ejemplo A', destino: 'Destino de ejemplo 1', estado: 'Completado' },
  { clave: 'h2', fecha: 'Ayer · 19:02', origen: 'Punto de ejemplo B', destino: 'Destino de ejemplo 2', estado: 'Completado' },
  { clave: 'h3', fecha: 'Ayer · 07:41', origen: 'Punto de ejemplo A', destino: 'Destino de ejemplo 3', estado: 'Cancelado' }
] as const;

/**
 * Avisos del centro de notificaciones.
 *
 * La aplicación tiene centro de notificaciones de verdad
 * (`src/components/notificationCenterModal.js`); estos son ejemplos de las
 * clases de aviso que caben, no mensajes reales de nadie.
 */
export const AVISOS_DEMO = [
  { clave: 'n1', titulo: 'Viaje completado', detalle: 'Tu viaje de ejemplo terminó bien.', cuando: 'Hace 2 h', sinLeer: true },
  { clave: 'n2', titulo: 'Transporte Seguro', detalle: 'Tu traslado programado de ejemplo es mañana.', cuando: 'Ayer', sinLeer: true },
  { clave: 'n3', titulo: 'Cuenta verificada', detalle: 'Ya puedes pedir viajes.', cuando: 'Hace 3 días', sinLeer: false }
] as const;

/** Lo que se enseña en el perfil. Nada que se parezca a los datos de nadie. */
export const PERFIL_DEMO = {
  nombre: 'Demo Pasajera',
  iniciales: 'DP',
  telefono: '+58 000 000 0000',
  correo: 'demo@ejemplo.com',
  desde: 'Miembro desde el mes de ejemplo',
  viajes: '12'
} as const;

/**
 * Los movimientos de la cuenta operativa del conductor.
 *
 * Los cuatro tipos son los que la aplicación ya maneja
 * (`src/pages/driver/earnings.js`): lo que gana por un viaje, lo que le
 * descuenta la plataforma, lo que recarga y lo que se le liquida.
 *
 * Todos los importes van a cero. La cartera está apagada en el servidor, y una
 * cifra creíble en un movimiento se lee como dinero de alguien.
 */
export const MOVIMIENTOS_DEMO = [
  { clave: 'v1', tipo: 'GANANCIA' as const, titulo: 'Ganancia acreditada', detalle: 'Efectivo · Viaje de ejemplo', cuando: 'Hoy · 08:20', importe: '+$0,00', estado: 'Confirmado' },
  { clave: 'v2', tipo: 'COMISION' as const, titulo: 'Comisión +58Express', detalle: 'Viaje de ejemplo', cuando: 'Hoy · 08:20', importe: '−$0,00', estado: 'Aplicada' },
  { clave: 'v3', tipo: 'RECARGA' as const, titulo: 'Recarga', detalle: 'Pago Móvil · Ref. de ejemplo', cuando: 'Ayer · 17:05', importe: '+$0,00', estado: 'Verificada' },
  { clave: 'v4', tipo: 'LIQUIDACION' as const, titulo: 'Liquidación', detalle: 'Transferencia de ejemplo', cuando: 'Hace 3 días', importe: '−$0,00', estado: 'Pagada' }
] as const;

/**
 * El contexto de ubicación del conductor.
 *
 * No hay GPS todavía: estos valores llegan de aquí. Lo que existe en el código
 * es el hueco con la forma que tendrá cuando haya ubicación real.
 */
/**
 * La cabecera del saldo, en los dos roles.
 *
 * TODAS LAS CIFRAS A CERO, Y NO ES PEREZA
 *
 * La cartera no está encendida en el servidor. Un importe creíble aquí acaba
 * citado como si fuera el saldo real de alguien —en una captura, en una
 * reunión, en una tienda de aplicaciones—, y ese es el peor sitio para que un
 * número de ejemplo se confunda con dinero.
 *
 * La tasa también va a cero por lo mismo: el dato es real en la aplicación —el
 * servidor lo guarda en su configuración de precios— pero ESTA cifra no.
 */
export const SALDO_DEMO = {
  pasajera: {
    rotulo: 'Saldo disponible',
    importe: '$0,00',
    moneda: 'USD',
    equivalente: '≈ Bs. 000,00',
    recuento: '0 viajes',
    nota: 'La cartera todavía no está encendida en el servidor: las cifras se muestran en cero a propósito.'
  },
  conductor: {
    rotulo: 'Balance disponible real',
    importe: '$0,00',
    moneda: 'USD',
    equivalente: '≈ Bs. 000,00',
    recuento: '0 viajes',
    nota: 'La cartera todavía no está encendida en el servidor: las cifras se muestran en cero a propósito.'
  }
} as const;

/**
 * Lo ganado por día, para el gráfico del conductor.
 *
 * Las alturas son de ejemplo y los importes van a cero. Se guarda la ALTURA
 * aparte del importe justamente para eso: el gráfico necesita forma para poder
 * mirarlo, y el importe no puede inventarse. El día que la cartera se encienda,
 * la altura sale del importe y este campo desaparece.
 */
export const GANANCIAS_DEMO = {
  titulo: 'Ganancia económica',
  detalle: 'Lo ganado en viajes, separado del saldo operativo',
  dias: [
    { clave: 'mar', etiqueta: 'mar', importe: '$0,00', altura: 0.56 },
    { clave: 'mie', etiqueta: 'mié', importe: '$0,00', altura: 0.04 },
    { clave: 'jue', etiqueta: 'jue', importe: '$0,00', altura: 1 },
    { clave: 'vie', etiqueta: 'vie', importe: '$0,00', altura: 0.73 },
    { clave: 'sab', etiqueta: 'sáb', importe: '$0,00', altura: 0.04 },
    { clave: 'dom', etiqueta: 'dom', importe: '$0,00', altura: 0.04 },
    { clave: 'lun', etiqueta: 'lun', importe: '$0,00', altura: 0.11 }
  ],
  nota: 'Alturas de ejemplo. Los importes los calcula el servidor.'
} as const;

/**
 * Los movimientos de la pasajera.
 *
 * Distintos de los del conductor: ella recarga y paga viajes; él cobra y se le
 * descuenta la comisión. Mezclarlos en una sola lista daría una pantalla que no
 * es de ninguno de los dos.
 */
export const MOVIMIENTOS_PASAJERA_DEMO = [
  { clave: 'p1', tipo: 'PAGO' as const, titulo: 'Viaje pagado', detalle: 'Punto de ejemplo A → Destino de ejemplo 1', cuando: 'Hoy · 08:14', importe: '−$0,00', estado: 'Cobrado' },
  { clave: 'p2', tipo: 'RECARGA' as const, titulo: 'Recarga', detalle: 'Pago Móvil · Ref. de ejemplo', cuando: 'Ayer · 19:40', importe: '+$0,00', estado: 'Verificada' },
  { clave: 'p3', tipo: 'DEVOLUCION' as const, titulo: 'Devolución', detalle: 'Viaje cancelado de ejemplo', cuando: 'Ayer · 07:41', importe: '+$0,00', estado: 'Aplicada' }
] as const;

export const CONTEXTO_DEMO = {
  zona: 'Zona demo · Maracaibo',
  cerca: 'un punto de ejemplo',
  via: 'Vía de ejemplo'
} as const;

/**
 * Cifras de la jornada del conductor.
 *
 * Son PREVIEW y no salen de ninguna API. La cartera y los retiros están
 * apagados en el backend, y enseñar una cifra como si fuera real sería
 * exactamente lo que no debe hacerse.
 */
export const JORNADA_DEMO = {
  viajes: '8',
  horas: '5 h 20 m',
  resumen: '—',
  nota: 'Cifras de ejemplo: la cartera todavía no está conectada.'
} as const;
