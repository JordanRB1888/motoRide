"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Logo from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { NAV, STORES } from "@/lib/content";

/** El botón no promete una descarga mientras la app no esté publicada. */
const CTA = STORES.available ? "Descargar app" : "Conoce la app";

export default function Navbar() {
  const [lifted, setLifted] = useState(false);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Con el menú abierto, el fondo no debe desplazarse bajo él.
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  // Si la ventana crece hasta el menú de escritorio, el panel sobra.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* El panel es opaco y cubre la pantalla: mientras esté abierto, el teclado no
     puede salirse a los botones que quedan debajo. Se lleva el foco dentro al
     abrir, se cicla el tabulador y se devuelve a la hamburguesa al cerrar. */
  useEffect(() => {
    if (!open) return;
    const caja = panel.current;
    if (!caja) return;

    const enfocables = () =>
      Array.from(
        caja.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

    enfocables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const lista = enfocables();
      if (!lista.length) return;
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      const activo = document.activeElement;
      if (e.shiftKey && (activo === primero || !caja.contains(activo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      boton.current?.focus();
    };
  }, [open]);

  return (
    <>
      <header
        className={[
          "fixed inset-x-0 top-0 z-[100] transition-[background-color,border-color,backdrop-filter] duration-300 ease-out",
          lifted || open
            ? "border-b border-white/10 bg-ink-900/88 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent",
        ].join(" ")}
      >
        <nav
          aria-label="Principal"
          className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-6 px-[var(--shell-x)]"
        >
          <Logo width={150} />

          <ul className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-[44px] items-center rounded-full px-4 text-[15px] text-paper-dim transition-colors duration-150 hover:bg-white/[0.07] hover:text-paper"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <ButtonLink href="/#descargar" className="whitespace-nowrap">
                {CTA}
              </ButtonLink>
            </div>

            <button
              ref={boton}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="menu-movil"
              aria-label={open ? "Cerrar menú" : "Abrir menú"}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/18 text-paper transition-colors duration-150 hover:border-white/40 lg:hidden"
            >
              <span className="relative block h-3.5 w-5">
                <span
                  className="absolute left-0 block h-[2px] w-full rounded bg-current transition-transform duration-300 ease-out"
                  style={{
                    transform: open
                      ? "translateY(6px) rotate(45deg)"
                      : "translateY(0) rotate(0)",
                  }}
                />
                <span
                  className="absolute left-0 top-3 block h-[2px] w-full rounded bg-current transition-transform duration-300 ease-out"
                  style={{
                    transform: open
                      ? "translateY(-6px) rotate(-45deg)"
                      : "translateY(0) rotate(0)",
                  }}
                />
              </span>
            </button>
          </div>
        </nav>
      </header>

      {/* El panel vive FUERA del <header> a propósito: el header lleva
          `backdrop-blur` al abrirse y un backdrop-filter convierte al elemento en
          bloque contenedor de sus descendientes `fixed` — dentro, `top-72 bottom-0`
          se resolvía contra los 72px de la cabecera y el menú medía cero de alto.
          Como hermano, su bloque contenedor vuelve a ser la ventana. */}
      <div
        ref={panel}
        id="menu-movil"
        hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        className="fixed inset-x-0 top-[72px] bottom-0 z-[90] overflow-y-auto bg-ink-900 lg:hidden"
      >
        {/* Los enlaces llevan la voz tipográfica de la marca, no una lista de sistema. */}
        <ul className="flex flex-col px-[var(--shell-x)] pt-6">
          {NAV.map((item, i) => (
            <li key={item.href} className="border-b border-white/8">
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="display block py-6 text-[clamp(2.4rem,11vw,3.4rem)] text-paper transition-colors duration-150 hover:text-signal"
                style={{
                  opacity: open ? 1 : 0,
                  transform: open ? "translateY(0)" : "translateY(14px)",
                  transition: `opacity .4s ease ${i * 0.045 + 0.05}s, transform .5s cubic-bezier(.16,1,.3,1) ${i * 0.045 + 0.05}s, color .15s ease`,
                }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="px-[var(--shell-x)] py-8">
          <ButtonLink
            href="/#descargar"
            size="lg"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            {CTA}
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
