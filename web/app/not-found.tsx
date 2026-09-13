import Link from "next/link";
import Logo from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";

/**
 * La página que ve quien llega a una dirección que no existe.
 *
 * Antes era la de fábrica de Next: fondo blanco, en inglés, sin marca y con un
 * solo enlace en toda la página — un callejón sin salida en el sitio cuyo
 * problema declarado era justamente ese.
 *
 * Va deliberadamente ligera: sin scroll suave, sin GSAP, sin mapa y sin la barra
 * de navegación. Quien cae aquí llega por un enlace roto o un error de tecleo y
 * lo único que necesita es una salida rápida.
 *
 * No exporta `metadata`: Next no la admite en `not-found` y hacerlo rompía la
 * hidratación (error 418 de React). El 404 ya impide por sí solo que se indexe.
 */
const SALIDAS = [
  { href: "/servicios", label: "Servicios" },
  { href: "/conductores", label: "Conductores" },
  { href: "/aliados", label: "Aliados" },
  { href: "/ayuda", label: "Ayuda" },
  { href: "/contacto", label: "Contacto" },
];

export default function NotFound() {
  return (
    <main
      id="contenido"
      className="relative isolate grid min-h-[100svh] place-items-center overflow-hidden px-[var(--shell-x)] py-20"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(110% 70% at 76% -14%, rgba(252,176,0,.13) 0%, rgba(252,176,0,0) 60%)," +
            "linear-gradient(180deg,#0f0f12 0%,#0b0b0c 100%)",
        }}
      />

      <div className="w-full max-w-[720px]">
        {/* Logo ya es un enlace a la portada: envolverlo en otro <Link> metía un
            <a> dentro de otro <a>, el navegador rehacía el árbol y la hidratación
            fallaba con el error 418 de React. */}
        <Logo width={150} />

        <p className="tabular mt-14 text-[13px] font-bold uppercase tracking-[0.24em] text-signal">
          Error 404
        </p>

        <h1 className="display mt-4 text-[clamp(2.8rem,9vw,5.4rem)] text-paper">
          Esta página <span className="text-signal">no existe</span>
        </h1>

        <p className="prose-measure mt-6 text-[clamp(1rem,2.2vw,1.2rem)] leading-relaxed text-paper-dim">
          El enlace que seguiste está roto o la dirección se escribió con algún
          carácter de más. No es culpa tuya, y desde aquí se sale rápido.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ButtonLink href="/" size="lg">
            Volver al inicio
          </ButtonLink>
          <ButtonLink href="/contacto" size="lg" variant="outline">
            Hablar con el equipo
          </ButtonLink>
        </div>

        <nav aria-label="Secciones del sitio" className="mt-12 border-t border-white/10 pt-7">
          <ul className="flex flex-wrap gap-x-7 gap-y-3">
            {SALIDAS.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="text-[16px] text-paper-dim transition-colors duration-150 hover:text-signal"
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
