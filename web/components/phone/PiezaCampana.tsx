"use client";

import Image from "next/image";
import { forwardRef } from "react";
import type { PiezaId } from "@/lib/content";

export type Pieza = {
  /** Identificador estable: las escenas de scroll seleccionan por él. */
  id: PiezaId;
  src: string;
  alt: string;
  width: number;
  height: number;
};

type Props = {
  piezas: Pieza[];
  /** Pieza visible en el render inicial. El resto se cruzan con GSAP. */
  inicial?: PiezaId;
  /**
   * Modo controlado: el componente cruza las piezas por CSS. Se usa donde
   * manda React (la lista de servicios); donde manda GSAP —la escena de
   * scroll— se omite, para que no compitan dos motores por la misma opacidad.
   */
  activa?: PiezaId;
  /** Ancho de la tarjeta en píxeles CSS. */
  width?: number;
  className?: string;
  priority?: boolean;
};

/**
 * Pieza de campaña de +58Express enmarcada como tarjeta.
 *
 * Sustituye al teléfono dibujado por CSS: las piezas ya traen sus propios
 * teléfonos con pantallas reales de la app, y meterlas dentro de otro teléfono
 * las encogía hasta que el texto no se leía.
 *
 * Conserva los ganchos del teléfono para que las escenas sigan funcionando:
 *   [data-phone-tilt]   — el conjunto
 *   [data-phone-screen] — cruce entre piezas
 *
 * La proporción la manda la primera pieza; las demás se recortan muy poco
 * (todas rondan 2:3) con `object-cover`.
 */
const PiezaCampana = forwardRef<HTMLDivElement, Props>(function PiezaCampana(
  { piezas, inicial, activa, width = 320, className = "", priority = false },
  ref,
) {
  const controlado = activa !== undefined;
  const visible = activa ?? inicial ?? piezas[0]?.id;
  const base = piezas[0];
  const height = base ? Math.round((width * base.height) / base.width) : width;

  return (
    <div
      ref={ref}
      className={`relative select-none ${className}`}
      style={{ perspective: "1400px", width, height }}
    >
      <div
        data-phone-tilt
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
      >
        {/* Sombra de contacto: desplazada y difusa, nunca un halo centrado */}
        <div
          aria-hidden
          className="absolute left-1/2 top-[100%] h-10 w-[78%] -translate-x-1/2 rounded-[50%] blur-2xl"
          style={{ background: "rgba(0,0,0,.72)" }}
        />
        <div
          className="relative h-full w-full overflow-hidden rounded-[22px]"
          style={{
            background: "#0d0f12",
            boxShadow:
              "0 42px 90px -28px rgba(0,0,0,.92), 0 8px 24px -8px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08)",
          }}
        >
          {piezas.map((pieza) => (
            <div
              key={pieza.id}
              data-phone-screen={pieza.id}
              className="absolute inset-0"
              style={{
                opacity: pieza.id === visible ? 1 : 0,
                /* `visibility` saca del árbol de accesibilidad las piezas
                   ocultas; es lo que GSAP mueve con autoAlpha. */
                visibility: pieza.id === visible ? "visible" : "hidden",
                transition: controlado ? "opacity .42s ease" : undefined,
              }}
            >
              <Image
                src={pieza.src}
                alt={pieza.alt}
                fill
                quality={90}
                sizes={`${Math.round(width * 1.25)}px`}
                className="object-cover object-center"
                priority={priority && pieza.id === visible}
              />
            </div>
          ))}
          {/* Borde interior por encima de la imagen: la separa del fondo oscuro */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[22px]"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
          />
        </div>
      </div>
    </div>
  );
});

export default PiezaCampana;
