import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";

export const metadata: Metadata = metaPagina({
  titulo: "Nosotros",
  descripcion:
    "+58Express es una plataforma venezolana de movilidad y servicios bajo demanda, nacida en el Zulia.",
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
            <p>
              Empezamos por las plazas que todo el mundo conoce — Santa Cruz de Mara, El
              Moján y Maracaibo — porque es ahí donde la gente ya sale a buscar transporte
              todos los días.
            </p>
          </div>
        </Reveal>
      </Bloque>
    </PageShell>
  );
}
