"use client";

import { REDES_ACTIVAS, REDES_SOCIALES, type RedSocial } from "@/lib/contact";
import { medir, type Evento } from "@/lib/analitica";

/**
 * Las redes oficiales de +58Express.
 *
 * UNA SOLA FUENTE. Las direcciones viven en `lib/contact.ts` y este componente
 * las pinta. El pie y `/contacto` usan el mismo, así que el día que una cuenta
 * cambie de nombre se toca un sitio y no tres.
 *
 * POR QUÉ EL ICONO VA DENTRO DE UN CÍRCULO
 *
 * Los tres logotipos no pesan lo mismo: el de Facebook es un disco macizo y el
 * de Instagram es una cámara de trazo fino. Puestos sueltos uno al lado del otro,
 * Facebook domina la fila. El círculo les da a los tres el mismo marco y la
 * misma superficie, y de paso resuelve el tamaño táctil: 44 px, que es el mínimo
 * cómodo con el pulgar.
 *
 * QUÉ SE MIDE: la red y el sitio desde el que se pulsó. Ni el usuario de la
 * cuenta, ni el identificador largo de Facebook, ni la URL entera.
 */

const EVENTO: Record<RedSocial, Evento> = {
  tiktok: "social_tiktok",
  instagram: "social_instagram",
  facebook: "social_facebook",
};

/* Trazados de Simple Icons: son los oficiales de cada marca y forman una familia
   coherente entre sí, que es lo que evita que uno desentone al lado de otro. */
const ICONO: Record<RedSocial, string> = {
  tiktok:
    "M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z",
  instagram:
    "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 01-2.88 0 1.44 1.44 0 012.88 0z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
};

export default function RedesSociales({
  origen,
  titulo,
  className = "",
}: {
  /** Dónde está pintado. Es lo único que viaja con el evento. */
  origen: "footer" | "contacto";
  /** Rótulo visible encima. Si se omite, la lista lleva sólo `aria-label`. */
  titulo?: string;
  className?: string;
}) {
  if (REDES_ACTIVAS.length === 0) return null;

  return (
    <div className={className}>
      {titulo && (
        <h2 className="text-[13px] font-bold uppercase tracking-[0.22em] text-paper-mute">
          {titulo}
        </h2>
      )}
      <ul
        aria-label={titulo ? undefined : "Redes sociales de +58Express"}
        className={`flex flex-wrap items-center gap-3 ${titulo ? "mt-5" : ""}`}
      >
        {REDES_ACTIVAS.map((red) => {
          const { nombre, url } = REDES_SOCIALES[red];
          return (
            <li key={red}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                /* El nombre accesible lo da el `aria-label`, porque el enlace no
                   tiene texto visible. Se dice también que abre fuera: quien
                   navega con lector de pantalla no ve el icono de red social y
                   merece saber que va a salir del sitio. */
                aria-label={`${nombre} de +58Express (se abre en una pestaña nueva)`}
                onClick={() => medir(EVENTO[red], { origen })}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-paper-dim transition-[color,background-color,border-color,transform] duration-150 ease-out hover:border-signal/55 hover:bg-signal/10 hover:text-signal active:translate-y-px"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden focusable="false">
                  <path fill="currentColor" d={ICONO[red]} />
                </svg>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
