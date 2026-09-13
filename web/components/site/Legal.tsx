import { Fragment, type ReactNode } from "react";
import Reveal from "@/components/motion/Reveal";

/**
 * Las piezas con las que se arman los dos documentos legales.
 *
 * POR QUÉ UN COMPONENTE Y NO ESCRIBIRLO A MANO EN CADA PÁGINA
 *
 * Un documento legal se lee distinto que el resto del sitio: nadie lo lee entero
 * de arriba abajo. Se llega buscando una cosa concreta —«cómo borro mis datos»,
 * «quién es el responsable»— y hay que encontrarla rápido. De ahí el índice con
 * anclas, la numeración visible y las secciones con identificador estable: una
 * cláusula concreta se puede enlazar y citar.
 *
 * Y hay una razón de honestidad: dos documentos con la misma tipografía se
 * comparan mejor, y cuando uno diga algo distinto del otro se notará.
 */

export function IndiceLegal({
  secciones,
}: {
  secciones: { id: string; titulo: string }[];
}) {
  return (
    <Reveal>
      <nav
        aria-labelledby="indice-legal"
        className="rounded-[var(--radius-card)] border border-white/10 bg-ink-850 p-6 sm:p-8"
      >
        <h2
          id="indice-legal"
          className="text-[13px] font-bold uppercase tracking-[0.22em] text-paper-mute"
        >
          Contenido
        </h2>
        <ol className="mt-5 grid gap-x-10 gap-y-2.5 sm:grid-cols-2">
          {secciones.map((s, i) => (
            <li key={s.id} className="flex gap-3 text-[15px] leading-relaxed">
              <span className="shrink-0 tabular-nums text-paper-mute">{i + 1}.</span>
              <a
                href={`#${s.id}`}
                className="text-paper-dim transition-colors duration-150 hover:text-signal"
              >
                {s.titulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </Reveal>
  );
}

export function SeccionLegal({
  id,
  numero,
  titulo,
  children,
}: {
  id: string;
  numero: number;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <Reveal>
      {/* `scroll-mt` para que el ancla no deje el título debajo de la barra fija. */}
      <section id={id} className="scroll-mt-28 border-t border-white/10 pt-10">
        <h2 className="flex gap-4 text-[clamp(1.25rem,2.6vw,1.6rem)] font-bold leading-snug text-paper">
          <span className="tabular-nums text-signal">{numero}.</span>
          <span>{titulo}</span>
        </h2>
        <div className="mt-5 flex flex-col gap-4">{children}</div>
      </section>
    </Reveal>
  );
}

/** Un subtítulo dentro de una sección. `h3`, para no romper el orden de encabezados. */
export function SubLegal({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-2 text-[17px] font-bold leading-snug text-paper">{children}</h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="prose-measure text-[16px] leading-relaxed text-paper-dim">{children}</p>;
}

export function ListaLegal({ children }: { children: ReactNode }) {
  return (
    <ul className="prose-measure flex flex-col gap-2.5 text-[16px] leading-relaxed text-paper-dim">
      {children}
    </ul>
  );
}

export function Item({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-[0.62em] h-[5px] w-[5px] shrink-0 rounded-full bg-signal" />
      <span>{children}</span>
    </li>
  );
}

/**
 * Una tabla que en el móvil deja de ser tabla.
 *
 * Una tabla de cuatro columnas en 360 px o se sale de la pantalla o se vuelve
 * ilegible. Aquí cada fila se convierte en un bloque con sus etiquetas, que es
 * lo mismo que hace un lector de pantalla y se lee igual de bien.
 */
export function TablaLegal({
  cabeceras,
  filas,
  resumen,
}: {
  cabeceras: string[];
  filas: ReactNode[][];
  resumen: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="hidden w-full border-collapse text-left text-[15px] sm:table">
        <caption className="sr-only">{resumen}</caption>
        <thead>
          <tr>
            {cabeceras.map((c) => (
              <th
                key={c}
                scope="col"
                className="border-b border-white/15 py-3 pr-6 text-[13px] font-bold uppercase tracking-[0.16em] text-paper-mute"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((celda, j) => (
                <td
                  key={j}
                  className={`border-b border-white/8 py-4 pr-6 align-top leading-relaxed ${
                    j === 0 ? "font-bold text-paper" : "text-paper-dim"
                  }`}
                >
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Cada tarjeta es su propia `<dl>`, con `<dt>`/`<dd>` como hijos directos.
          Envolver los pares en `<div>` dentro de una única `<dl>` rompe la lista
          de definición: un lector de pantalla deja de emparejar etiqueta y valor,
          y axe lo marca como infracción seria. */}
      <div className="flex flex-col gap-5 sm:hidden">
        {filas.map((fila, i) => (
          <dl key={i} className="rounded-[var(--radius-card)] border border-white/10 p-5">
            {fila.map((celda, j) => (
              <Fragment key={j}>
                <dt
                  className={`text-[12px] font-bold uppercase tracking-[0.16em] text-paper-mute ${
                    j === 0 ? "" : "mt-3"
                  }`}
                >
                  {cabeceras[j]}
                </dt>
                <dd
                  className={`mt-1 text-[15px] leading-relaxed ${
                    j === 0 ? "font-bold text-paper" : "text-paper-dim"
                  }`}
                >
                  {celda}
                </dd>
              </Fragment>
            ))}
          </dl>
        ))}
      </div>
    </div>
  );
}

/** El aviso de cuándo se actualizó. Va arriba: es lo primero que se comprueba. */
export function Vigencia({ fecha, version }: { fecha: string; version: string }) {
  return (
    <Reveal>
      <div className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-signal/30 bg-signal/[0.05] px-6 py-5">
        <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-signal">
          En vigor desde {fecha}
        </p>
        <p className="text-[15px] leading-relaxed text-paper-dim">Versión {version}</p>
      </div>
    </Reveal>
  );
}
