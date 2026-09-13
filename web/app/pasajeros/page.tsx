import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = metaPagina({
  titulo: "Para quien pide",
  descripcion:
    "Pide tu moto en Maracaibo y el Municipio Mara. Conoce el precio antes de confirmar y sigue el viaje en el mapa.",
  ruta: "/pasajeros",
});

export default function Page() {
  const PUNTOS: [string, string][] = [
    ["Precio antes de pedir", "La aplicación estima el viaje con la distancia y el tiempo. Confirmas sabiendo la cifra."],
    ["Seguimiento en vivo", "La posición del conductor se actualiza durante todo el trayecto."],
    ["Chat dentro del viaje", "Le escribes si hace falta indicarle algo. Los adjuntos son privados."],
    ["Pagos locales", "Wallet de +58Express, Pago Móvil, Zelle, Zinli o efectivo."],
    ["Viajes programados", "Dejas pedido el viaje y un conductor lo toma."],
    ["Historial completo", "Cada carrera queda registrada con su recorrido y su estado."],
  ];

  return (
    <PageShell
      titulo={<>Sales sabiendo <span className="text-signal">cuánto cuesta</span></>}
      entradilla="Pedir una moto deja de ser salir a la esquina a esperar. Marcas a dónde vas, ves el precio y sigues al conductor en el mapa hasta que llega."
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
      </Bloque>

      <Bloque className="bg-ink-950">
        <Reveal>
          <h2 className="display text-[clamp(2rem,5vw,3.2rem)] text-paper">
            Muy pronto en tu teléfono
          </h2>
          <p className="prose-measure mt-4 text-[17px] leading-relaxed text-paper-dim">
            La aplicación todavía no está publicada en las tiendas. Cuando lo esté, el
            enlace aparecerá aquí.
          </p>
          <div className="mt-8">
            <ButtonLink href="/#descargar" size="lg">
              Ver más
            </ButtonLink>
          </div>
        </Reveal>
      </Bloque>
    </PageShell>
  );
}
