import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import SiguienteLectura from "@/components/site/SiguienteLectura";
import ZonasIniciales from "@/components/site/ZonasIniciales";
import Reveal from "@/components/motion/Reveal";

export const metadata: Metadata = metaPagina({
  titulo: "Quiénes somos: movilidad zuliana",
  descripcion:
    "+58 EXPRESS, C.A. es una plataforma venezolana de movilidad y servicios bajo demanda, nacida en el Zulia y pensada para Maracaibo y el Municipio Mara.",
  ruta: "/nosotros",
});

export default function Page() {
  return (
    <PageShell
      titulo={<>Nacimos <span className="text-signal">en el Zulia</span></>}
      entradilla="+58Express es una plataforma venezolana de movilidad y servicios bajo demanda."
    >
      <Bloque>
        <Reveal>
          <div className="prose-measure flex flex-col gap-5 text-[17px] leading-relaxed text-paper-dim">
            <p>
              En buena parte del Zulia, moverse todavía significa salir a la calle y
              buscar: una moto en la esquina, alguien que haga el mandado, un número que
              quizá conteste.
            </p>
            <p>
              +58Express existe para que eso se resuelva desde el teléfono, con el precio
              por delante, el recorrido a la vista y el registro de lo que pasó.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="display mt-16 text-[clamp(1.6rem,3.6vw,2.2rem)] text-paper">
            Por dónde <span className="text-signal">empezamos</span>
          </h2>
          <div className="prose-measure mt-6 flex flex-col gap-5 text-[17px] leading-relaxed text-paper-dim">
            <p>
              Las zonas iniciales previstas son las plazas que todo el mundo conoce —{" "}
              <strong className="font-bold text-paper">
                Santa Cruz de Mara, El Moján y Maracaibo
              </strong>{" "}
              — porque es ahí donde la gente ya sale a buscar transporte todos los días.
              Son zonas de lanzamiento previstas, no cobertura definitiva: la
              disponibilidad dependerá de cómo avance la puesta en marcha.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-10">
            <ZonasIniciales />
          </div>
        </Reveal>

        <Reveal>
          <div className="prose-measure mt-10 flex flex-col gap-5 text-[17px] leading-relaxed text-paper-dim">
            <p>
              Si quieres ver qué hará la plataforma, está todo en{" "}
              <a
                href="/servicios"
                className="font-bold text-signal underline underline-offset-4 transition-colors duration-150 hover:text-signal-bright"
              >
                la página de servicios
              </a>
              ; y si prefieres preguntar directamente, en{" "}
              <a
                href="/contacto"
                className="font-bold text-signal underline underline-offset-4 transition-colors duration-150 hover:text-signal-bright"
              >
                contacto
              </a>{" "}
              te responde una persona del equipo.
            </p>
          </div>
        </Reveal>

        <div className="mt-16">
          <SiguienteLectura
            enlaces={[
              {
                href: "/seguridad",
                rotulo: "Cómo se cuida cada viaje",
                nota: "Conductor verificado, recorrido registrado y ubicación en vivo.",
              },
              {
                href: "/aliados",
                rotulo: "Comercios del Zulia",
                nota: "Qué gana un negocio local por estar en +58Express.",
              },
            ]}
          />
        </div>
      </Bloque>
    </PageShell>
  );
}
