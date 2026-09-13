"use client";

import type { ReactNode } from "react";
import { WHATSAPP, whatsapp, type Intencion } from "@/lib/contact";
import { EVENTO_WHATSAPP, medir } from "@/lib/analitica";

/**
 * WhatsApp como enlace de texto, medido.
 *
 * POR QUÉ EXISTE, HABIENDO YA UN `BotonWhatsApp`
 *
 * Porque hay dos formas visuales del mismo canal: el botón grande de las
 * llamadas a la acción y el enlace de texto —el número en el pie, el número
 * grande de `/contacto`—. Aquéllos se medían; éstos eran `<a>` sueltos y **no
 * disparaban nada**. Durante tres rondas, cada vez que alguien escribía desde el
 * pie, el embudo no se enteraba.
 *
 * Podría haberse resuelto añadiéndole una variante «sin botón» a `BotonWhatsApp`,
 * pero aquél envuelve un `ButtonLink` con su tamaño, su relleno y su borde, y
 * desactivarlo todo para pintar un enlace de texto habría dejado un componente
 * que hace dos cosas a medias. Esto hace una sola y comparte lo que importa: el
 * número y el mapa de eventos.
 *
 * No cambia nada visualmente: recibe las clases de quien lo usa.
 */
export default function EnlaceWhatsApp({
  intencion = "general",
  className = "",
  children,
}: {
  intencion?: Intencion;
  className?: string;
  children?: ReactNode;
}) {
  if (!WHATSAPP.activo) return null;

  return (
    <a
      href={whatsapp(intencion)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() =>
        medir(EVENTO_WHATSAPP[intencion], {
          origen: typeof window === "undefined" ? undefined : window.location.pathname,
        })
      }
    >
      {children ?? WHATSAPP.visible}
      {/* El rótulo visible es un número: por sí solo no dice que salta a otra
          aplicación. Quien navega con lector de pantalla merece saberlo. */}
      <span className="sr-only"> (abre WhatsApp)</span>
    </a>
  );
}
