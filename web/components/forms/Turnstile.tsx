"use client";

import Script from "next/script";
import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opciones: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

/**
 * Widget de Cloudflare Turnstile.
 *
 * Lo que produce aquí es un testigo, y ese testigo **no autoriza nada por sí
 * solo**: la ruta lo verifica contra Cloudflare desde el servidor antes de tocar
 * el almacén. Si este componente fallara, o alguien lo saltara enviando el
 * formulario con `curl`, el servidor rechazaría igual.
 *
 * Se eligió Turnstile y no un CAPTCHA clásico porque no hace resolver puzzles
 * —que excluyen a quien no ve bien o navega con teclado— y porque recoge menos
 * datos del visitante.
 *
 * Sin clave pública no se pinta nada: el formulario que lo usa comprueba antes
 * que esté configurado.
 */
export default function Turnstile({
  onTestigo,
}: {
  onTestigo: (testigo: string) => void;
}) {
  const clave = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const contenedor = useRef<HTMLDivElement>(null);
  const [listo, setListo] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!listo || !clave || !contenedor.current || !window.turnstile) return;
    const widget = window.turnstile.render(contenedor.current, {
      sitekey: clave,
      theme: "dark",
      language: "es",
      callback: (testigo: string) => onTestigo(testigo),
      "error-callback": () => onTestigo(""),
      "expired-callback": () => onTestigo(""),
    });
    return () => {
      try {
        window.turnstile?.remove(widget);
      } catch {
        /* el widget ya no existe */
      }
    };
  }, [listo, clave, onTestigo]);

  if (!clave) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="lazyOnload"
        onLoad={() => setListo(true)}
      />
      <div ref={contenedor} id={`turnstile-${id}`} className="min-h-[65px]" />
    </>
  );
}

/** ¿Está configurado el lado del navegador? El servidor comprueba el suyo aparte. */
export function turnstileDisponible(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}
