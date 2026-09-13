import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque, Pendiente } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";

export const metadata: Metadata = metaPagina({
  titulo: "Términos",
  descripcion:
    "Términos y condiciones de uso de +58Express.",
  ruta: "/terminos",
  indexar: false,
});

export default function Page() {
  return (
    <PageShell titulo={<>Términos</>}>
      <Bloque>
        <Reveal>
          <Pendiente>
            El texto legal definitivo de +58Express todavía no está redactado. Esta página
            existe para que la arquitectura del sitio esté completa, pero{" "}
            <strong className="font-bold text-paper">
              no contiene un documento legal válido
            </strong>{" "}
            y no se indexa en buscadores. Publicar aquí un texto inventado sería peor que
            no tener página.
          </Pendiente>
        </Reveal>
      </Bloque>
    </PageShell>
  );
}
