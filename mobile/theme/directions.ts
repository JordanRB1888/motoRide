/**
 * Las tres direcciones visuales.
 *
 * QUÉ VARÍA Y QUÉ NO
 *
 * Las tres comparten marca, estructura, contenido y componentes. Lo que cambia
 * es el CARÁCTER: cuánto aire hay, cuánto amarillo se ve, cuán marcadas son las
 * superficies, qué tan redondo es todo.
 *
 * Eso es deliberado. Si cada dirección tuviera pantallas distintas, comparar
 * sería imposible: se estaría eligiendo entre contenidos, no entre estéticas.
 * Aquí los mismos datos se pintan de tres maneras.
 *
 * SOBRE LAS REFERENCIAS
 *
 * A se inspira en la claridad de Cabify y B en la eficiencia de Yummy, pero
 * ninguna copia nada: no hay colores suyos, ni sus proporciones, ni sus
 * componentes. Lo que se toma es una IDEA sobre cómo tratar el espacio y la
 * densidad, que es lo que se puede aprender de una aplicación buena sin
 * calcarla.
 *
 * C es la propuesta del equipo: la identidad propia de +58express.
 */

import { AMARILLO, ESPACIO, ESTADO, GRAFITO, TEXTO, AREA_TACTIL_MINIMA } from './primitives';

export const DIRECCIONES = ['A', 'B', 'C', 'C2'] as const;
export type ClaveDeDireccion = (typeof DIRECCIONES)[number];

export interface Direccion {
  readonly clave: ClaveDeDireccion;
  readonly nombre: string;
  readonly caracter: string;

  readonly color: {
    readonly fondo: string;
    readonly superficie: string;
    readonly superficieElevada: string;
    readonly borde: string;
    readonly acento: string;
    readonly acentoPresionado: string;
    readonly sobreAcento: string;
    /**
     * El amarillo que se puede LEER.
     *
     * Sobre grafito es el mismo de marca. Sobre marfil no: el `#ffd21f` como
     * texto da 1,27:1 y desaparece, así que en claro es un ámbar profundo. Ver
     * `esquemas.ts`.
     */
    readonly acentoTexto: string;
    readonly textoPrimario: string;
    readonly textoSecundario: string;
    readonly textoTenue: string;
    readonly exito: string;
    readonly aviso: string;
    readonly peligro: string;
    readonly informacion: string;
    /**
     * El velo sobre el mapa cuando algo tiene que destacar por encima.
     *
     * Cambia con el esquema: oscurecer un mapa claro y aclarar uno oscuro son
     * operaciones distintas, y usar negro en los dos deja el mapa claro sucio.
     */
    readonly veloDelMapa: string;
    /** Las manzanas del mapa. Ver `esquemas.ts`. */
    readonly fondoDelMapa: string;
    /** Las calles del mapa. Claras sobre las manzanas en los dos esquemas. */
    readonly calleDelMapa: string;
  };

  /** Cuánto aire respira la interfaz. */
  readonly ritmo: {
    readonly margenPantalla: number;
    readonly entreBloques: number;
    readonly dentroDeTarjeta: number;
    readonly entreElementos: number;
  };

  readonly radio: {
    readonly boton: number;
    readonly tarjeta: number;
    readonly campo: number;
    readonly insignia: number;
  };

  readonly texto: {
    readonly display: { readonly tamano: number; readonly alto: number; readonly peso: '700' | '800' };
    readonly titulo: { readonly tamano: number; readonly alto: number; readonly peso: '600' | '700' };
    readonly encabezado: { readonly tamano: number; readonly alto: number; readonly peso: '600' | '700' };
    readonly cuerpo: { readonly tamano: number; readonly alto: number };
    readonly etiqueta: { readonly tamano: number; readonly alto: number; readonly peso: '500' | '600' };
    readonly pie: { readonly tamano: number; readonly alto: number };
    /** Cuánto se aprieta el interletrado en los titulares. */
    readonly ajusteDeTitular: number;
  };

