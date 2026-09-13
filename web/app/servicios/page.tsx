import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import SiguienteLectura from "@/components/site/SiguienteLectura";
import Reveal from "@/components/motion/Reveal";
import { SERVICES } from "@/lib/content";

export const metadata: Metadata = metaPagina({
  titulo: "Servicios: mototaxi, delivery y envíos",
  descripcion:
    "Mototaxi, viajes, delivery, comida, mercado, envíos y encomiendas en Maracaibo y el Municipio Mara, estado Zulia. Disponibilidad sujeta al lanzamiento.",
  ruta: "/servicios",
});

export default function Page() {
  return (
    <PageShell
      titulo={<>Todo en <span className="text-signal">una sola app</span></>}
      entradilla="Mototaxi, viajes, delivery, comida, mercado, envíos, encomiendas, comercios, compra y venta y transporte seguro."
    >
      <Bloque>
        <ul className="divide-y divide-white/10 border-y border-white/10">
          {SERVICES.map((s, i) => (
            <Reveal key={s.id} delay={i * 0.035} as="li">
              <div className="grid gap-2 py-6 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] sm:gap-10">
                <h2 className="display text-[clamp(1.5rem,3.4vw,2.1rem)] text-paper">
                  {s.name}
                </h2>
                <p className="text-[16px] leading-relaxed text-paper-dim">{s.line}</p>
              </div>
            </Reveal>
          ))}
        </ul>

        <div className="mt-16">
          <SiguienteLectura
            enlaces={[
              {
                href: "/pasajeros",
                rotulo: "Cómo funciona para quien pide",
                nota: "Precio antes de confirmar, seguimiento en el mapa y pagos locales.",
              },
              {
                href: "/conductores",
                rotulo: "Cómo funciona para quien conduce",
                nota: "Tus horas, tus viajes y el cobro por la plataforma.",
              },
              {
                href: "/seguridad",
                rotulo: "Transporte seguro, en detalle",
                nota: "Qué queda registrado en cada carrera y por qué.",
              },
              {
                href: "/aliados",
                rotulo: "Comercios aliados",
                nota: "Entregas a domicilio en Maracaibo y el Municipio Mara sin flota propia.",
              },
            ]}
          />
        </div>
      </Bloque>
    </PageShell>
  );
}
