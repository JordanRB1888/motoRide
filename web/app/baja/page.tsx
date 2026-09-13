import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import Reveal from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  ...metaPagina({
    titulo: "Baja",
    descripcion: "Salir de la lista de espera de +58Express.",
    ruta: "/baja",
    indexar: false,
  }),
};

/**
 * La página de la baja.
 *
 * Sin identificarse, sin preguntar por qué se va y sin un último intento de
 * retenerla. Quien pulsa «darme de baja» ya decidió; poner un obstáculo aquí
 * sólo consigue que la próxima vez marque el correo como spam, que es mucho peor
 * para el dominio que perder una dirección.
 */
const ESTADOS: Record<string, { titulo: string; acento: string; cuerpo: string }> = {
  baja: {
    titulo: "Listo,",
    acento: "no te escribimos más",
    cuerpo:
      "Saliste de la lista de espera. No recibirás el aviso de lanzamiento ni ningún otro correo nuestro. Si algún día cambias de idea, puedes volver a apuntarte desde la web.",
  },
  ya_baja: {
    titulo: "Ya estabas",
    acento: "dado de baja",
    cuerpo:
      "Este correo ya había salido de la lista, así que no había nada que hacer. No te escribimos.",
  },
  invalido: {
    titulo: "Ese enlace",
    acento: "no vale",
    cuerpo:
      "Puede que el correo se copiara a medias. Si sigues recibiendo mensajes nuestros y no los quieres, escríbenos y te sacamos de la lista a mano.",
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const vista = ESTADOS[estado ?? "invalido"] ?? ESTADOS.invalido;

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
          <ButtonLink href="/" size="lg">
            Volver al inicio
          </ButtonLink>
        </Reveal>
      </Bloque>
    </PageShell>
  );
}