  readonly superficie: {
    /** `true` si las tarjetas llevan borde visible. */
    readonly conBorde: boolean;
    readonly sombra: {
      readonly shadowColor: string;
      readonly shadowOpacity: number;
      readonly shadowRadius: number;
      readonly shadowOffset: { readonly width: number; readonly height: number };
      readonly elevation: number;
    };
  };

  /** Cuánto amarillo se ve. Afecta a acentos secundarios, no al botón principal. */
  readonly presenciaDelAcento: 'reservada' | 'presente' | 'firma';
}

const SIN_SOMBRA = {
  shadowColor: 'transparent',
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0
} as const;

/**
 * A — Premium minimal.
 *
 * Mucho aire, poca cosa a la vez, la tipografía manda. El amarillo aparece
 * sólo en la acción principal: en una pantalla puede haber un único elemento
 * amarillo, y por eso se ve.
 *
 * Superficies casi planas, diferenciadas por color y no por sombra. Es lo que
 * hace que se sienta cara: no hay ruido compitiendo por atención.
 */
const PREMIUM_MINIMAL: Direccion = {
  clave: 'A',
  nombre: 'Premium Minimal',
  caracter: 'Aire, calma y tipografía. El amarillo sólo donde se decide.',
  color: {
    fondo: GRAFITO.fondo,
    superficie: GRAFITO.superficie,
    superficieElevada: GRAFITO.elevada,
    borde: GRAFITO.borde,
    acento: AMARILLO.base,
    acentoPresionado: AMARILLO.intenso,
    sobreAcento: AMARILLO.tinta,
    acentoTexto: AMARILLO.base,
    textoPrimario: TEXTO.primario,
    textoSecundario: TEXTO.secundario,
    textoTenue: TEXTO.tenue,
    exito: ESTADO.exito,
    aviso: ESTADO.aviso,
    peligro: ESTADO.peligro,
    informacion: ESTADO.informacion,
    veloDelMapa: GRAFITO.fondo,
    fondoDelMapa: GRAFITO.superficie,
    calleDelMapa: TEXTO.tenue
  },
  ritmo: {
    margenPantalla: ESPACIO['6'],
    entreBloques: ESPACIO['7'],
    dentroDeTarjeta: ESPACIO['6'],
    entreElementos: ESPACIO['4']
  },
  radio: { boton: 16, tarjeta: 20, campo: 14, insignia: 999 },
  texto: {
    display: { tamano: 34, alto: 40, peso: '700' },
    titulo: { tamano: 26, alto: 32, peso: '700' },
    encabezado: { tamano: 19, alto: 25, peso: '600' },
    cuerpo: { tamano: 16, alto: 23 },
    etiqueta: { tamano: 13, alto: 18, peso: '600' },
    pie: { tamano: 13, alto: 18 },
    ajusteDeTitular: -0.6
  },
  superficie: { conBorde: false, sombra: SIN_SOMBRA },
  presenciaDelAcento: 'reservada'
};

/**
 * B — Urban functional.
 *
 * Más información por pantalla y las acciones más a mano. Bordes visibles para
 * separar sin depender del espacio, y contraste alto — pensando en usarla al
 * sol, con una mano y con prisa.
 *
 * El amarillo aparece también en estados y selección, no sólo en el botón.
 */
