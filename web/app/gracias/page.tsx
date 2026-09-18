import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import BotonWhatsApp from "@/components/site/BotonWhatsApp";

export const metadata: Metadata = {
  ...metaPagina({
    titulo: "Gracias",
    descripcion: "Confirmación de tu inscripción en la lista de espera de +58Express.",
    ruta: "/gracias",
    indexar: false,
  }),
};

/**
 * Dónde aterriza quien pulsa el enlace del correo.
 *
 * El estado llega por la URL como una sola palabra —`confirmado`, `expirado`—,
 * nunca el correo ni el testigo: una dirección en la barra del navegador acaba
 * en el historial, en los registros y en el `Referer` de la petición siguiente.
 *
 * Ninguno de los cuatro textos culpa a quien lee. Un enlace caducado no es un
 * error suyo.
 */
const ESTADOS: Record<
  string,
  { titulo: string; acento: string; cuerpo: string; accion: "inicio" | "reintentar" }
> = {
  pendiente: {
    titulo: "Revisa",
    acento: "tu correo",
    cuerpo:
      "Te mandamos un mensaje para confirmar que la dirección es tuya. Un toque al botón y quedas en la lista. Si no aparece en unos minutos, mira en la carpeta de no deseados.",
    accion: "inicio",
  },
  confirmado: {
    titulo: "Listo,",
    acento: "quedas avisado",
    cuerpo:
      "Te escribiremos una sola vez: el día que +58Express esté disponible en tu zona. Ni boletines, ni promociones, ni nada más.",
    accion: "inicio",
  },
  ya_confirmado: {
    titulo: "Ya estabas",
    acento: "en la lista",
    cuerpo:
      "Este correo ya estaba confirmado, así que no hay nada más que hacer. Te avisaremos el día del lanzamiento.",
    accion: "inicio",
  },
  expirado: {
    titulo: "Ese enlace",
    acento: "ya caducó",
    cuerpo:
      "Los enlaces de confirmación duran 48 horas por seguridad. Vuelve a apuntarte desde la web y te mandamos uno nuevo.",
    accion: "reintentar",
  },
  invalido: {
    titulo: "Ese enlace",
    acento: "no vale",
    cuerpo:
      "Puede que ya se hubiera usado o que el correo se copiara a medias. Vuelve a apuntarte desde la web y te mandamos otro.",
    accion: "reintentar",
  },
  /* Cuando el fallo es nuestro se dice que es nuestro. Mandar a alguien con un
     enlace perfecto a «apuntarme otra vez» porque la base tuvo un mal minuto lo
     haría rendirse por un problema que no es suyo — y el enlace sigue intacto. */
  error: {
    titulo: "No hemos podido",
    acento: "comprobarlo ahora",
    cuerpo:
      "Ha sido un fallo nuestro, no del enlace: sigue valiendo y no lo hemos gastado. Vuelve a pulsarlo dentro de un rato y quedará confirmado.",
    accion: "inicio",
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const vista = ESTADOS[estado ?? "pendiente"] ?? ESTADOS.invalido;

  return (
    <PageShell
      titulo={
        <>
          {vista.titulo} <span className="text-signal">{vista.acento}</span>
        </>
      }
      entradilla={vista.cuerpo}
    >
      <Bloque>
        <Reveal>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/" size="lg">
              Volver al inicio
            </ButtonLink>
            {vista.accion === "reintentar" ? (
              <ButtonLink href="/#descargar" size="lg" variant="outline">
                Apuntarme otra vez
              </ButtonLink>
            ) : (
              <BotonWhatsApp intencion="general" variant="outline" size="lg">
                Hablar con el equipo
              </BotonWhatsApp>
            )}
          </div>
        </Reveal>
      </Bloque>
    </PageShell>
  );
}
