import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import {
  IndiceLegal,
  Item,
  ListaLegal,
  P,
  SeccionLegal,
  Vigencia,
} from "@/components/site/Legal";
import EnlaceCorreo from "@/components/site/EnlaceCorreo";
import { EMPRESA, VIGENCIA_LEGAL } from "@/lib/legal";

export const metadata: Metadata = metaPagina({
  titulo: "Términos de uso",
  descripcion:
    "Condiciones de uso del sitio web de +58 EXPRESS, C.A.: objeto del sitio, información publicada, lista de espera, contacto de comercios y jurisdicción.",
  ruta: "/terminos",
});

/**
 * Términos de uso **del sitio web**, y de nada más.
 *
 * Esta es la distinción que ordena el documento entero: la web informa, recoge
 * contacto y —cuando se active— anota quién quiere aviso del lanzamiento. No
 * presta viajes, ni envíos, ni delivery. Esas operaciones pertenecen a la
 * aplicación, que todavía no está publicada y que tendrá sus propias condiciones.
 *
 * Meter aquí condiciones de transporte sería prometer un servicio que este sitio
 * no presta, y crearía la apariencia de un contrato que nadie ha firmado.
 */

const SECCIONES = [
  { id: "quienes-somos", titulo: "Quiénes somos" },
  { id: "objeto", titulo: "Qué es este sitio y qué no es" },
  { id: "aceptacion", titulo: "Aceptación de estas condiciones" },
  { id: "uso", titulo: "Uso permitido" },
  { id: "informacion", titulo: "La información publicada" },
  { id: "propiedad", titulo: "Propiedad intelectual" },
  { id: "disponibilidad", titulo: "Disponibilidad del sitio" },
  { id: "terceros", titulo: "Enlaces y servicios de terceros" },
  { id: "whatsapp", titulo: "WhatsApp y correo electrónico" },
  { id: "espera", titulo: "Lista de espera" },
  { id: "comunicaciones", titulo: "Comunicaciones que enviamos" },
  { id: "aliados", titulo: "Comercios aliados" },
  { id: "responsabilidad", titulo: "Límites de responsabilidad" },
  { id: "privacidad", titulo: "Datos personales" },
  { id: "cambios", titulo: "Cambios en estas condiciones" },
  { id: "ley", titulo: "Ley aplicable y jurisdicción" },
  { id: "contacto", titulo: "Contacto" },
];