const URBAN_FUNCTIONAL: Direccion = {
  clave: 'B',
  nombre: 'Urban Functional',
  caracter: 'Densa y directa. Todo a mano, alto contraste, para la calle.',
  color: {
    fondo: GRAFITO.abismo,
    superficie: GRAFITO.superficie,
    superficieElevada: GRAFITO.flotante,
    borde: GRAFITO.bordeVivo,
    acento: AMARILLO.base,
    acentoPresionado: AMARILLO.intenso,
    sobreAcento: AMARILLO.tinta,
    acentoTexto: AMARILLO.base,
    textoPrimario: '#ffffff',
    textoSecundario: TEXTO.secundario,
    textoTenue: TEXTO.tenue,
    exito: ESTADO.exito,
    aviso: ESTADO.aviso,
    peligro: ESTADO.peligro,
    informacion: ESTADO.informacion,
    veloDelMapa: GRAFITO.fondo,
    fondoDelMapa: GRAFITO.superficie,
    calleDelMapa: TEXTO.tenue
  },
  ritmo: {
    margenPantalla: ESPACIO['4'],
    entreBloques: ESPACIO['5'],
    dentroDeTarjeta: ESPACIO['4'],
    entreElementos: ESPACIO['3']
  },
  radio: { boton: 12, tarjeta: 14, campo: 10, insignia: 8 },
  texto: {
    display: { tamano: 28, alto: 34, peso: '800' },
    titulo: { tamano: 22, alto: 28, peso: '700' },
    encabezado: { tamano: 17, alto: 23, peso: '700' },
    cuerpo: { tamano: 15, alto: 21 },
    etiqueta: { tamano: 12, alto: 16, peso: '600' },
    pie: { tamano: 12, alto: 17 },
    ajusteDeTitular: -0.2
  },
  superficie: {
    conBorde: true,
    sombra: SIN_SOMBRA
  },
  presenciaDelAcento: 'presente'
};

/**
 * C — +58 Signature. LA RECOMENDACIÓN.
 *
 * Toma el aire de A y la eficiencia de B, y añade lo que ninguna de las dos
 * tiene: una decisión de identidad propia.
 *
 * Esa decisión es el **filo amarillo**. En vez de repartir amarillo por toda la
 * pantalla o esconderlo en un botón, aparece como una línea vertical fina que
 * marca lo que importa —la tarjeta activa, el estado en curso, la opción
 * elegida—. Se reconoce de un vistazo, funciona a pleno sol, no cansa de noche
 * y no se parece a ninguna de las dos referencias.
 *
 * El fondo es un punto más profundo que A, las superficies suben un escalón, y
 * la tipografía va apretada en los titulares: rápido y tecnológico sin
 * gritarlo.
 */
const SIGNATURE: Direccion = {
  clave: 'C',
  nombre: '+58 Signature',
  caracter: 'Grafito profundo y filo amarillo. Identidad propia: rápida y precisa.',
  color: {
    fondo: '#0b0a09',
    superficie: '#15140f',
    superficieElevada: '#1f1d18',
    borde: '#2a2721',
    acento: AMARILLO.base,
    acentoPresionado: AMARILLO.vivo,
    sobreAcento: AMARILLO.tinta,
    acentoTexto: AMARILLO.base,
    textoPrimario: '#faf9f6',
    textoSecundario: '#adaaa2',
    textoTenue: TEXTO.tenue,
    exito: ESTADO.exito,
    aviso: ESTADO.aviso,
    peligro: ESTADO.peligro,
    informacion: ESTADO.informacion,
    veloDelMapa: GRAFITO.fondo,
    fondoDelMapa: GRAFITO.superficie,
    calleDelMapa: TEXTO.tenue
  },
  ritmo: {
    margenPantalla: ESPACIO['5'],
    entreBloques: ESPACIO['6'],
    dentroDeTarjeta: ESPACIO['5'],
    entreElementos: ESPACIO['3']
  },
  radio: { boton: 14, tarjeta: 18, campo: 12, insignia: 10 },
  texto: {
    display: { tamano: 32, alto: 37, peso: '800' },
    titulo: { tamano: 24, alto: 29, peso: '700' },
    encabezado: { tamano: 18, alto: 24, peso: '700' },
    cuerpo: { tamano: 16, alto: 22 },
    etiqueta: { tamano: 12, alto: 16, peso: '600' },
    pie: { tamano: 13, alto: 18 },
    ajusteDeTitular: -0.8
  },
  superficie: {
    conBorde: true,
    // Sombra mínima: la profundidad viene del contraste entre superficies, no
    // de manchas negras. En Android una sombra fuerte se ve sucia.
    sombra: {
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4
    }
  },
  presenciaDelAcento: 'firma'
};

