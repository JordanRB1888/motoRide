"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion";

type Props = {
  children: ReactNode;
  /** Retardo dentro de un grupo. El grupo entero no debe pasar de ~0.5 s. */
  delay?: number;
  className?: string;
  as?: "div" | "li" | "article" | "section";
};

/**
 * Entrada al aparecer en pantalla.
 *
 * Un IntersectionObserver basta: no hay que enganchar cada elemento del sitio a
 * ScrollTrigger, que es caro y solo hace falta donde el scroll controla una
 * escena. El observador se desconecta en cuanto dispara.
 *
 * Sin JS o con reduced-motion el contenido está visible desde el principio.
 */
export default function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.style.opacity = "1";
      el.style.transform = "none";
      return;
    }

    el.style.opacity = "0";
    el.style.transform = "translate3d(0,22px,0)";
    el.style.transition = `opacity .7s cubic-bezier(.16,1,.3,1) ${delay}s, transform .8s cubic-bezier(.16,1,.3,1) ${delay}s`;

    const mostrar = () => {
      el.style.opacity = "1";
      el.style.transform = "none";
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        mostrar();
        io.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );
    io.observe(el);

    // Red de seguridad: ningún contenido puede quedarse invisible porque el
    // observador no llegue a disparar (pestaña en segundo plano, captura
    // automatizada, tiempo congelado). Pasado el margen, se muestra igual.
    const red = window.setTimeout(() => {
      mostrar();
      io.disconnect();
    }, 1600);

    return () => {
      window.clearTimeout(red);
      io.disconnect();
    };
  }, [delay]);

  return (
    // @ts-expect-error — el ref se estrecha al elemento concreto en tiempo de ejecución
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
