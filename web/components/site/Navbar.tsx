"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Logo from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { NAV } from "@/lib/content";

export default function Navbar() {
  const [lifted, setLifted] = useState(false);
  const [open, setOpen] = useState(false);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
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
                className="rounded-full px-4 py-2.5 text-[15px] text-paper-dim transition-colors duration-150 hover:bg-white/[0.07] hover:text-paper"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ButtonLink href="/#descargar" className="whitespace-nowrap">
              Descargar app
            </ButtonLink>
          </div>

          <button
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

      {/* Menú móvil: los enlaces llevan la voz tipográfica de la marca,
          no una lista de sistema. */}
      <div
        id="menu-movil"
        hidden={!open}
        className="fixed inset-x-0 top-[72px] bottom-0 overflow-y-auto bg-ink-900 lg:hidden"
      >
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
            Descargar app
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
