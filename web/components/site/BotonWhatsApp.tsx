"use client";

import { ButtonLink } from "@/components/ui/Button";
import { WHATSAPP, whatsapp, type Intencion } from "@/lib/contact";
import { EVENTO_WHATSAPP, medir } from "@/lib/analitica";

type Props = {
  intencion: Intencion;
  children: React.ReactNode;
  variant?: "signal" | "outline" | "quiet";
  size?: "md" | "lg";
  className?: string;
};

/**
 * Botón que abre WhatsApp con el mensaje de su intención ya escrito.
 *
 * Existe como componente por dos razones que se repetirían mal a mano: que el
 * canal se apague desde un solo sitio si algún día cambia el número, y que quien
 * navega con lector de pantalla oiga que el enlace se va a otra aplicación —el
 * rótulo visible dice «Hablar con el equipo», que por sí solo no lo delata.
 *
 * Se abre en una pestaña nueva a propósito: en el móvil salta a la aplicación de
 * WhatsApp y en el escritorio a WhatsApp Web, y en los dos casos la persona
 * vuelve al sitio con sólo cerrar.
 */
export default function BotonWhatsApp({
  intencion,
  children,
  variant = "signal",
  size = "lg",
  className = "",
}: Props) {
  if (!WHATSAPP.activo) return null;

  return (
    <ButtonLink
      href={whatsapp(intencion)}
      variant={variant}
      size={size}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        medir(EVENTO_WHATSAPP[intencion], {
          origen: typeof window === "undefined" ? undefined : window.location.pathname,
        })
      }
    >
      <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden className="shrink-0">
        <path
          fill="currentColor"
          d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2.05 22l5.3-1.38a9.87 9.87 0 0 0 4.69 1.19h.01c5.45 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2Zm0 18.05h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.81.83-3.03-.2-.31a8.17 8.17 0 0 1-1.26-4.39c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.24-8.24 8.24Zm4.52-6.17c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.48-.4-.42-.55-.43h-.47c-.16 0-.43.06-.65.31-.22.24-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.73 2.64 4.2 3.7.59.26 1.04.41 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z"
        />
      </svg>
      {children}
      <span className="sr-only"> (abre WhatsApp)</span>
    </ButtonLink>
  );
}
