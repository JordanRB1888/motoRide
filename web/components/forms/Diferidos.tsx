"use client";

import dynamic from "next/dynamic";

/**
 * Los dos formularios públicos, en un paquete aparte que sólo se descarga si
 * alguien los va a ver.
 *
 * EL PROBLEMA QUE ESTO ARREGLA
 *
 * `WAITLIST_ENABLED` y `PARTNER_LEADS_ENABLED` están apagados, y las páginas ya
 * comprobaban el interruptor antes de pintar nada. Pero un `import` estático
 * mete el módulo en el grafo de cliente aunque el componente no llegue a
 * renderizarse nunca: el navegador se descargaba los formularios **y el
 * cargador de Cloudflare Turnstile** —31 KB— para no ejecutarlos jamás.
 *
 * POR QUÉ AQUÍ Y NO EN LA PÁGINA
 *
 * Se probaron dos caminos antes que este:
 *
 *  · `next/dynamic` llamado desde la propia página. Su documentación lo
 *    desaconseja explícitamente: «cuando un componente de servidor importa de
 *    forma dinámica un componente de cliente, la división automática de código
 *    no está soportada». Y, medido, no dividía nada.
 *
 *  · `await import()` dentro del render del componente de servidor. Más elegante
 *    de leer, pero el empaquetador analiza igualmente el `import()` estático y
 *    el módulo seguía apareciendo como `<script src>` en el HTML.
 *
 * La división sí ocurre cuando el `import()` vive dentro de un componente de
 * cliente, que es lo que es este fichero. Lo que se descarga siempre es esta
 * envoltura, que no llega a un kilobyte.
 *
 * CUANDO SE ENCIENDAN LOS INTERRUPTORES
 *
 * No hay nada que deshacer. `next/dynamic` sigue renderizando en el servidor
 * —`ssr` vale `true` por defecto— así que el formulario aparece en el HTML
 * inicial igual que antes, y el paquete se pide junto con la página. La única
 * diferencia es que deja de pedirse cuando nadie lo necesita.
 */
export const FormularioWaitlistDiferido = dynamic(
  () => import("@/components/forms/FormularioWaitlist"),
);

export const FormularioAliadosDiferido = dynamic(
  () => import("@/components/forms/FormularioAliados"),
);
