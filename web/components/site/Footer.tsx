import Link from "next/link";
import Logo from "@/components/ui/Logo";
import { PIE_GRUPOS, PAYMENTS } from "@/lib/content";
import { EMAIL, WHATSAPP, correo, whatsapp } from "@/lib/contact";

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

            {/* Los canales, arriba del todo de la columna de marca: son lo que
                alguien busca en un pie cuando no ha encontrado cómo escribir. */}
            <div className="mt-8 flex flex-col gap-3">
              {WHATSAPP.activo && (
                <a
                  href={whatsapp("general")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-2.5 text-[16px] font-bold text-paper transition-colors duration-150 hover:text-signal"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden className="shrink-0">
                    <path
                      fill="currentColor"
                      d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2.05 22l5.3-1.38a9.87 9.87 0 0 0 4.69 1.19h.01c5.45 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2Zm0 18.05h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.81.83-3.03-.2-.31a8.17 8.17 0 0 1-1.26-4.39c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.24-8.24 8.24Zm4.52-6.17c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.48-.4-.42-.55-.43h-.47c-.16 0-.43.06-.65.31-.22.24-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.73 2.64 4.2 3.7.59.26 1.04.41 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z"
                    />
                  </svg>
                  {WHATSAPP.visible}
                  <span className="sr-only"> (abre WhatsApp)</span>
                </a>
              )}
              {EMAIL.activo && (
                <a
                  href={correo("general")}
                  className="w-fit break-all text-[16px] text-paper-dim transition-colors duration-150 hover:text-signal"
                >
                  {EMAIL.direccion}
                </a>
              )}
            </div>
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
