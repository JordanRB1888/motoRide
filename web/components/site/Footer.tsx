import Link from "next/link";
import EnlaceCorreo from "@/components/site/EnlaceCorreo";
import RedesSociales from "@/components/site/RedesSociales";
import Logo from "@/components/ui/Logo";
import { PIE_GRUPOS, PAYMENTS } from "@/lib/content";
import { EMAIL } from "@/lib/contact";

const LEGAL = [
  { label: "Privacidad", href: "/privacidad" },
  { label: "Términos", href: "/terminos" },
];

/**
 * El pie, convertido en el centro institucional del sitio.
 *
 * Antes listaba navegación y formas de pago, y nada más: el sitio entero no tenía
 * un solo canal por el que hablar con la empresa. Ahora los canales van aquí,
 * visibles desde cualquiera de las páginas, porque el pie es donde la gente los
 * busca cuando la página no se los ha ofrecido antes.
 */
export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink-900">
      <div className="mx-auto max-w-[1440px] px-[var(--shell-x)] py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)] lg:gap-20">
          <div>
            <Logo width={168} />
            <p className="prose-measure mt-6 text-[16px] leading-relaxed text-paper-dim">
              Movilidad y servicios bajo demanda en Venezuela. Pide tu moto, manda un
              envío o recibe lo que necesites, siguiendo cada paso en el mapa.
            </p>
            <p className="mt-6 text-[15px] text-paper-mute">
              Maracaibo y Municipio Mara, estado Zulia.
            </p>

            {/* El correo, arriba del todo de la columna de marca. WhatsApp ya no
                va aquí: es el botón flotante de abajo a la derecha, visible en
                todas las páginas sin bajar hasta el pie. */}
            <div className="mt-8 flex flex-col gap-3">
              {EMAIL.activo && (
                <EnlaceCorreo className="w-fit break-all text-[16px] text-paper-dim transition-colors duration-150 hover:text-signal" />
              )}
            </div>

            {/* Las redes, justo debajo de los canales directos y no en una
                columna aparte: quien baja hasta aquí busca «cómo les escribo», y
                WhatsApp, correo y redes son respuestas a la misma pregunta. */}
            <RedesSociales origen="footer" className="mt-8" />
          </div>

          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {PIE_GRUPOS.map((grupo) => (
              <nav key={grupo.titulo} aria-label={grupo.titulo}>
                <h2 className="text-[13px] font-bold uppercase tracking-[0.22em] text-paper-mute">
                  {grupo.titulo}
                </h2>
                <ul className="mt-5 flex flex-col gap-3">
                  {grupo.enlaces.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="text-[16px] text-paper-dim transition-colors duration-150 hover:text-signal"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}

            <div>
              <h2 className="text-[13px] font-bold uppercase tracking-[0.22em] text-paper-mute">
                Formas de pago
              </h2>
              <ul className="mt-5 flex flex-col gap-3">
                {PAYMENTS.map((p) => (
                  <li key={p} className="text-[16px] text-paper-dim">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-5 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-paper-mute">
            © {new Date().getFullYear()} +58Express. Todos los derechos reservados.
          </p>
          <ul className="flex flex-wrap gap-6">
            {LEGAL.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-[14px] text-paper-mute transition-colors duration-150 hover:text-paper"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