/**
 * C2 — +58 Signature Refined. LA RECOMENDACIÓN ACTUAL.
 *
 * No es una dirección nueva: es C después de mirarla en pantallas reales, con
 * mapa a sangre y los activos de marca dentro.
 *
 * QUÉ SE MANTIENE DE C
 *
 * Todo lo que le da identidad: el grafito profundo, el amarillo `#ffd21f`, el
 * blanco cálido, el filo amarillo, los titulares apretados. Los colores son
 * exactamente los mismos, valor por valor. Cambiar la paleta habría sido
 * empezar de cero, y C ya estaba bien.
 *
 * QUÉ SE TOMA DE A
 *
 * Aire, pero no en cualquier sitio. Con el mapa ocupando la pantalla, el alto
 * vertical se vuelve caro: cada punto que gana un margen exterior se lo quita
 * al mapa. Así que el margen de pantalla y la separación entre bloques se
 * quedan como en C, y el aire entra DENTRO de las superficies —de 20 a 24 en
 * el relleno de tarjeta, de 12 a 16 entre elementos—. Es donde se nota la
 * sensación de caro, y no cuesta mapa.
 *
 * QUÉ SE TOMA DE B
 *
 * Sólo legibilidad. Las etiquetas suben de 12 a 13 puntos: son las que se leen
 * de reojo, en moto, con sol, y un punto más las salva. Nada más de B: su
 * densidad y su borde amarillo se quedan en B.
 *
 * LO QUE DE VERDAD CAMBIA: FUERA LOS BORDES
 *
 * `conBorde` pasa a `false`, y es el cambio con más consecuencias. Cada tarjeta
 * con borde dibuja un rectángulo, y siete rectángulos apilados son la «sopa de
 * tarjetas» que había que quitar. Sin ellos las superficies se separan por
 * color, como en A, y queda una sola línea con derecho a llamar la atención: la
 * amarilla. El filo sólo funciona como firma si no compite con un contorno gris
 * en cada elemento de la pantalla.
 */
const SIGNATURE_REFINED: Direccion = {
  clave: 'C2',
  nombre: '+58 Signature Refined',
  caracter: 'C con el aire de A y la claridad de B. Mapa primero, filo amarillo con disciplina.',
  // La identidad no se toca: mismos valores que C, uno por uno.
  color: { ...SIGNATURE.color },
  ritmo: {
    margenPantalla: ESPACIO['5'],
    entreBloques: ESPACIO['6'],
    // El aire entra aquí dentro, que es donde se nota y no le cuesta mapa.
    dentroDeTarjeta: ESPACIO['6'],
    entreElementos: ESPACIO['4']
  },
  radio: { boton: 14, tarjeta: 20, campo: 12, insignia: 10 },
  texto: {
    display: { tamano: 32, alto: 37, peso: '800' },
    titulo: { tamano: 24, alto: 29, peso: '700' },
    encabezado: { tamano: 18, alto: 24, peso: '700' },
    cuerpo: { tamano: 16, alto: 22 },
    // Un punto más que C: son las que se leen de reojo y en movimiento.
    etiqueta: { tamano: 13, alto: 17, peso: '600' },
    pie: { tamano: 13, alto: 18 },
    ajusteDeTitular: -0.8
  },
  superficie: {
    // Sin borde. Ver arriba: es lo que desactiva la sopa de tarjetas.
    conBorde: false,
    sombra: {
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4
    }
  },
  presenciaDelAcento: 'firma'
};

export const CATALOGO: Readonly<Record<ClaveDeDireccion, Direccion>> = Object.freeze({
  A: PREMIUM_MINIMAL,
  B: URBAN_FUNCTIONAL,
  C: SIGNATURE,
  C2: SIGNATURE_REFINED
});

/**
 * La que el equipo propone. La decisión final es del dueño.
 *
 * A, B y C siguen en el catálogo: se comparan con C2 en el laboratorio y no se
 * retiran hasta que el dueño decida. Borrar la evidencia antes de la decisión
 * dejaría sin nada con qué contrastar.
 */
export const DIRECCION_RECOMENDADA: ClaveDeDireccion = 'C2';

export { AREA_TACTIL_MINIMA };
