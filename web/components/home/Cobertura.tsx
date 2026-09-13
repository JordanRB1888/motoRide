"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ZONAS } from "@/lib/zonas";
import { medir } from "@/lib/analitica";

// El mapa solo existe en el navegador y no debe entrar en el bundle inicial.
const MapaZonas = dynamic(() => import("@/components/map/MapaZonas"), {
  ssr: false,
  loading: () => <Superficie estado="cargando" />,
});

/** Fondo del hueco del mapa. El atributo distingue los dos estados en el DOM. */
function Superficie({ estado }: { estado: "en-espera" | "cargando" }) {
  return (
    <div
      data-mapa-estado={estado}
      className="h-full w-full rounded-[var(--radius-card)] bg-ink-850"
    />
  );
}

/**
 * Cobertura.
 *
 * El texto manda y el mapa obedece: al recorrer las zonas, la cámara vuela a la
 * que estés leyendo. En pantallas estrechas el mapa se coloca arriba y las zonas
 * se eligen tocándolas, porque el recorrido lateral no cabe.
 */
export default function Cobertura() {
  const [activa, setActiva] = useState(ZONAS[0].id);
  const [mapaVivo, setMapaVivo] = useState(false);
  const bloques = useRef<(HTMLDivElement | null)[]>([]);
  const hueco = useRef<HTMLDivElement>(null);

  /* Leaflet, su CSS y las teselas no se piden hasta que el mapa se acerca:
     la sección vive a unos 7.500 px de scroll y quien no llega hasta ella no
     debería pagarla. El margen de 500 px hace que ya esté montado al aparecer. */
  useEffect(() => {
    const el = hueco.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setMapaVivo(true);
      return;
    }
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setMapaVivo(true);
          io.disconnect();
        }
      },
      { rootMargin: "500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const nodos = bloques.current.filter(Boolean) as HTMLDivElement[];
    if (!nodos.length) return;

    const io = new IntersectionObserver(
      (entradas) => {
        // Gana el bloque más centrado en pantalla, no el primero que entra.
        const visible = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const zona = (visible.target as HTMLElement).dataset.zona!;
        setActiva((previa) => {
          // Sólo se mide el cambio, no cada sacudida del observador.
          if (previa !== zona) medir("zona_consultada", { zona, modo: "scroll" });
          return zona;
        });
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

        {/* Dicho con todas las letras, y no insinuado: son zonas PREVISTAS de
            lanzamiento. Una web pre-lanzamiento que enseña un mapa con zonas
            marcadas invita a leer «ya operamos aquí», y eso todavía no es
            cierto. */}
        <p className="prose-measure mt-6 text-[17px] leading-relaxed text-paper-dim">
          Estas son las <strong className="font-bold text-paper">zonas iniciales previstas
          para el lanzamiento</strong> en el estado Zulia. No son cobertura definitiva: la
          disponibilidad en cada una dependerá de cómo avance la puesta en marcha.
        </p>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          {/* El mapa: arriba en móvil, fijo al costado en escritorio */}
          <div
            ref={hueco}
            className="order-first h-[340px] sm:h-[420px] lg:order-last lg:sticky lg:top-[104px] lg:h-[min(74vh,620px)]"
          >
            {mapaVivo ? <MapaZonas activa={activa} /> : <Superficie estado="en-espera" />}
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
                    {/* El botón solo contiene texto en línea: un <h3> o un <p>
                        dentro de un <button> no es HTML válido y mete el
                        encabezado dentro del nombre accesible del control. */}
                    <h3>
                      <button
                        type="button"
                        onClick={() => {
                          setActiva(z.id);
                          medir("zona_consultada", { zona: z.id, modo: "pulsacion" });
                        }}
                        aria-current={on}
                        className="group block w-full cursor-pointer text-left"
                      >
                        <span className="flex items-center gap-4">
                          <span
                            className={`relative block h-[62px] w-[62px] shrink-0 overflow-hidden rounded-xl transition-all duration-500 ${
                              on
                                ? "opacity-100 grayscale-0"
                                : "opacity-45 grayscale group-hover:opacity-75"
                            }`}
                          >
                            <Image
                              src={z.foto}
                              /* Decorativa: el lugar y la zona ya están escritos
                                 justo al lado, repetirlos duplica el anuncio. */
                              alt=""
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
                        </span>
                        <span
                          className={`display mt-4 block text-[clamp(2rem,5vw,3.2rem)] transition-colors duration-300 ${
                            on ? "text-paper" : "text-paper-mute group-hover:text-paper-dim"
                          }`}
                        >
                          {z.nombre}
                        </span>
                      </button>
                    </h3>
                    <p
                      className={`mt-3 max-w-[42ch] text-[16px] leading-relaxed transition-colors duration-300 ${
                        on ? "text-paper-dim" : "text-paper-mute"
                      }`}
                    >
                      {z.nota}
                    </p>
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
