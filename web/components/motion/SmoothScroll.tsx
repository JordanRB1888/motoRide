"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Scroll suave acoplado a ScrollTrigger.
 *
 * No secuestra el scroll: no cambia la dirección ni bloquea al usuario, solo
 * interpola la posición. Con `prefers-reduced-motion` no se monta en absoluto y
 * el navegador conserva su scroll nativo, incluidos los anclas y el teclado.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      // El gesto táctil nativo ya es bueno: interferirlo empeora el móvil.
      syncTouch: false,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Los anclas deben seguir funcionando con scroll interpolado.
    const onAnchorClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.(
        'a[href^="#"]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const id = anchor.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id) as HTMLElement | null;
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: -80 });
      /* Cancelar el salto nativo también cancela el movimiento del foco: sin
         esto, «Saltar al contenido» desplazaba la página pero dejaba el foco en
         el propio enlace, y el siguiente tabulador volvía al menú. */
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    };
    document.addEventListener("click", onAnchorClick);

    return () => {
      document.removeEventListener("click", onAnchorClick);
      gsap.ticker.remove(tick);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return null;
}
