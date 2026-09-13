"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ZONAS } from "@/lib/zonas";

// El mapa solo existe en el navegador y no debe entrar en el bundle inicial.
const MapaZonas = dynamic(() => import("@/components/map/MapaZonas"), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-[var(--radius-card)] bg-ink-850" />,
});

/**
 * Cobertura.
 *
 * El texto manda y el mapa obedece: al recorrer las zonas, la cámara vuela a la
 * que estés leyendo. En pantallas estrechas el mapa se coloca arriba y las zonas
 * se eligen tocándolas, porque el recorrido lateral no cabe.
 */
export default function Cobertura() {
  const [activa, setActiva] = useState(ZONAS[0].id);
  const bloques = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const nodos = bloques.current.filter(Boolean) as HTMLDivElement[];
    if (!nodos.length) return;

    const io = new IntersectionObserver(
      (entradas) => {
        // Gana el bloque más centrado en pantalla, no el primero que entra.
        const visible = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiva((visible.target as HTMLElement).dataset.zona!);
      },
      { rootMargin: "-38% 0px -38% 0px", threshold: [0.1, 0.5, 1] },
    );
    nodos.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <section
      id="cobertura"
      aria-labelledby="cobertura-titulo"
      className="border-t border-white/8 bg-ink-900 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[1440px] px-[var(--shell-x)]">
        <h2
          id="cobertura-titulo"
          className="display max-w-[16ch] text-[clamp(2.6rem,6.5vw,4.6rem)] text-paper"
        >
          Dónde nos vas <span className="text-signal">a ver primero</span>
        </h2>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          {/* El mapa: arriba en móvil, fijo al costado en escritorio */}
          <div className="order-first h-[340px] sm:h-[420px] lg:order-last lg:sticky lg:top-[104px] lg:h-[min(74vh,620px)]">
            <MapaZonas activa={activa} />
          </div>

          <ol className="flex flex-col gap-4 lg:gap-0">
            {ZONAS.map((z, i) => {
              const on = z.id === activa;
              return (
                <li key={z.id}>
                  <div
                    data-zona={z.id}
                    ref={(n) => {
                      bloques.current[i] = n;
                    }}
                    className="lg:py-[16vh]"
                  >
                    <button
                      type="button"
                      onClick={() => setActiva(z.id)}
                      aria-current={on}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className={`relative block h-[62px] w-[62px] shrink-0 overflow-hidden rounded-xl transition-all duration-500 ${
                            on ? "opacity-100 grayscale-0" : "opacity-45 grayscale"
                          }`}
                        >
                          <Image
                            src={z.foto}
                            alt={`${z.lugar}, ${z.nombre}`}
                            fill
                            sizes="62px"
                            className="object-cover"
                          />
                        </span>
                        <span
                          className={`text-[13px] font-bold uppercase tracking-[0.2em] transition-colors duration-300 ${
                            on ? "text-signal" : "text-paper-mute"
                          }`}
                        >
                          {z.lugar}
                        </span>
                      </div>
                      <h3
                        className={`display mt-4 text-[clamp(2rem,5vw,3.2rem)] transition-colors duration-300 ${
                          on ? "text-paper" : "text-paper-mute"
                        }`}
                      >
                        {z.nombre}
                      </h3>
                      <p
                        className={`mt-3 max-w-[42ch] text-[16px] leading-relaxed transition-colors duration-300 ${
                          on ? "text-paper-dim" : "text-paper-mute"
                        }`}
                      >
                        {z.nota}
                      </p>
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
