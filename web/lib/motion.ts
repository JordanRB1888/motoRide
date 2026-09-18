/**
 * Tokens de movimiento de +58Express.
 *
 * Un solo temperamento en todo el sitio: salidas exponenciales, nada de rebotes.
 * El movimiento describe cómo se comporta un vehículo con masa — arranca con
 * decisión y se asienta — no cómo rebota una pelota.
 */

export const DUR = {
  /** Micro-respuesta a una acción del usuario (hover, press). */
  tap: 0.16,
  /** Entrada de un elemento suelto. */
  enter: 0.62,
  /** Movimiento de un grupo o de la cámara. */
  travel: 0.9,
  /** Recorridos largos ligados al scroll. */
  scene: 1.4,
} as const;

export const EASE = {
  /** Por defecto: aterriza sin rebotar. */
  out: "power3.out",
  /** Reposicionar algo que ya estaba en pantalla. */
  inOut: "power2.inOut",
  /** Salida de escena. */
  in: "power2.in",
  /** Acento contenido para el momento héroe. Nunca elastic ni bounce. */
  settle: "back.out(1.3)",
} as const;

/** Desfase entre hermanos: el grupo debe leerse como un gesto, no como una lista. */
export const STAGGER = { tight: 0.05, normal: 0.08, loose: 0.12 } as const;

/** El grupo entero no debe tardar más de esto en llegar. */
export const MAX_GROUP_STAGGER = 0.5;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Rango de scroll de una escena, en la sintaxis de ScrollTrigger.
 * Centralizado para que las escenas encadenen sin solaparse por accidente.
 */
export const SCENE = {
  start: "top top",
  end: "+=140%",
} as const;