export default function Page() {
  return (
    <PageShell
      titulo={
        <>
          Términos <span className="text-signal">de uso</span>
        </>
      }
      entradilla="Las condiciones bajo las que puedes usar este sitio web. Están escritas para entenderse, no para protegernos de ti."
    >
      <Bloque>
        <div className="flex flex-col gap-10">
          <Vigencia fecha={VIGENCIA_LEGAL.fecha} version={VIGENCIA_LEGAL.version} />

          <IndiceLegal secciones={SECCIONES} />

          <SeccionLegal id="quienes-somos" numero={1} titulo="Quiénes somos">
            <P>
              Este sitio web pertenece a <strong className="font-bold text-paper">{EMPRESA.razonSocial}</strong>,
              sociedad mercantil venezolana identificada con el Registro de Información
              Fiscal <strong className="font-bold text-paper">{EMPRESA.rif}</strong>, con domicilio en {EMPRESA.domicilio}.
            </P>
            <P>
              A lo largo de este documento «nosotros» significa {EMPRESA.razonSocial}, y «el
              sitio» significa <strong className="font-bold text-paper">{EMPRESA.dominio}</strong> y todas sus páginas.
            </P>
          </SeccionLegal>

          <SeccionLegal id="objeto" numero={2} titulo="Qué es este sitio y qué no es">
            <P>
              Este sitio es <strong className="font-bold text-paper">informativo</strong>. Sirve
              para dar a conocer +58Express, explicar los servicios previstos, ofrecer canales
              de contacto y —cuando esa función se active— permitir que dejes tu correo para
              avisarte del lanzamiento.
            </P>
            <P>
              <strong className="font-bold text-paper">
                Desde este sitio no se contratan ni se prestan viajes, envíos ni entregas.
              </strong>{" "}
              Esas operaciones corresponden a la aplicación móvil de +58Express, que a la fecha
              de estos términos todavía no está publicada y que tendrá sus propias condiciones
              de uso. Nada de lo que leas aquí crea una obligación de transportar a nadie ni de
              entregar nada.
            </P>
          </SeccionLegal>

          <SeccionLegal id="aceptacion" numero={3} titulo="Aceptación de estas condiciones">
            <P>
              Al usar el sitio aceptas estas condiciones. Si no estás de acuerdo con ellas, lo
              coherente es no usarlo. No hace falta registrarse ni crear una cuenta para
              navegar: no hay cuentas de usuario en esta web.
            </P>
          </SeccionLegal>

          <SeccionLegal id="uso" numero={4} titulo="Uso permitido">
            <P>Puedes leer, consultar y compartir el contenido del sitio. Lo que no puedes hacer:</P>
            <ListaLegal>
              <Item>
                Intentar acceder a partes del sitio o de sus sistemas que no estén abiertas al
                público.
              </Item>
              <Item>
                Usar medios automatizados para saturar el sitio, extraer contenido de forma
                masiva o eludir las protecciones contra abuso.
              </Item>
              <Item>
                Enviar datos de terceros sin su conocimiento, o suplantar a otra persona o
                empresa en los formularios y canales de contacto.
              </Item>
              <Item>
                Usar el sitio o su contenido para actividades ilícitas, engañosas o que dañen a
                terceros.
              </Item>
            </ListaLegal>
            <P>
              Si detectamos un uso así, podemos bloquear el acceso desde el origen
              correspondiente sin aviso previo.
            </P>
          </SeccionLegal>

          <SeccionLegal id="informacion" numero={5} titulo="La información publicada">
            <P>
              Las zonas de cobertura, los servicios descritos, las formas de pago y cualquier
              plazo que se mencione son{" "}
              <strong className="font-bold text-paper">informativos y pueden cambiar</strong>.
              Describen lo que está previsto, no un compromiso contractual.
            </P>
            <P>
              Ponemos cuidado en que lo publicado sea cierto y esté al día, pero no garantizamos
              que esté libre de errores u omisiones. Si encuentras algo incorrecto, escríbenos y
              lo corregimos.
            </P>
          </SeccionLegal>

          <SeccionLegal id="propiedad" numero={6} titulo="Propiedad intelectual">
            <P>
              La marca +58Express, el logotipo, los textos, las imágenes, el diseño y el código
              de este sitio pertenecen a {EMPRESA.razonSocial} o se usan con autorización de su
              titular.
            </P>
            <P>
              Puedes citar y enlazar el contenido indicando la fuente. No puedes reproducirlo de
              forma sustancial, usarlo con fines comerciales, ni utilizar la marca o el logotipo
              para dar a entender una relación, patrocinio o alianza que no exista, sin nuestra
              autorización escrita.
            </P>
            <P>
              Los mapas de la sección de cobertura se construyen con datos de OpenStreetMap,
              cuyos colaboradores conservan sus propios derechos y cuya licencia se indica en el
              propio mapa.
            </P>
          </SeccionLegal>

          <SeccionLegal id="disponibilidad" numero={7} titulo="Disponibilidad del sitio">
            <P>
              Procuramos que el sitio esté disponible, pero no garantizamos que funcione sin
              interrupciones. Puede estar fuera de servicio por mantenimiento, por fallos de los
              proveedores de los que depende o por causas ajenas a nosotros. Podemos modificar,
              suspender o retirar cualquier parte del sitio en cualquier momento.
            </P>
          </SeccionLegal>

          <SeccionLegal id="terceros" numero={8} titulo="Enlaces y servicios de terceros">
            <P>
              El sitio enlaza a servicios que no controlamos —WhatsApp, el correo electrónico,
              y en su momento las tiendas de aplicaciones—. Cuando sales del sitio, lo que
              ocurre se rige por las condiciones y las políticas de privacidad de quien
              corresponda, no por las nuestras.
            </P>
            <P>
              No respondemos del contenido, la disponibilidad ni las prácticas de esos terceros.
              Enlazarlos no significa que los respaldemos.
            </P>
          </SeccionLegal>

          <SeccionLegal id="whatsapp" numero={9} titulo="WhatsApp y correo electrónico">
            <P>
              Los botones de contacto abren WhatsApp o tu programa de correo con un mensaje ya
              escrito, que puedes modificar o descartar antes de enviarlo.{" "}
              <strong className="font-bold text-paper">
                Nada se envía hasta que tú lo envías.
              </strong>
            </P>
            <P>
              Esas conversaciones ocurren en plataformas de terceros. Te responde una persona del
              equipo, en horario laborable y sin un plazo de respuesta comprometido: preferimos no
              prometer un tiempo que no podemos garantizar todavía.
            </P>
          </SeccionLegal>

          <SeccionLegal id="espera" numero={10} titulo="Lista de espera">
            <P>
              Cuando la lista de espera esté activa, dejar tu correo sirve para{" "}
              <strong className="font-bold text-paper">
                una sola cosa: avisarte cuando +58Express esté disponible en tu zona
              </strong>
              . No es una reserva, no da prioridad, no crea una cuenta y no obliga a nada a
              ninguna de las dos partes.
            </P>
            <P>
              La inscripción exige confirmar desde tu propio correo, y cada mensaje que te
              enviemos llevará un enlace para salir de la lista. Puedes darte de baja cuando
              quieras, sin dar explicaciones.
            </P>
          </SeccionLegal>

          <SeccionLegal id="comunicaciones" numero={11} titulo="Comunicaciones que enviamos">
            <P>
              Sólo enviamos correos que tú hayas provocado: la confirmación de tu inscripción, el
              acuse de tu baja, el aviso de lanzamiento y las respuestas a lo que nos escribas.
              No enviamos boletines, ni promociones, ni mensajes de terceros.
            </P>
          </SeccionLegal>

          <SeccionLegal id="aliados" numero={12} titulo="Comercios aliados">
            <P>
              El formulario de comercios —cuando esté activo— sirve para que nos cuentes quién
              eres y podamos contactarte.{" "}
              <strong className="font-bold text-paper">No es un alta ni una afiliación.</strong>{" "}
              No crea ninguna relación comercial, ni exclusividad, ni derecho a aparecer en la
              aplicación. Cualquier acuerdo posterior se documentará por separado.
            </P>
          </SeccionLegal>

          <SeccionLegal id="responsabilidad" numero={13} titulo="Límites de responsabilidad">
            <P>
              Respondemos de lo que este sitio hace: publicar información y recoger el contacto
              que tú decides darnos. Dentro de lo que permita la ley, no respondemos de los daños
              derivados de la imposibilidad de usar el sitio, de errores u omisiones en la
              información publicada, ni de los servicios de los terceros que enlazamos.
            </P>
            <P>
              Nada en estas condiciones excluye la responsabilidad que la ley venezolana no
              permita excluir.
            </P>
          </SeccionLegal>

          <SeccionLegal id="privacidad" numero={14} titulo="Datos personales">
            <P>
              El tratamiento de los datos que nos facilites se explica en la{" "}
              <a
                href="/privacidad"
                className="font-bold text-signal underline underline-offset-4 transition-colors duration-150 hover:text-signal-bright"
              >
                Política de Privacidad
              </a>
              , que forma parte de estas condiciones.
            </P>
          </SeccionLegal>

          <SeccionLegal id="cambios" numero={15} titulo="Cambios en estas condiciones">
            <P>
              Podemos actualizar estos términos cuando el sitio cambie o cuando lo exija una
              norma. La versión vigente es siempre la publicada en esta página, con su fecha de
              entrada en vigor arriba. Si el cambio es sustancial y afecta a algo que ya nos
              hayas dado —por ejemplo, tu inscripción en la lista de espera— te lo comunicaremos
              por correo.
            </P>
          </SeccionLegal>

          <SeccionLegal id="ley" numero={16} titulo="Ley aplicable y jurisdicción">
            <P>
              Estas condiciones se rigen por las leyes de la República Bolivariana de Venezuela.
            </P>
            <P>
              Para cualquier controversia derivada del uso de este sitio, las partes se someten a
              los tribunales competentes de{" "}
              <strong className="font-bold text-paper">{EMPRESA.jurisdiccion}</strong>, con
              renuncia a cualquier otro fuero que pudiera corresponderles.
            </P>
          </SeccionLegal>

          <SeccionLegal id="contacto" numero={17} titulo="Contacto">
            <P>
              Para cualquier duda sobre estos términos, escríbenos a{" "}
              <EnlaceCorreo className="font-bold text-signal underline underline-offset-4 transition-colors duration-150 hover:text-signal-bright" />
              .
            </P>
          </SeccionLegal>
        </div>
      </Bloque>
    </PageShell>
  );
}
