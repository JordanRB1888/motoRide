"use client";

import type { ReactNode } from "react";
import { EMAIL, correo, type Intencion } from "@/lib/contact";
import { medir } from "@/lib/analitica";

/**
 * El enlace al correo, medido.
 *
 * POR QUÉ EXISTE
 *
 * `contacto_abierto` estaba declarado entre los eventos desde la Fase 1-B y no
 * se disparaba en ningún sitio: un evento muerto que habría aparecido vacío en
 * el panel para siempre. WhatsApp sí se medía —cada intención con su evento—,
 * así que el único canal de contacto sin contar era éste.
 *
 * Hace falta un componente de cliente porque las tres páginas que enseñan el
 * correo (`/contacto`, el pie y la puerta de llamada a la acción) se renderizan
 * en el servidor, y un `onClick` no puede vivir ahí.
 *
 * Y se centraliza por la misma razón que `BotonWhatsApp`: para que el día que
 * cambie la dirección —o haya que apagar el canal— se toque un solo fichero.
 *
 * NO VIAJA NINGÚN DATO PERSONAL: sólo desde qué ruta se pulsó. Ni la dirección
 * de destino, que además es la misma para todo el mundo y por tanto no
 * identifica a nadie.
 */
export default function EnlaceCorreo({
  intencion = "general",
  className = "",
  children,
}: {
  intencion?: Intencion;
  className?: string;
  children?: ReactNode;
}) {
  if (!EMAIL.activo) return null;

  return (
    <a
      href={correo(intencion)}
      className={className}
      onClick={() =>
        medir("contacto_abierto", {
          origen: typeof window === "undefined" ? undefined : window.location.pathname,
        })
      }
    >
      {children ?? EMAIL.direccion}
    </a>
  );
}
