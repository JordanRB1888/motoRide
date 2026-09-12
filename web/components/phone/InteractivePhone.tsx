"use client";

import Image from "next/image";
import { forwardRef } from "react";

export type PhoneScreen = {
  /** Identificador estable: las escenas de scroll seleccionan por él. */
  id: string;
  src: string;
  alt: string;
};

type Props = {
  screens: PhoneScreen[];
  /** Pantalla visible en el render inicial. El resto se cruzan con GSAP. */
  initialScreen?: string;
  /** Ancho del cuerpo del teléfono en píxeles CSS. */
  width?: number;
  className?: string;
  priority?: boolean;
};

/**
 * Teléfono en 3D por CSS.
 *
 * Es una superficie plana con grosor: `perspective` + `preserve-3d` la resuelven
 * con mejor nitidez de texto y una fracción del coste de un canvas WebGL. Las
 * capturas son pantallas reales de la app, no maquetas dibujadas.
 *
 * Las escenas animan estos ganchos:
 *   [data-phone-tilt]   — rotación y escala del conjunto
 *   [data-phone-screen] — cruce entre pantallas
 *   [data-phone-glare]  — el reflejo se desplaza al girar
 */
const InteractivePhone = forwardRef<HTMLDivElement, Props>(function InteractivePhone(
  { screens, initialScreen, width = 300, className = "", priority = false },
  ref,
) {
  const active = initialScreen ?? screens[0]?.id;
  const height = Math.round(width * 2.03);

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
          className="absolute left-1/2 top-[102%] h-10 w-[78%] -translate-x-1/2 rounded-[50%] blur-2xl"
          style={{ background: "rgba(0,0,0,.72)" }}
        />

        {/* Cuerpo */}
        <div
          className="relative h-full w-full overflow-hidden rounded-[13%/6.4%] p-[2.6%]"
          style={{
            background:
              "linear-gradient(152deg, #3a3a42 0%, #17171b 22%, #0e0e11 55%, #26262e 88%, #45454e 100%)",
            boxShadow:
              "0 42px 90px -28px rgba(0,0,0,.92), 0 8px 24px -8px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.07)",
          }}
        >
          {/* Pantalla */}
          <div
            className="relative h-full w-full overflow-hidden rounded-[11%/5.4%]"
            style={{ background: "#0b0b0c" }}
          >
            {screens.map((screen) => (
              <div
                key={screen.id}
                data-phone-screen={screen.id}
                className="absolute inset-0"
                style={{ opacity: screen.id === active ? 1 : 0 }}
              >
                <Image
                  src={screen.src}
                  alt={screen.alt}
                  fill
                  sizes={`${width}px`}
                  className="object-cover object-top"
                  priority={priority && screen.id === active}
                />
              </div>
            ))}

            {/* Isla dinámica */}
            <div
              aria-hidden
              className="absolute left-1/2 top-[1.6%] h-[3.2%] w-[30%] -translate-x-1/2 rounded-full"
              style={{ background: "#000" }}
            />

            {/* Reflejo: una banda diagonal que viaja cuando el teléfono gira */}
            <div
              aria-hidden
              data-phone-glare
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(118deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,.05) 18%, rgba(255,255,255,0) 42%, rgba(255,255,255,0) 100%)",
                mixBlendMode: "screen",
              }}
            />
          </div>
        </div>

        {/* Botones laterales */}
        <div
          aria-hidden
          className="absolute -right-[1.1%] top-[21%] h-[11%] w-[1.2%] rounded-r"
          style={{ background: "linear-gradient(90deg,#1a1a1f,#4a4a55)" }}
        />
        <div
          aria-hidden
          className="absolute -left-[1.1%] top-[17%] h-[6%] w-[1.2%] rounded-l"
          style={{ background: "linear-gradient(270deg,#1a1a1f,#4a4a55)" }}
        />
        <div
          aria-hidden
          className="absolute -left-[1.1%] top-[26%] h-[9%] w-[1.2%] rounded-l"
          style={{ background: "linear-gradient(270deg,#1a1a1f,#4a4a55)" }}
        />
      </div>
    </div>
  );
});

export default InteractivePhone;
