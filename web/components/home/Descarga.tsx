import Image from "next/image";
import InteractivePhone from "@/components/phone/InteractivePhone";
import Reveal from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { screensById, STORES } from "@/lib/content";
import { WAITLIST_ENABLED } from "@/lib/contact";
import BotonWhatsApp from "@/components/site/BotonWhatsApp";

/**
 * Descarga.
 *
 * La aplicación todavía no está publicada. Los badges no son enlaces: son una
 * declaración de dónde estará. Inventar una URL de tienda seria enviar a la
 * gente a una página que no existe.
 */
export default function Descarga() {
  return (
    <section
      id="descargar"
      aria-labelledby="descarga-titulo"
      className="relative isolate overflow-hidden border-t border-white/8 bg-ink-950 py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 108%, rgba(252,176,0,.16) 0%, rgba(252,176,0,0) 62%)",
        }}
      />

      <div className="mx-auto max-w-[1440px] px-[var(--shell-x)]">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
          <Reveal>
            <h2
              id="descarga-titulo"
              className="display max-w-[15ch] text-[clamp(2.8rem,7vw,5rem)] text-paper"
            >
              Tu ciudad,
              <br />
              <span className="text-signal">a unos toques</span>
            </h2>
            <p className="prose-measure mt-6 text-[17px] leading-relaxed text-paper-dim">
              +58Express está por llegar a Santa Cruz de Mara, El Moján y Maracaibo.
              Cuando la aplicación esté publicada, aparecerá aquí.
            </p>

            <div className="mt-10">
              <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-paper-mute">
                {STORES.label} en
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                {/* Sin URL real no hay enlace: son marcas de destino, no botones */}
                <span
                  className="inline-flex opacity-55 grayscale"
                  title="Disponible cuando la aplicación se publique"
                >
                  <Image
                    src="/brand/badge-google.png"
                    alt="Próximamente en Google Play"
                    width={162}
                    height={48}
                    className="h-12 w-auto"
                  />
                </span>
                <span
                  className="inline-flex opacity-55 grayscale"
                  title="Disponible cuando la aplicación se publique"
                >
                  <Image
                    src="/brand/badge-apple.png"
                    alt="Próximamente en App Store"
                    width={162}
                    height={48}
                    className="h-12 w-auto"
                  />
                </span>
              </div>
            </div>

            {/* Aquí irá la lista de espera. Mientras el interruptor esté apagado no
                se pinta ningún campo: un formulario que no puede guardar nada, ni
                confirmar por correo, ni declarar en una política de privacidad qué
                hace con el dato, engañaría a quien lo rellena. Se dice lo que hay y
                se ofrece la puerta que sí existe. */}
            {WAITLIST_ENABLED ? null : (
              <div className="mt-10 rounded-[var(--radius-card)] border border-white/10 bg-white/[0.03] p-6 sm:p-7">
                <p className="text-[17px] font-bold text-paper">
                  ¿Quieres que te avisemos cuando esté disponible?
                </p>
                <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-paper-dim">
                  Todavía no tenemos lista de espera. Escríbenos y te avisamos en
                  cuanto la aplicación se publique en tu zona.
                </p>
                <div className="mt-6">
                  <BotonWhatsApp intencion="general" size="md">
                    Avísenme cuando salga
                  </BotonWhatsApp>
                </div>
              </div>
            )}

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/conductores" size="lg">
                Quiero conducir
              </ButtonLink>
              <ButtonLink href="/aliados" size="lg" variant="outline">
                Quiero ser aliado
              </ButtonLink>
            </div>
          </Reveal>

          <Reveal delay={0.12} className="flex justify-center lg:justify-end">
            <div className="scale-[0.8] sm:scale-90 lg:scale-100">
              <InteractivePhone
                screens={screensById("home")}
                initialScreen="home"
                width={300}
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
