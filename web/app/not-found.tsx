import type { Metadata } from "next";
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
 * SOBRE LOS METADATOS
 *
 * Antes no exportaba ninguno, y el resultado era que esta página heredaba el
 * título de la portada —«+58Express — Mototaxi, delivery y envíos en
 * Maracaibo»— y su `canonical`, además de quedarse con DOS `<meta name="robots">`
 * contradictorios en la misma cabecera: el `noindex` que pone Next para un 404 y
 * el `index, follow` que hereda del layout.
 *
 * El estado 404 ya impide la indexación por sí solo, así que el daño era
 * cosmético; pero un título de error que se llama como la portada confunde en la
 * pestaña y en el historial, y dos directivas opuestas son justo el detalle que
 * una auditoría externa señala.
 *
 * Se declara aquí lo justo: título propio y una sola directiva. `alternates` se
 * deja vacío a propósito para no arrastrar la canónica de la portada.
 */
export const metadata: Metadata = {
  /* `absolute` y no una cadena suelta: el layout define
     `title.template = "%s · +58Express"`, y sin esto el título salía duplicado
     —«Esta página no existe · +58Express · +58Express»—. */
  title: { absolute: "Esta página no existe · +58Express" },
  description: "La dirección que buscas no está en mas58express.com.",
  /* Sólo `index: false`, para que el valor coincida exactamente con el `noindex`
     que Next emite por su cuenta en cualquier 404. No se puede suprimir el suyo
     sin `experimental.globalNotFound`, que es experimental y obligaría a
     rehacer aquí las fuentes, los estilos y el <html> entero: no compensa por
     una etiqueta repetida. Lo que sí se ha quitado es la contradicción — antes
     convivían `noindex` y el `index, follow` heredado del layout. */
  robots: { index: false },
  alternates: { canonical: null },
};
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
