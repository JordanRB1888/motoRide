import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";
import { SAFETY } from "@/lib/content";

export const metadata: Metadata = metaPagina({
  titulo: "Seguridad",
  descripcion:
    "Conductor verificado, viaje registrado y ubicación en vivo: así cuida +58Express cada carrera.",
  ruta: "/seguridad",
});

export default function Page() {
  return (
    <PageShell
      titulo={<>Saber quién <span className="text-signal">te lleva</span></>}
      entradilla="Moverse en moto por la ciudad exige confianza. Esto es lo que hace la plataforma para que el viaje quede registrado."
    >
      <Bloque>
        <dl className="divide-y divide-white/10 border-y border-white/10">
          {SAFETY.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.04} className="grid gap-2 py-7 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-10">
            <dt className="text-[17px] font-bold leading-snug text-paper">{item.title}</dt>
            <dd className="text-[16px] leading-relaxed text-paper-dim">{item.body}</dd>
            </Reveal>
          ))}
        </dl>
      </Bloque>
    </PageShell>
  );
}
