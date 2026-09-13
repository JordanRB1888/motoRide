import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque, Pendiente } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";

export const metadata: Metadata = metaPagina({
  titulo: "Crece con +58Express",
  descripcion:
    "Lleva tu negocio a +58Express: presencia en la aplicación y entregas a domicilio en tu zona.",
  ruta: "/aliados",
});

export default function Page() {
  const PUNTOS: [string, string][] = [
    ["Presencia en la aplicación", "Tu negocio, visible para quien ya está pidiendo."],
    ["Entregas sin flota propia", "Los conductores de la plataforma llevan tus pedidos."],
    ["Tu zona, tu gente", "Te encuentran los vecinos que tienes al lado."],
  ];

  return (
    <PageShell
      titulo={<>Crece con <span className="text-signal">+58Express</span></>}
      entradilla="Restaurantes, farmacias, mercados y tiendas de Maracaibo y el Municipio Mara."
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
        <div className="mt-12">
          <Pendiente>
            El alta de comercios aliados todavía no tiene un formulario público: el
            contacto se coordina directamente con el equipo de +58Express.
          </Pendiente>
        </div>
      </Bloque>
    </PageShell>
  );
}
