import InteractivePhone from "@/components/phone/InteractivePhone";
import Reveal from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { screensById } from "@/lib/content";
import { WAITLIST_ENABLED } from "@/lib/flags";
import { FormularioWaitlistDiferido } from "@/components/forms/Diferidos";
import BotonWhatsApp from "@/components/site/BotonWhatsApp";

/**
 * Descarga.
 *
 * La aplicación todavía no está publicada, y aquí no hay ningún enlace a una
 * tienda: inventar una URL sería enviar a la gente a una página que no existe.
 * Lo que hay es una declaración de dónde estará, escrita con nuestras palabras
 * y no con las de Apple o Google — el porqué está más abajo, junto a la pieza.
 *
 * El formulario llega por `components/forms/Diferidos`, que lo mantiene en un
 * paquete aparte: con el interruptor apagado no se descarga nada de él. El
 * porqué, y los dos caminos que no funcionaron, están documentados allí.
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

            {/* LOS DISTINTIVOS OFICIALES SE RETIRARON, Y NO POR ESTÉTICA.
                El de Apple dice «Download on the App Store» y el de Google «GET
                IT ON Google Play»: los dos afirman, con la voz de la tienda, que
                la aplicación se puede descargar. No se puede — todavía no está
                publicada—, y apagarlos al 55 % en escala de grises no desmiente
                lo que la propia imagen dice. Se sustituyen por una pieza propia
                que dice lo que hay.
                Tampoco se redibujan sus logotipos: una marca ajena modificada
                para fabricar un distintivo que ellos no han emitido sería peor
                que el problema que arregla. Aquí sólo se nombra la plataforma. */}
            <div className="mt-10">
              <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-paper-mute">
                Estará disponible en
              </p>

              <ul className="mt-4 flex flex-wrap items-center gap-3">
                {[
                  { plataforma: "iOS", nota: "iPhone y iPad" },
                  { plataforma: "Android", nota: "Teléfonos y tabletas" },
                ].map(({ plataforma, nota }) => (
                  <li
                    key={plataforma}
                    className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3"
                  >
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-signal" />
                    <span className="leading-tight">
                      <span className="block text-[15px] font-bold text-paper">
                        Próximamente en {plataforma}
                      </span>
                      <span className="block text-[13px] text-paper-mute">{nota}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Aquí irá la lista de espera. Mientras el interruptor esté apagado no
                se pinta ningún campo: un formulario que no puede guardar nada, ni
                confirmar por correo, ni declarar en una política de privacidad qué
                hace con el dato, engañaría a quien lo rellena. Se dice lo que hay y
                se ofrece la puerta que sí existe. */}
            {WAITLIST_ENABLED ? (
              <div className="mt-10">
                <FormularioWaitlistDiferido origen="descarga" />
              </div>
            ) : (
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
