import type { ReactNode } from "react";
import SmoothScroll from "@/components/motion/SmoothScroll";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import Reveal from "@/components/motion/Reveal";

/**
 * Armazón de las páginas internas.
 *
 * La portada tiene su propia composición; el resto comparte esta cabecera para
 * que el sitio se lea como uno solo y no como páginas sueltas pegadas.
 */
export default function PageShell({
  titulo,
  entradilla,
  children,
}: {
  titulo: ReactNode;
  entradilla?: string;
  children: ReactNode;
}) {
  return (
    <>
      <SmoothScroll />
      <Navbar />
      <main id="contenido">
        <header className="relative isolate overflow-hidden border-b border-white/8 pt-[152px] pb-16 sm:pt-[190px] sm:pb-24">
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(100% 70% at 78% -20%, rgba(252,176,0,.13) 0%, rgba(252,176,0,0) 58%)," +
                "linear-gradient(180deg,#0f0f12 0%,#0b0b0c 100%)",
            }}
          />
          <div className="mx-auto max-w-[1440px] px-[var(--shell-x)]">
            <Reveal>
              <h1 className="display max-w-[18ch] text-[clamp(2.8rem,8vw,5.6rem)] text-paper">
                {titulo}
              </h1>
              {entradilla && (
                <p className="prose-measure mt-6 text-[clamp(1rem,2.2vw,1.25rem)] leading-relaxed text-paper-dim">
                  {entradilla}
                </p>
              )}
            </Reveal>
          </div>
        </header>

        {children}
      </main>
      <Footer />
    </>
  );
}

/** Bloque de contenido con el ritmo vertical del sitio. */
export function Bloque({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-b border-white/8 py-20 sm:py-28 ${className}`}>
      <div className="mx-auto max-w-[1440px] px-[var(--shell-x)]">{children}</div>
    </section>
  );
}

/**
 * Aviso de contenido pendiente.
 *
 * Se usa donde no existe texto definitivo todavía. Es visible a propósito: un
 * documento legal inventado es peor que un documento ausente.
 */
export function Pendiente({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-signal/35 bg-signal/[0.06] p-6 sm:p-8">
      <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-signal">
        Contenido pendiente
      </p>
      <div className="prose-measure mt-3 text-[16px] leading-relaxed text-paper-dim">
        {children}
      </div>
    </div>
  );
}
