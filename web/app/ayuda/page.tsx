import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";

export const metadata: Metadata = metaPagina({
  titulo: "Ayuda",
  descripcion:
    "Preguntas frecuentes sobre +58Express: disponibilidad, precios, pagos y cómo ser conductor.",
  ruta: "/ayuda",
});

export default function Page() {
  const FAQ: [string, string][] = [
    ["¿Ya puedo descargar la aplicación?", "Todavía no. No está publicada en Google Play ni en App Store. Cuando lo esté, el enlace aparecerá en esta web."],
    ["¿Dónde funciona +58Express?", "El trabajo está enfocado en Santa Cruz de Mara, El Moján y Maracaibo, en el estado Zulia."],
    ["¿Sé cuánto cuesta antes de pedir?", "Sí. La aplicación estima el viaje antes de que confirmes."],
    ["¿Cómo puedo pagar?", "Con wallet de +58Express, Pago Móvil, Zelle, Zinli o efectivo."],
    ["¿Cómo me hago conductor?", "Te registras como conductor, subes tu documentación y un administrador la revisa antes de que puedas conectarte."],
    ["¿Puedo escribirle al conductor?", "Sí, desde la propia aplicación mientras dura el viaje."],
  ];

  return (
    <PageShell
      titulo={<>¿En qué <span className="text-signal">te ayudamos?</span></>}
      entradilla="Las preguntas que más nos hacen."
    >
      <Bloque>
        <dl className="divide-y divide-white/10 border-y border-white/10">
          {FAQ.map(([q, a], i) => (
            <Reveal key={q} delay={i * 0.04} as="div">
              <div className="grid gap-2 py-7 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-10">
                <dt className="text-[17px] font-bold leading-snug text-paper">{q}</dt>
                <dd className="text-[16px] leading-relaxed text-paper-dim">{a}</dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </Bloque>
    </PageShell>
  );
}
