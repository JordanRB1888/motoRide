"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import InteractivePhone from "@/components/phone/InteractivePhone";
import { ButtonLink } from "@/components/ui/Button";
import { PHONE_SCREENS } from "@/lib/content";
import { prefersReducedMotion } from "@/lib/motion";

export default function Hero() {
  const stage = useRef<HTMLDivElement>(null);

  /* Parallax de puntero: tres planos a distinta profundidad.
     Es un acento, no un efecto — el desplazamiento máximo es de unos pocos píxeles. */
  useEffect(() => {
    const el = stage.current;
    if (!el || prefersReducedMotion()) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const loop = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      el.style.setProperty("--px", cx.toFixed(4));
      el.style.setProperty("--py", cy.toFixed(4));
      raf = Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001
        ? requestAnimationFrame(loop)
        : 0;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={stage}
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden pt-[72px]"
      style={{ ["--px" as string]: 0, ["--py" as string]: 0 }}
    >
      {/* Profundidad del fondo: un amanecer de señal, muy contenido */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 76% at 76% -12%, rgba(252,176,0,.14) 0%, rgba(252,176,0,.03) 38%, rgba(252,176,0,0) 62%)," +
            "radial-gradient(90% 60% at 12% 108%, rgba(252,176,0,.06) 0%, rgba(252,176,0,0) 58%)," +
            "linear-gradient(180deg,#0f0f12 0%,#0b0b0c 58%,#08080a 100%)",
        }}
      />

      {/* Trama urbana tenue: la ciudad como retícula, no como adorno */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.055]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          maskImage:
            "radial-gradient(120% 80% at 50% 40%, #000 20%, transparent 78%)",
        }}
      />

      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-14 px-[var(--shell-x)] py-16 lg:grid-cols-[1fr_auto] lg:gap-10 lg:py-0">
        {/* ---------------- Palabra ---------------- */}
        <div className="max-w-[640px]">
          <h1 className="display text-[clamp(3.4rem,11vw,7.2rem)] text-paper">
            Muévete.
            <br />
            Pide.
            <br />
            <span className="text-signal">Recibe.</span>
          </h1>

          <p className="prose-measure mt-7 text-[clamp(1.05rem,2.4vw,1.35rem)] leading-relaxed text-paper-dim">
            Tu ciudad, más cerca con <strong className="font-bold text-paper">+58Express</strong>.
            Pide tu moto, manda un envío o recibe lo que necesites — todo desde el
            celular, siguiendo cada paso en el mapa.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/#descargar" size="lg">
              Descargar +58Express
            </ButtonLink>
            <ButtonLink href="/conductores" size="lg" variant="outline">
              Quiero conducir
            </ButtonLink>
          </div>

          <p className="mt-6 text-sm text-paper-mute">
            Maracaibo y Municipio Mara, estado Zulia.
          </p>
        </div>

        {/* ---------------- Escena ---------------- */}
        <div className="relative flex justify-center lg:justify-end">
          <div
            className="relative"
            style={{
              transform:
                "translate3d(calc(var(--px) * -16px), calc(var(--py) * -12px), 0)",
            }}
          >
            {/* Ruta: nace fuera de cuadro y pasa por detrás del teléfono */}
            <svg
              aria-hidden
              viewBox="0 0 520 620"
              className="pointer-events-none absolute -left-[22%] top-[6%] w-[150%]"
              style={{
                transform:
                  "translate3d(calc(var(--px) * 22px), calc(var(--py) * 16px), 0)",
              }}
            >
              <path
                d="M 18 566 C 150 540, 176 420, 262 356 C 344 296, 420 300, 498 216"
                fill="none"
                stroke="#FCB000"
                strokeOpacity="0.42"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="10 12"
              />
              <circle cx="18" cy="566" r="7" fill="#FCB000" fillOpacity=".85" />
              <circle cx="498" cy="216" r="7" fill="#FCB000" fillOpacity=".85" />
              <circle cx="498" cy="216" r="16" fill="none" stroke="#FCB000" strokeOpacity=".3" />
            </svg>

            <div className="origin-center scale-[0.74] sm:scale-[0.84] lg:scale-[0.82] xl:scale-[0.92]">
              <InteractivePhone
                screens={PHONE_SCREENS}
                initialScreen="home"
                width={320}
                priority
              />
            </div>

            {/* La moto entra por delante: es el plano más cercano */}
            <div
              className="pointer-events-none absolute bottom-[2%] -left-[42%] z-10 w-[86%] sm:-left-[44%] sm:w-[88%]"
              style={{
                transform:
                  "translate3d(calc(var(--px) * -34px), calc(var(--py) * -14px), 0)",
              }}
            >
              <Image
                src="/brand/moto.png"
                alt=""
                width={1024}
                height={1024}
                className="h-auto w-full drop-shadow-[0_30px_40px_rgba(0,0,0,.75)]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
