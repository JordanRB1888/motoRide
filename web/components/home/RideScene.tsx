"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import InteractivePhone from "@/components/phone/InteractivePhone";
import { PHONE_SCREENS, HOW_IT_WORKS } from "@/lib/content";
import { EASE, prefersReducedMotion } from "@/lib/motion";

/** Trazado de la carrera. Serpentea como una calle, no como un arco decorativo. */
const ROUTE =
  "M 148 690 C 150 600, 236 566, 330 560 C 448 552, 470 470, 462 386 C 456 306, 520 262, 616 258 C 742 252, 786 300, 844 246 C 892 202, 960 196, 1046 206";

/**
 * La carrera, contada por el scroll.
 *
 * Sigue la máquina de estados real del backend —
 * DRAFT → SEARCHING → DRIVER_ASSIGNED → DRIVER_EN_ROUTE → COMPLETED —
 * de modo que lo que se ve es lo que el producto hace, no una ficción.
 *
 * Un solo plano continuo: el teléfono nunca se va, la cámara viaja alrededor.
 */
export default function RideScene() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const q = gsap.utils.selector(el);

    // Sin motion: la escena se queda en su estado final, legible y completa.
    if (prefersReducedMotion()) {
      gsap.set(q("[data-route-line]"), { strokeDashoffset: 0 });
      gsap.set(q("[data-step]"), { autoAlpha: 1, y: 0 });
      gsap.set(q("[data-phone-screen]"), { autoAlpha: 0 });
      gsap.set(q('[data-phone-screen="home"]'), { autoAlpha: 1 });
      gsap.set(q("[data-rider]"), { autoAlpha: 1 });
      return;
    }

    gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

    const ctx = gsap.context(() => {
      const line = q("[data-route-line]")[0] as unknown as SVGPathElement;
      const len = line.getTotalLength();
      gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
      gsap.set(q("[data-step]"), { autoAlpha: 0, y: 26 });
      gsap.set(q("[data-rider]"), { autoAlpha: 0 });
      gsap.set(q("[data-pin-end]"), { autoAlpha: 0, scale: 0 });
      gsap.set(q("[data-pulse]"), { autoAlpha: 0, scale: 0.2 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.8,
        },
        defaults: { ease: "none" },
      });

      // El paso saliente se va ANTES de que entre el siguiente: dos titulares
      // superpuestos son ilegibles, por muy suave que sea el cruce.
      const show = (i: number, at: number) => {
        if (i > 0) {
          tl.to(q(`[data-step="${i - 1}"]`), { autoAlpha: 0, y: -24, duration: 0.035, ease: EASE.in }, at - 0.055);
        }
        tl.fromTo(
          q(`[data-step="${i}"]`),
          { autoAlpha: 0, y: 26 },
          { autoAlpha: 1, y: 0, duration: 0.05, ease: EASE.out, immediateRender: false },
          at,
        );
      };

      const screen = (id: string, at: number) => {
        tl.to(q("[data-phone-screen]"), { autoAlpha: 0, duration: 0.03 }, at);
        tl.to(q(`[data-phone-screen="${id}"]`), { autoAlpha: 1, duration: 0.04 }, at);
      };

      /* 1 · DRAFT — el origen se marca y el mapa se abre */
      show(0, 0.02);
      tl.fromTo(q("[data-map]"), { scale: 0.82, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.18 }, 0);
      tl.fromTo(q("[data-phone-tilt]"), { rotateY: -22, rotateX: 6, scale: 0.92 }, { rotateY: -9, rotateX: 2, scale: 1, duration: 0.24 }, 0);
      tl.to(q("[data-phone-glare]"), { xPercent: 16, duration: 0.24 }, 0);

      /* 2 · SEARCHING — el pulso sale a buscar */
      show(1, 0.22);
      screen("home", 0.22);
      tl.fromTo(q("[data-pulse]"), { scale: 0.2, autoAlpha: 0.85 }, { scale: 1, autoAlpha: 0, duration: 0.16 }, 0.22);

      /* 3 · DRIVER_ASSIGNED — alguien la toma */
      show(2, 0.4);
      screen("driver", 0.4);
      tl.to(q("[data-pin-end]"), { autoAlpha: 1, scale: 1, duration: 0.06, ease: EASE.settle }, 0.42);
      tl.to(q("[data-rider]"), { autoAlpha: 1, duration: 0.05 }, 0.44);

      /* 4 · IN_TRIP — la ruta se dibuja y la moto la recorre */
      show(3, 0.56);
      tl.to(line, { strokeDashoffset: 0, duration: 0.3 }, 0.5);
      tl.to(
        q("[data-rider]"),
        {
          motionPath: { path: line, align: line, alignOrigin: [0.5, 0.5], autoRotate: false },
          duration: 0.3,
        },
        0.5,
      );
      tl.to(q("[data-phone-tilt]"), { rotateY: 8, scale: 1.04, duration: 0.3 }, 0.5);
      tl.to(q("[data-phone-glare]"), { xPercent: -14, duration: 0.3 }, 0.5);

      /* 5 · COMPLETED — llegó */
      show(4, 0.84);
      screen("home", 0.84);
      tl.to(q("[data-phone-tilt]"), { rotateY: 0, rotateX: 0, scale: 1, duration: 0.14 }, 0.84);
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      aria-labelledby="carrera-titulo"
      className="relative bg-ink-950"
      style={{ height: "440vh" }}
    >
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        {/* Mapa: la ciudad como trazado, no como textura */}
        <div data-map aria-hidden className="absolute inset-0">
          <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <defs>
              <linearGradient id="rs-route" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#FCB000" stopOpacity=".35" />
                <stop offset="55%" stopColor="#FCB000" stopOpacity=".9" />
                <stop offset="100%" stopColor="#FFC633" />
              </linearGradient>
              <filter id="rs-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="7" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Manzanas */}
            <g stroke="#ffffff" strokeOpacity="0.055" strokeWidth="1.2" fill="none">
              {Array.from({ length: 13 }).map((_, i) => (
                <line key={`h${i}`} x1="0" y1={i * 66} x2="1200" y2={i * 66} />
              ))}
              {Array.from({ length: 19 }).map((_, i) => (
                <line key={`v${i}`} x1={i * 66} y1="0" x2={i * 66} y2="800" />
              ))}
            </g>
            {/* Avenidas */}
            <g stroke="#ffffff" strokeOpacity="0.1" strokeWidth="3.4" fill="none">
              <line x1="0" y1="396" x2="1200" y2="396" />
              <line x1="462" y1="0" x2="462" y2="800" />
              <line x1="844" y1="0" x2="844" y2="800" />
            </g>

            {/* El trazado de la carrera */}
            <path d={ROUTE} fill="none" stroke="#FCB000" strokeOpacity="0.12" strokeWidth="5" strokeLinecap="round" />
            <path
              data-route-line
              d={ROUTE}
              fill="none"
              stroke="url(#rs-route)"
              strokeWidth="5"
              strokeLinecap="round"
              filter="url(#rs-glow)"
            />

            {/* Origen, pulso de búsqueda y destino */}
            <circle cx="148" cy="690" r="9" fill="#FCB000" />
            <circle cx="148" cy="690" r="3.4" fill="#0B0B0C" />
            <circle data-pulse cx="148" cy="690" r="150" fill="none" stroke="#FCB000" strokeWidth="2.5" />
            <g data-pin-end style={{ transformOrigin: "1046px 206px" }}>
              <circle cx="1046" cy="206" r="18" fill="#FCB000" fillOpacity=".16" />
              <circle cx="1046" cy="206" r="9" fill="#FCB000" />
              <circle cx="1046" cy="206" r="3.4" fill="#0B0B0C" />
            </g>

            {/* El conductor, recorriendo el trazado */}
            <g data-rider>
              <circle r="17" fill="#FCB000" fillOpacity=".2" />
              <circle r="8.5" fill="#FCB000" />
            </g>
          </svg>

          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(110% 70% at 30% 60%, rgba(8,8,10,0) 20%, rgba(8,8,10,.86) 78%)",
            }}
          />
        </div>

        {/* Palabra + teléfono */}
        <div className="relative mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-10 px-[var(--shell-x)] lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative min-h-[280px] max-w-[540px] sm:min-h-[240px]">
            <h2 id="carrera-titulo" className="sr-only">
              Cómo funciona una carrera en +58Express
            </h2>

            {HOW_IT_WORKS.map((paso, i) => (
              <div key={paso.state} data-step={i} className="absolute inset-x-0 top-0">
                <span className="tabular text-[13px] font-bold uppercase tracking-[0.22em] text-signal">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="display mt-3 text-[clamp(2.4rem,6vw,4rem)] text-paper">
                  {paso.title}
                </h3>
                <p className="prose-measure mt-4 text-[17px] leading-relaxed text-paper-dim">
                  {paso.body}
                </p>
              </div>
            ))}
          </div>

          <div className="hidden justify-end lg:flex">
            <div className="scale-[0.84] xl:scale-95">
              <InteractivePhone screens={PHONE_SCREENS} initialScreen="home" width={310} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
