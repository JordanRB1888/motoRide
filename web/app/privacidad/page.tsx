import type { Metadata } from "next";
import PageShell, { Bloque, Pendiente } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";

export const metadata: Metadata = {
  title: "Privacidad",
  description: "Política de privacidad de +58Express.",
  alternates: { canonical: "/privacidad" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <PageShell titulo={<>Privacidad</>}>
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
