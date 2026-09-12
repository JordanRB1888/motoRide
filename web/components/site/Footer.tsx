import Link from "next/link";
import Logo from "@/components/ui/Logo";
import { NAV, PAYMENTS } from "@/lib/content";

const LEGAL = [
  { label: "Privacidad", href: "/privacidad" },
  { label: "Términos", href: "/terminos" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink-900">
      <div className="mx-auto max-w-[1440px] px-[var(--shell-x)] py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20">
          <div>
            <Logo width={168} />
            <p className="prose-measure mt-6 text-[16px] leading-relaxed text-paper-dim">
              Movilidad y servicios bajo demanda en Venezuela. Pide tu moto, manda un
              envío o recibe lo que necesites, siguiendo cada paso en el mapa.
            </p>
            <p className="mt-6 text-[15px] text-paper-mute">
              Maracaibo y Municipio Mara, estado Zulia.
            </p>
          </div>

          <div className="grid gap-10 sm:grid-cols-2">
            <nav aria-label="Pie de página">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.22em] text-paper-mute">
                Navegación
              </h2>
              <ul className="mt-5 flex flex-col gap-3">
                {NAV.map((item) => (
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
