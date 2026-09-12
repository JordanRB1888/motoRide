import type { Metadata } from "next";
import PageShell, { Bloque } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";
import { SERVICES } from "@/lib/content";

export const metadata: Metadata = {
  title: "Servicios",
  description: "Mototaxi, viajes, delivery, comida, mercado, envíos, encomiendas, comercios, compra y venta y transporte seguro.",
  alternates: { canonical: "/servicios" },
};

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
      </Bloque>
    </PageShell>
  );
}
