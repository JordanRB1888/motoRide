import EnlaceWhatsApp from "@/components/site/EnlaceWhatsApp";
import { WHATSAPP } from "@/lib/contact";

/**
 * Botón de WhatsApp fijo abajo a la derecha, en todas las páginas (decisión del
 * dueño, 03/11/2026). Sustituye al número que antes se leía en el pie: abre el
 * chat con el número de la empresa y el mensaje general ya escrito.
 *
 * Sólo el icono, en el verde de WhatsApp, que es lo que la gente reconoce sin
 * leer. El rótulo para lector de pantalla lo pone `EnlaceWhatsApp`.
 */
export default function WhatsAppFlotante() {
  if (!WHATSAPP.activo) return null;

  return (
    <EnlaceWhatsApp
      intencion="general"
      className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-[90] grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_10px_28px_-6px_rgba(0,0,0,.65),0_0_0_1px_rgba(255,255,255,.12)] transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal sm:bottom-7 sm:right-7 sm:size-16"
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-7 sm:size-8">
        <path
          fill="currentColor"
          d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2.05 22l5.3-1.38a9.87 9.87 0 0 0 4.69 1.19h.01c5.45 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2Zm0 18.05h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.81.83-3.03-.2-.31a8.17 8.17 0 0 1-1.26-4.39c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.24-8.24 8.24Zm4.52-6.17c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.48-.4-.42-.55-.43h-.47c-.16 0-.43.06-.65.31-.22.24-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.73 2.64 4.2 3.7.59.26 1.04.41 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z"
        />
      </svg>
      <span className="sr-only">Escríbenos por WhatsApp al {WHATSAPP.visible}</span>
    </EnlaceWhatsApp>
  );
}
