import Image from "next/image";

type Zona = {
  slug: string;
  nombre: string;
  lugar: string;
  linea: string;
  src: string;
  /** Resolución nativa del original: define hasta qué tamaño puede crecer. */
  sizes: string;
};

const ZONAS: Zona[] = [
  {
    slug: "santa-cruz-de-mara",
    nombre: "Santa Cruz de Mara",
    lugar: "Plaza Bolívar",
    linea: "Aquí arranca la llegada de +58Express al Municipio Mara.",
    src: "/zonas/santa-cruz-de-mara.webp",
    sizes: "(max-width: 1024px) 100vw, 58vw",
  },
  {
    slug: "maracaibo",
    nombre: "Maracaibo",
    lugar: "Basílica de La Chinita",
    linea: "La ciudad donde la aplicación abre su mapa.",
    src: "/zonas/maracaibo.webp",
    sizes: "(max-width: 1024px) 100vw, 34vw",
  },
  {
    slug: "el-mojan",
    nombre: "El Moján",
    lugar: "San Rafael de El Moján",
    linea: "La capital del municipio, a orillas del lago.",
    src: "/zonas/el-mojan.webp",
    sizes: "(max-width: 1024px) 100vw, 34vw",
  },
];

function Tarjeta({
  zona,
  alto,
  compacta = false,
}: {
  zona: Zona;
  alto: string;
  /** En las tarjetas bajas el parrafo no cabe: el nombre carga el peso. */
  compacta?: boolean;
}) {
  return (
    <article
      className={`group relative isolate overflow-hidden rounded-[var(--radius-card)] ${alto}`}
    >
      <Image
        src={zona.src}
        alt={`${zona.lugar}, ${zona.nombre}`}
        fill
        sizes={zona.sizes}
        className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
      />

      {/* Asiento del texto. La fotografía ya viene oscurecida abajo; esto lo sella. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,8,10,0) 0%, rgba(8,8,10,.72) 52%, rgba(8,8,10,.95) 100%)",
        }}
      />

      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
        <div className="flex items-center gap-2.5">
          {/* Pin: el amarillo entra por la señal, nunca sobre la fotografía */}
          <svg width="13" height="17" viewBox="0 0 13 17" aria-hidden className="shrink-0">
            <path
              d="M6.5 16S12 10.4 12 6.5A5.5 5.5 0 0 0 1 6.5C1 10.4 6.5 16 6.5 16Z"
              fill="none"
              stroke="#FCB000"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <circle cx="6.5" cy="6.4" r="1.9" fill="#FCB000" />
          </svg>
          <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-signal">
            {zona.lugar}
          </span>
        </div>

        <h3
          className={`display mt-3 text-paper ${
            compacta
              ? "text-[clamp(1.5rem,3.2vw,2rem)]"
              : "text-[clamp(1.9rem,4.4vw,2.9rem)]"
          }`}
        >
          {zona.nombre}
        </h3>
        {!compacta && (
          <p className="mt-2 max-w-[36ch] text-[15px] leading-relaxed text-paper-dim">
            {zona.linea}
          </p>
        )}
      </div>
    </article>
  );
}

export default function Zonas() {
  const [mara, maracaibo, mojan] = ZONAS;

  return (
    <section
      id="zonas"
      aria-labelledby="zonas-titulo"
      className="relative border-t border-white/8 bg-ink-900 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[1440px] px-[var(--shell-x)]">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:gap-14">
          {/* Palabra */}
          <div className="lg:pt-4">
            <h2
              id="zonas-titulo"
              className="display text-[clamp(2.6rem,6.5vw,4.4rem)] text-paper"
            >
              Aquí nos estamos
              <br />
              <span className="text-signal">moviendo</span>
            </h2>
            <p className="prose-measure mt-6 text-[17px] leading-relaxed text-paper-dim">
              El Zulia no se mueve igual en todas partes. Empezamos por las plazas
              que todo el mundo conoce, donde la gente ya sale a buscar transporte
              todos los días.
            </p>
            <p className="prose-measure mt-4 text-[17px] leading-relaxed text-paper-dim">
              Santa Cruz de Mara, El Moján y Maracaibo: tres puntos de partida para
              que pedir una moto deje de ser salir a la esquina a esperar.
            </p>
          </div>

          {/* Composición: la zona de lanzamiento manda, las otras dos acompañan */}
          <div className="grid gap-4 sm:gap-5">
            <Tarjeta zona={mara} alto="h-[400px] sm:h-[480px] lg:h-[520px]" />
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              <Tarjeta zona={maracaibo} alto="h-[280px] sm:h-[330px]" compacta />
              <Tarjeta zona={mojan} alto="h-[280px] sm:h-[330px]" compacta />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
