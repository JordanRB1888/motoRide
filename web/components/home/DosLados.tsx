import Link from "next/link";
import InteractivePhone from "@/components/phone/InteractivePhone";
import Reveal from "@/components/motion/Reveal";
import { screensById } from "@/lib/content";

const PASAJERO = [
  "Ves el precio antes de confirmar el viaje.",
  "Sigues al conductor en el mapa, en vivo.",
  "Le escribes desde la app si hace falta.",
  "Pagas con wallet, Pago Móvil, Zelle, Zinli o efectivo.",
  "Puedes dejar un viaje programado.",
];

const CONDUCTOR = [
  "Recibes las solicitudes que están cerca de ti.",
  "Decides cuáles aceptas y cuándo trabajas.",
  "Tus ganancias y tu historial, siempre a mano.",
  "Cobras a través de la plataforma.",
  "Trabajas verificado: tus documentos están aprobados.",
];

function Lado({
  titulo,
  entradilla,
  puntos,
  pantalla,
  acento,
  href,
  enlace,
}: {
  titulo: string;
  entradilla: string;
  puntos: string[];
  pantalla: string;
  acento: boolean;
  href: string;
  enlace: string;
}) {
  return (
    <div className="flex flex-col gap-7">
      {/* El titular va primero: al llegar a la sección se sabe de qué lado habla */}
      <div>
        <h3
          className={`display text-[clamp(2rem,4.6vw,2.9rem)] ${
            acento ? "text-signal" : "text-paper"
          }`}
        >
          {titulo}
        </h3>
        <p className="mt-3 max-w-[44ch] text-[16px] leading-relaxed text-paper-dim">
          {entradilla}
        </p>
      </div>

      <div className="flex justify-center py-2">
        <div className="scale-[0.82] sm:scale-90">
          <InteractivePhone screens={screensById(pantalla)} initialScreen={pantalla} width={288} />
        </div>
      </div>

      <ul className="flex flex-col gap-3.5">
        {puntos.map((p) => (
          <li key={p} className="flex gap-3.5 text-[15px] leading-relaxed text-paper-dim">
            <svg
              width="17"
              height="17"
              viewBox="0 0 17 17"
              aria-hidden
              className="mt-[3px] shrink-0"
            >
              <circle cx="8.5" cy="8.5" r="7.6" fill="none" stroke="#FCB000" strokeOpacity=".45" />
              <path
                d="M5 8.8 7.3 11 12 6.2"
                fill="none"
                stroke="#FCB000"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {p}
          </li>
        ))}
      </ul>

      <Link
        href={href}
        className="group inline-flex items-center gap-2 self-start text-[15px] font-bold text-signal transition-colors duration-150 hover:text-signal-bright"
      >
        {enlace}
        <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden className="shrink-0">
          <path
            d="M2.6 7.5h9.2M8.4 4.1l3.4 3.4-3.4 3.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </div>
  );
}

/**
 * Los dos lados del mismo viaje.
 *
 * La solicitud sale de un teléfono y entra en el otro: el hilo del centro es esa
 * conexión, y es lo que hace que el producto se entienda como un sistema y no
 * como dos aplicaciones sueltas.
 */
export default function DosLados() {
  return (
    <section
      id="dos-lados"
      aria-labelledby="dos-lados-titulo"
      className="relative border-t border-white/8 bg-ink-950 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[1440px] px-[var(--shell-x)]">
        <Reveal>
          <h2
            id="dos-lados-titulo"
            className="display max-w-[18ch] text-[clamp(2.6rem,6.5vw,4.6rem)] text-paper"
          >
            Un viaje, <span className="text-signal">dos lados</span>
          </h2>
          <p className="prose-measure mt-6 text-[17px] leading-relaxed text-paper-dim">
            Cuando pides una moto, tu solicitud sale hacia los conductores que están
            cerca. El que la acepta ve tu punto de partida y tú empiezas a verlo venir.
            Todo ocurre a la vez, en los dos teléfonos.
          </p>
        </Reveal>

        <div className="relative mt-16 grid gap-16 lg:grid-cols-2 lg:gap-24">
          {/* El hilo que une los dos lados: solo cuando caben uno junto al otro */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[38%] hidden h-px w-[10%] -translate-x-1/2 lg:block"
            style={{
              background:
                "linear-gradient(90deg, rgba(252,176,0,0) 0%, #FCB000 50%, rgba(252,176,0,0) 100%)",
            }}
          />

          <Reveal>
            <Lado
              titulo="Para quien pide"
              entradilla="Sales de casa sabiendo cuánto cuesta y por dónde viene."
              puntos={PASAJERO}
              pantalla="map"
              acento={false}
              href="/pasajeros"
              enlace="Todo para quien pide"
            />
          </Reveal>

          <Reveal delay={0.12}>
            <Lado
              titulo="Para quien conduce"
              entradilla="Tú eliges cuándo trabajas y qué viajes tomas."
              puntos={CONDUCTOR}
              pantalla="driver"
              acento
              href="/conductores"
              enlace="Todo para quien conduce"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
