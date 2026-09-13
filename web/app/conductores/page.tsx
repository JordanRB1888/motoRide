import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque, Pendiente } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";

export const metadata: Metadata = metaPagina({
  titulo: "Conduce con +58Express",
  descripcion:
    "Conduce con +58Express: eliges tus horas, decides qué viajes aceptas y cobras a través de la plataforma.",
  ruta: "/conductores",
});

export default function Page() {
  const PUNTOS: [string, string][] = [
    ["Tus horas", "Te conectas cuando quieres. Nadie te asigna un turno."],
    ["Tú eliges el viaje", "Ves la solicitud y decides si la tomas."],
    ["Ganancias a la vista", "Lo que llevas hecho y lo que has cobrado, siempre a mano."],
    ["Cobro por la plataforma", "Las liquidaciones pasan por +58Express."],
    ["Navegación integrada", "La ruta hacia el pasajero y hacia el destino."],
    ["Verificación real", "Subes tus documentos y un administrador los aprueba."],
  ];

  const PASOS: [string, string][] = [
    ["Te registras", "Creas tu cuenta de conductor en la aplicación."],
    ["Subes tus documentos", "Los que acrediten que puedes conducir y que la moto es tuya."],
    ["Un administrador revisa", "Cuando quedan aprobados, puedes conectarte y trabajar."],
  ];

  return (
    <PageShell
      titulo={<>Tú decides <span className="text-signal">cuándo trabajas</span></>}
      entradilla="Recibes las solicitudes que están cerca, aceptas las que quieras y llevas tus ganancias y tu historial en la misma aplicación."
    >
      <Bloque>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {PUNTOS.map(([t, d], i) => (
            <Reveal key={t} delay={i * 0.05}>
              <h2 className="display text-[1.6rem] text-paper">{t}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-paper-dim">{d}</p>
            </Reveal>
          ))}
        </div>
      </Bloque>

      <Bloque className="bg-ink-950">
        <Reveal>
          <h2 className="display text-[clamp(2rem,5vw,3.2rem)] text-paper">Cómo se entra</h2>
        </Reveal>
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {PASOS.map(([t, d], i) => (
            <Reveal key={t} delay={i * 0.06} as="li">
              <span className="tabular text-[13px] font-bold tracking-[0.22em] text-signal">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="display mt-2 text-[1.5rem] text-paper">{t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-paper-dim">{d}</p>
            </Reveal>
          ))}
        </ol>
        <div className="mt-12">
          <Pendiente>
            El formulario de postulación vive dentro de la aplicación, que todavía no está
            publicada. Cuando exista un punto de entrada web, el botón llevará ahí.
          </Pendiente>
        </div>
      </Bloque>
    </PageShell>
  );
}
