"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ZONAS } from "@/lib/zonas";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Mapa oscuro sin clave de API.
 *
 * Llega por un chunk diferido (`dynamic(ssr:false)` en Cobertura), así que
 * Leaflet no entra en el bundle inicial.
 */
export default function MapaZonas({ activa }: { activa: string }) {
  const cont = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const el = cont.current;
    if (!el || mapa.current) return;

    const m = L.map(el, {
      center: ZONAS[0].coords,
      zoom: ZONAS[0].zoom,
      zoomControl: false,
      // Un mapa dentro de una página larga no debe secuestrar la rueda.
      scrollWheelZoom: false,
      dragging: true,
      attributionControl: true,
    });

    // CARTO dejó de servir sus basemaps sin clave: sus teselas vuelven
    // estampadas con "API KEY REQUIRED". Se usa OpenStreetMap, que no pide
    // clave, y el aspecto oscuro se consigue con un filtro sobre las teselas
    // (regla .mz-oscuro en globals.css) en vez de con un estilo de pago.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      className: "mz-oscuro",
    }).addTo(m);

    for (const z of ZONAS) {
      const icono = L.divIcon({
        className: "",
        html: `<span style="
          display:block;width:18px;height:18px;border-radius:50%;
          background:#FCB000;box-shadow:0 0 0 5px rgba(252,176,0,.22),0 0 16px rgba(252,176,0,.75);
        "></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker(z.coords, { icon: icono, title: z.nombre, alt: z.nombre })
        .addTo(m)
        .bindTooltip(z.nombre, { direction: "top", offset: [0, -14], className: "mz-tip" });
    }

    mapa.current = m;
    setListo(true);

    return () => {
      m.remove();
      mapa.current = null;
    };
  }, []);

  // La zona activa manda la cámara del mapa.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    const z = ZONAS.find((x) => x.id === activa);
    if (!z) return;
    m.flyTo(z.coords, z.zoom, {
      duration: prefersReducedMotion() ? 0 : 1.5,
      easeLinearity: 0.22,
    });
  }, [activa, listo]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[var(--radius-card)]">
      <div
        ref={cont}
        className="h-full w-full bg-ink-850"
        role="img"
        aria-label="Mapa de las zonas donde opera +58Express: Santa Cruz de Mara, El Moján y Maracaibo"
      />
      {!listo && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="text-[14px] text-paper-mute">Cargando mapa…</span>
        </div>
      )}
    </div>
  );
}
