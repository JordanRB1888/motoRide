import type { ReactNode } from "react";
import Reveal from "@/components/motion/Reveal";
import BotonWhatsApp from "@/components/site/BotonWhatsApp";
import { correo, type Intencion } from "@/lib/contact";

/**
 * El bloque con el que termina una página en vez de terminar en una pared.
 *
 * Las páginas de conductores, aliados y ayuda acababan en un aviso de «contenido
 * pendiente»: quien llegaba convencido no tenía ni una acción disponible. Este
 * bloque cierra con una puerta real —una conversación con el equipo— y repite la
 * misma composición en las tres, para que se lea como una promesa del sitio y no
 * como tres soluciones distintas.
 */
export default function PuertaCTA({
  titulo,
  cuerpo,
  intencion,
  rotulo,
  nota,
}: {
  titulo: ReactNode;
  cuerpo: string;
  intencion: Intencion;
  rotulo: string;
  nota?: string;
}) {
  return (
    <Reveal>
      <div className="rounded-[var(--radius-card)] border border-white/10 bg-ink-850 p-8 sm:p-12">
        <h2 className="display max-w-[20ch] text-[clamp(2rem,5vw,3.2rem)] text-paper">
          {titulo}
        </h2>
        <p className="prose-measure mt-5 text-[17px] leading-relaxed text-paper-dim">
          {cuerpo}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BotonWhatsApp intencion={intencion} size="lg">
            {rotulo}
          </BotonWhatsApp>
          <a
            href={correo(intencion)}
            className="inline-flex h-14 items-center justify-center rounded-full border border-white/22 px-8 text-base font-bold text-paper transition-colors duration-150 hover:border-white/45 hover:bg-white/[0.06]"
          >
            Escribir por correo
          </a>
        </div>
        {nota && <p className="mt-6 text-[15px] leading-relaxed text-paper-mute">{nota}</p>}
      </div>
    </Reveal>
  );
}
