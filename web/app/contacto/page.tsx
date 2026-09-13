import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";
import BotonWhatsApp from "@/components/site/BotonWhatsApp";
import EnlaceCorreo from "@/components/site/EnlaceCorreo";
import EnlaceWhatsApp from "@/components/site/EnlaceWhatsApp";
import RedesSociales from "@/components/site/RedesSociales";
import { type Intencion } from "@/lib/contact";

export const metadata: Metadata = metaPagina({
  titulo: "Contacto",
  descripcion:
    "Habla con el equipo de +58Express por WhatsApp o correo: pasajeros, conductores, comercios y soporte.",
  ruta: "/contacto",
});

/**
 * Cuatro puertas, una por intención real.
 *
 * No hay una quinta para «empresas»: hoy no existe una oferta corporativa
 * distinta, y una puerta que lleva exactamente al mismo sitio con otro rótulo es
 * decorado. Cuando exista, entra aquí con su propio mensaje.
 */
const PUERTAS: {
  intencion: Intencion;
  titulo: string;
  cuerpo: string;
  rotulo: string;
  acento: boolean;
}[] = [
  {
    intencion: "conductor",
    titulo: "Quiero conducir",
    cuerpo:
      "Tienes moto y quieres trabajar con nosotros. Cuéntanos de ti y te explicamos qué documentación hace falta y cómo sigue el proceso.",
    rotulo: "Hablar con el equipo",
    acento: true,
  },
  {
    intencion: "aliado",
    titulo: "Tengo un comercio",
    cuerpo:
      "Quieres que tu negocio esté en +58Express y que tus pedidos salgan sin flota propia. Cuéntanos qué vendes y dónde estás.",
    rotulo: "Hablar con el equipo",
    acento: true,
  },
  {
    intencion: "general",
    titulo: "Quiero pedir un viaje",
    cuerpo:
      "La aplicación todavía no está publicada. Escríbenos y te contamos cuándo llega a tu zona y cómo va a funcionar.",
    rotulo: "Preguntar por la app",
    acento: false,
  },
  {
    intencion: "soporte",
    titulo: "Necesito ayuda",
    cuerpo:
      "Ya usas +58Express y algo no va como esperabas. Escríbenos con lo que ocurrió y lo revisamos.",
    rotulo: "Pedir ayuda",
    acento: false,
  },
];

export default function Page() {
  return (
    <PageShell
      titulo={
        <>
          Hablemos, <span className="text-signal">sin vueltas</span>
        </>
      }
      entradilla="Escribes por WhatsApp y te responde una persona del equipo. Elige por dónde vienes para que la conversación empiece ya encaminada."
    >
      <Bloque>
        <ul className="grid gap-5 sm:grid-cols-2">
          {PUERTAS.map((p, i) => (
            <li key={p.intencion}>
              <Reveal delay={i * 0.05} className="h-full">
                <div className="flex h-full flex-col rounded-[var(--radius-card)] border border-white/10 bg-ink-850 p-7 sm:p-8">
                  <h2
                    className={`display text-[clamp(1.7rem,3.4vw,2.3rem)] ${
                      p.acento ? "text-signal" : "text-paper"
                    }`}
                  >
                    {p.titulo}
                  </h2>
                  <p className="mt-4 flex-1 text-[16px] leading-relaxed text-paper-dim">
                    {p.cuerpo}
                  </p>
                  <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <BotonWhatsApp
                      intencion={p.intencion}
                      variant={p.acento ? "signal" : "outline"}
                      size="md"
                    >
                      {p.rotulo}
                    </BotonWhatsApp>
                    <EnlaceCorreo
                      intencion={p.intencion}
                      className="inline-flex h-12 items-center justify-center rounded-full px-4 text-[15px] font-bold text-paper-dim transition-colors duration-150 hover:text-signal"
                    >
                      o escríbenos por correo
                    </EnlaceCorreo>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque>
        <Reveal>
          <div className="rounded-[var(--radius-card)] border border-white/10 bg-ink-850 p-7 sm:p-10">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.22em] text-paper-mute">
              Los canales, directos
            </h2>
            <dl className="mt-7 grid gap-7 sm:grid-cols-2">
              <div>
                <dt className="text-[15px] text-paper-mute">WhatsApp</dt>
                <dd className="mt-2">
                  <EnlaceWhatsApp className="display text-[clamp(1.5rem,3vw,2rem)] text-paper transition-colors duration-150 hover:text-signal" />
                </dd>
              </div>
              <div>
                <dt className="text-[15px] text-paper-mute">Correo</dt>
                <dd className="mt-2">
                  <EnlaceCorreo className="text-[clamp(1.05rem,2.2vw,1.3rem)] font-bold break-all text-paper transition-colors duration-150 hover:text-signal" />
                </dd>
              </div>
            </dl>
            <p className="mt-8 max-w-[62ch] text-[15px] leading-relaxed text-paper-mute">
              Atendemos desde Maracaibo y el Municipio Mara. Todavía no tenemos un
              horario de atención comprometido: preferimos no prometer un plazo antes
              de poder cumplirlo.
            </p>

            {/* Las redes cierran la tarjeta, separadas por una línea: son otra
                forma de seguirnos, no otro canal por el que escribirnos, y
                mezclarlas con WhatsApp y el correo confundiría las dos cosas. */}
            <RedesSociales
              origen="contacto"
              titulo="También estamos en"
              className="mt-9 border-t border-white/10 pt-8"
            />
          </div>
        </Reveal>
      </Bloque>
    </PageShell>
  );
}
