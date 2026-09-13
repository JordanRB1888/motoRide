import Link from "next/link";

/**
 * A dónde seguir desde aquí.
 *
 * POR QUÉ HACÍA FALTA
 *
 * La auditoría encontró que `/servicios`, `/conductores`, `/aliados`,
 * `/seguridad` y `/nosotros` tenían **cero enlaces internos** dentro del
 * contenido. Se entraba y se salía: ni la persona tenía a dónde seguir, ni un
 * buscador podía entender cómo se relacionan las páginas entre sí. El pie enlaza
 * a todas, pero un enlace de pie pesa poco y se lee menos.
 *
 * Los rótulos son descriptivos a propósito —«Cómo funciona para quien pide» y no
 * «leer más»—: el texto del enlace es lo que le dice al buscador de qué trata el
 * destino, y a quien usa un lector de pantalla, si merece la pena ir.
 */
export default function SiguienteLectura({
  titulo = "Sigue por aquí",
  enlaces,
}: {
  titulo?: string;
  enlaces: { href: string; rotulo: string; nota: string }[];
}) {
  return (
    <nav aria-labelledby="siguiente-lectura" className="border-t border-white/10 pt-10">
      <h2
        id="siguiente-lectura"
        className="text-[13px] font-bold uppercase tracking-[0.22em] text-paper-mute"
      >
        {titulo}
      </h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {enlaces.map((e) => (
          <li key={e.href}>
            <Link
              href={e.href}
              className="group flex h-full flex-col rounded-[var(--radius-card)] border border-white/10 bg-ink-850 p-6 transition-colors duration-150 hover:border-signal/45 hover:bg-white/[0.04]"
            >
              <span className="text-[17px] font-bold leading-snug text-paper transition-colors duration-150 group-hover:text-signal">
                {e.rotulo}
              </span>
              <span className="mt-2 text-[15px] leading-relaxed text-paper-dim">{e.nota}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
