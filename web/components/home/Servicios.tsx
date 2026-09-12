"use client";

import { useState } from "react";
import InteractivePhone from "@/components/phone/InteractivePhone";
import { SERVICES, PHONE_SCREENS } from "@/lib/content";

/**
 * Todo en una app.
 *
 * Una lista tipográfica, no una rejilla de tarjetas iguales: los nombres llevan
 * el peso y el teléfono responde al que estés mirando. En móvil la lista se
 * recorre con el pulgar y cada nombre lleva su línea debajo.
 */
export default function Servicios() {
  const [activo, setActivo] = useState(SERVICES[0].id);
  const servicio = SERVICES.find((s) => s.id === activo) ?? SERVICES[0];

  return (
    <section
      id="servicios"
      aria-labelledby="servicios-titulo"
      className="relative border-t border-white/8 bg-ink-900 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[1440px] px-[var(--shell-x)]">
        <h2
          id="servicios-titulo"
          className="display max-w-[16ch] text-[clamp(2.6rem,6.5vw,4.6rem)] text-paper"
        >
          Todo en <span className="text-signal">una sola app</span>
        </h2>

        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
          {/* La lista manda: nombres grandes, uno activo cada vez */}
          <ul className="divide-y divide-white/8 border-y border-white/8">
            {SERVICES.map((s) => {
              const on = s.id === activo;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActivo(s.id)}
                    onFocus={() => setActivo(s.id)}
                    onClick={() => setActivo(s.id)}
                    aria-current={on}
                    className="group flex w-full items-baseline gap-5 py-4 text-left sm:py-5"
                  >
                    <span
                      className={`display shrink-0 text-[clamp(1.7rem,4.2vw,2.6rem)] transition-colors duration-200 ${
                        on ? "text-signal" : "text-paper-mute group-hover:text-paper"
                      }`}
                    >
                      {s.name}
                    </span>
                    <span
                      className={`hidden text-[15px] leading-snug transition-colors duration-200 sm:block ${
                        on ? "text-paper-dim" : "text-transparent"
                      }`}
                    >
                      {s.line}
                    </span>
                  </button>
                  {/* En móvil la línea del activo se muestra bajo su nombre */}
                  {on && (
                    <p className="pb-4 text-[15px] leading-relaxed text-paper-dim sm:hidden">
                      {s.line}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex justify-center lg:justify-end">
            <div className="scale-[0.8] sm:scale-90 lg:scale-100">
              <InteractivePhone
                screens={PHONE_SCREENS}
                activeScreen={servicio.screen}
                width={300}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
