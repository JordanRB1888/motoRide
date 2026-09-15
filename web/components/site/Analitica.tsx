"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * La analítica, con la dirección recortada antes de salir del navegador.
 *
 * EL PROBLEMA QUE ESTO ARREGLA, medido y no supuesto
 *
 * `medir()` limpia las propiedades de cada evento, y lo hace bien. Pero la
 * dirección de la página no pasa por `medir()`: la pone el propio script de
 * Vercel, que arma su campo a partir de `location.href` tal cual. Comprobado
 * contra producción, cargando
 *
 *     /?utm_source=prueba&email=ana%40ejemplo.com&token=SECRETO123#cobertura
 *
 * la baliza viajó con esa dirección **entera**: el correo y el testigo falsos
 * incluidos, y pegados además a cada evento posterior mientras no cambiara la
 * página.
 *
 * Hoy no había fuga real —ninguna dirección que genere el sitio lleva datos
 * personales en la consulta; el testigo de confirmación se queda en la ruta de
 * API, que redirige a `/gracias?estado=confirmado`, una sola palabra—. El riesgo
 * era el día que un enlace de campaña, una herramienta de correo o un aliado
 * añadiera `?email=` o `?uid=`. Nadie se habría enterado.
 *
 * QUÉ HACE
 *
 * Se queda con el origen y la ruta, y tira la consulta y el fragmento. De
 *
 *     https://mas58express.com/gracias?estado=confirmado&token=X#abajo
 *
 * sale
 *
 *     https://mas58express.com/gracias
 *
 * POR QUÉ ESTE FICHERO EXISTE
 *
 * `beforeSend` es una función, y una función no cruza la frontera entre un
 * componente de servidor y uno de cliente. `app/layout.tsx` es de servidor, así
 * que la envoltura tiene que ser de cliente. No hace nada más.
 */
export default function Analitica() {
  return (
    <Analytics
      beforeSend={(evento) => {
        try {
          const url = new URL(evento.url);
          return { ...evento, url: url.origin + url.pathname };
        } catch {
          /* Si la dirección no se puede analizar, no se manda. Perder una
             medición no le cuesta nada a nadie; mandar una dirección sin
             recortar, sí. */
          return null;
        }
      }}
    />
  );
}
