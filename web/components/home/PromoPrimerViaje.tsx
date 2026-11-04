import Image from "next/image";
import Reveal from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { STORES } from "@/lib/content";

/**
 * Promoción de lanzamiento: el primer viaje, gratis, solo para cuentas nuevas
 * (decisión del dueño, noviembre de 2026). La condición va escrita junto a la
 * oferta, no escondida: «gratis» sin decir para quién sería una promesa que
 * la app no cumple a quien ya tiene cuenta.
 *
 * La foto es la mitad sin texto de la pieza de campaña del carro y la moto; el
 * titular va en HTML para que se lea en cualquier pantalla y se pueda cambiar.
 */
export default function PromoPrimerViaje() {
  return (
    <section aria-labelledby="promo-titulo" className="relative isolate border-t border-white/8 bg-ink-950 py-20 sm:py-24">
      <div className="mx-auto max-w-[1440px] px-[var(--shell-x)]">
        <div className="grid items-center overflow-hidden rounded-[var(--radius-card)] border border-white/10 bg-white/[0.03] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Reveal className="p-8 sm:p-12">
            <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-signal">
              Solo para usuarios nuevos
            </p>
            <h2 id="promo-titulo" className="display mt-4 text-[clamp(2.4rem,6vw,4.2rem)] text-paper">
              Tu primer viaje,
              <br />
              <span className="text-signal">totalmente gratis</span>
            </h2>
            <p className="prose-measure mt-5 text-[17px] leading-relaxed text-paper-dim">
              Descarga +58Express, crea tu cuenta y tu primera carrera no te cuesta nada.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {STORES.google ? (
                <ButtonLink href={STORES.google} size="lg" target="_blank" rel="noopener noreferrer">
                  Descargar en Google Play
                </ButtonLink>
              ) : null}
              <ButtonLink href="/#descargar" size="lg" variant="outline">
                Ver cómo descargar
              </ButtonLink>
            </div>
            <p className="mt-6 text-[13px] leading-relaxed text-paper-mute">
              Válido solo para la primera carrera de cuentas nuevas en +58Express.
            </p>
          </Reveal>
          <div className="relative aspect-[1054/887] w-full lg:h-full lg:aspect-auto lg:min-h-[440px]">
            <Image
              src="/photo/promo-primer-viaje.webp"
              alt="Un carro y una moto de +58Express de noche en la ciudad"
              fill
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="object-cover object-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
