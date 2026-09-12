import Reveal from "@/components/motion/Reveal";
import { SAFETY } from "@/lib/content";

/**
 * Seguridad.
 *
 * La sección más calmada del sitio: aquí el movimiento y el amarillo estorban.
 * Solo se enumeran capacidades que existen en el producto — cada una está
 * respaldada por un endpoint o un flujo real, ninguna es aspiracional.
 */
export default function Seguridad() {
  return (
    <section
      id="seguridad"
      aria-labelledby="seguridad-titulo"
      className="relative isolate overflow-hidden border-t border-white/8 bg-ink-900 py-24 sm:py-32"
    >
      {/* Una ruta apenas insinuada: presencia, no protagonismo */}
      <svg
        aria-hidden
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 -z-10 h-full w-full opacity-[0.16]"
      >
        <path
          d="M -40 560 C 180 540, 260 420, 420 400 C 610 376, 700 300, 880 286 C 1010 276, 1130 230, 1260 190"
          fill="none"
          stroke="#FCB000"
          strokeWidth="2"
          strokeDasharray="8 14"
          strokeLinecap="round"
        />
        <circle cx="420" cy="400" r="5" fill="#FCB000" />
        <circle cx="880" cy="286" r="5" fill="#FCB000" />
      </svg>

      <div className="mx-auto max-w-[1440px] px-[var(--shell-x)]">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
          <Reveal>
            <h2
              id="seguridad-titulo"
              className="display text-[clamp(2.6rem,6.5vw,4.6rem)] text-paper"
            >
              Saber quién
              <br />
              te lleva
            </h2>
            <p className="prose-measure mt-6 text-[17px] leading-relaxed text-paper-dim">
              Moverse en moto por la ciudad exige confianza. Estas son las cosas
              concretas que hace la plataforma para que el viaje quede registrado y
              sepas con quién vas.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <dl className="divide-y divide-white/10 border-y border-white/10">
              {SAFETY.map((item) => (
                <div key={item.title} className="grid gap-2 py-6 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-8">
                  <dt className="text-[17px] font-bold leading-snug text-paper">
                    {item.title}
                  </dt>
                  <dd className="text-[15px] leading-relaxed text-paper-dim">
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
