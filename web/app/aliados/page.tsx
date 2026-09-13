import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import PuertaCTA from "@/components/site/PuertaCTA";
import FormularioAliados from "@/components/forms/FormularioAliados";
import { PARTNER_LEADS_ENABLED } from "@/lib/flags";
import Reveal from "@/components/motion/Reveal";

export const metadata: Metadata = metaPagina({
  titulo: "Comercios aliados en Maracaibo y Mara · +58Express",
  descripcion:
    "Lleva tu comercio a +58Express: presencia en la aplicación y entregas a domicilio en Maracaibo y el Municipio Mara, sin flota propia.",
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
        <div className="mt-14">
          {PARTNER_LEADS_ENABLED ? <FormularioAliados /> : null}
        </div>

        <div className={PARTNER_LEADS_ENABLED ? "hidden" : "mt-14"}>
          <PuertaCTA
            titulo={<>Cuéntanos sobre <span className="text-signal">tu comercio</span></>}
            cuerpo="El alta de comercios todavía no es automática. Escríbenos qué vendes y dónde estás, y nuestro equipo se pone en contacto contigo para explicarte cómo entrar."
            intencion="aliado"
            rotulo="Quiero ser aliado"
          />
        </div>
      </Bloque>
    </PageShell>
  );
}
