import type { Metadata } from "next";
import { metaPagina } from "@/lib/seo";
import PageShell, { Bloque } from "@/components/site/PageShell";
import {
  IndiceLegal,
  Item,
  ListaLegal,
  P,
  SeccionLegal,
  SubLegal,
  TablaLegal,
  Vigencia,
} from "@/components/site/Legal";
import EnlaceCorreo from "@/components/site/EnlaceCorreo";
import { EMPRESA, VIGENCIA_LEGAL } from "@/lib/legal";

export const metadata: Metadata = metaPagina({
  titulo: "Política de Privacidad",
  descripcion:
    "Qué datos recoge el sitio web de +58 EXPRESS, C.A., para qué, con quién se comparten, cuánto se conservan y cómo pedir acceso, rectificación o eliminación.",
  ruta: "/privacidad",
});

/**
 * La política de privacidad **del sitio web**, y de nada más.
 *
 * DOS COSAS QUE ESTE DOCUMENTO NO HACE, A PROPÓSITO
 *
 * 1. No habla de la aplicación móvil. La postulación de conductor pide cédula,
 *    licencia, certificado médico y documentos del vehículo: datos sensibles que
 *    **esta web no recoge, no recibe y no almacena**. Mezclarlo aquí daría a
 *    entender que este sitio los trata, y eso sería falso.
 * 2. No promete cumplir un reglamento que no rige aquí. Venezuela no tiene una
 *    ley general de protección de datos equiparable al RGPD europeo, y decir lo
 *    contrario para sonar serio es exactamente el tipo de afirmación que
 *    convierte una política en papel mojado.
 *
 * Cada dato que se declara aquí sale del código y está verificado: las tablas de
 * la base, los encargados reales, lo que viaja en la analítica. Nada es una
 * suposición sobre lo que probablemente hará el sitio.
 */

const SECCIONES = [
  { id: "responsable", titulo: "Quién trata tus datos" },
  { id: "hoy", titulo: "Qué ocurre hoy, exactamente" },
  { id: "espera", titulo: "Lista de espera" },
  { id: "aliados", titulo: "Comercios aliados" },
  { id: "tecnicos", titulo: "Datos técnicos y seguridad" },
  { id: "analitica", titulo: "Analítica de uso" },
  { id: "cookies", titulo: "Cookies" },
  { id: "consentimiento", titulo: "En qué nos basamos para tratarlos" },
  { id: "proveedores", titulo: "Con quién se comparten" },
  { id: "transferencias", titulo: "Tratamiento fuera de Venezuela" },
  { id: "conservacion", titulo: "Cuánto tiempo se conservan" },
  { id: "derechos", titulo: "Tus derechos" },
  { id: "ejercer", titulo: "Cómo ejercerlos" },
  { id: "menores", titulo: "Menores de edad" },
  { id: "seguridad", titulo: "Cómo protegemos la información" },
  { id: "no-hacemos", titulo: "Lo que no hacemos" },
  { id: "marco", titulo: "Marco legal aplicable" },
  { id: "cambios", titulo: "Cambios en esta política" },
  { id: "contacto", titulo: "Contacto" },
];

export default function Page() {
  return (
    <PageShell
      titulo={
        <>
          Política de <span className="text-signal">Privacidad</span>
        </>
      }
      entradilla="Qué datos recoge este sitio, para qué, con quién se comparten y cómo pedir que los borremos. Escrito para entenderse sin abogado."
    >
      <Bloque>
        <div className="flex flex-col gap-10">
          <Vigencia fecha={VIGENCIA_LEGAL.fecha} version={VIGENCIA_LEGAL.version} />

          <IndiceLegal secciones={SECCIONES} />

          <SeccionLegal id="responsable" numero={1} titulo="Quién trata tus datos">
            <P>
              El responsable del tratamiento es{" "}
              <strong className="font-bold text-paper">{EMPRESA.responsable}</strong>, con
              Registro de Información Fiscal <strong className="font-bold text-paper">{EMPRESA.rif}</strong> y
              domicilio en {EMPRESA.domicilio}.
            </P>
            <P>
              Para cualquier asunto relacionado con tus datos personales puedes escribir a{" "}
              <EnlaceCorreo className="font-bold text-signal underline underline-offset-4 transition-colors duration-150 hover:text-signal-bright" />
              .
            </P>
            <P>
              Esta política cubre <strong className="font-bold text-paper">únicamente el sitio
              web {EMPRESA.dominio}</strong>. La aplicación móvil de +58Express, cuando se
              publique, tendrá su propia política: trata datos distintos y por vías distintas.
            </P>
          </SeccionLegal>

          <SeccionLegal id="hoy" numero={2} titulo="Qué ocurre hoy, exactamente">
            <P>
              Conviene empezar por lo que es cierto en la fecha de arriba:{" "}
              <strong className="font-bold text-paper">
                este sitio todavía no tiene ningún formulario publicado
              </strong>
              . No hay ni un campo donde escribir un correo, un nombre o un teléfono. Si navegas
              por él, lo único que ocurre es que nuestro proveedor de alojamiento sirve las
              páginas y se mide el uso de forma anónima.
            </P>
            <P>
              Las secciones 3 y 4 describen la lista de espera y el formulario de comercios, que
              están construidos pero <strong className="font-bold text-paper">apagados</strong>.
              Se publican aquí antes de encenderlos y no al revés: nadie debería entregar un dato
              a cambio de leer después para qué se usó.
            </P>
          </SeccionLegal>

          <SeccionLegal id="espera" numero={3} titulo="Lista de espera">
            <P>
              Sirve para una sola cosa: avisarte cuando +58Express esté disponible en tu zona.
              Cuando esta función se active, esto es lo que se guarda.
            </P>
            <TablaLegal
              resumen="Datos que guarda la lista de espera, para qué sirve cada uno y si es obligatorio."
              cabeceras={["Dato", "Para qué", "¿Obligatorio?"]}
              filas={[
                ["Correo electrónico", "Enviarte la confirmación y el aviso de lanzamiento", "Sí"],
                ["Rol", "Saber si te interesa como pasajero, conductor o comercio, y ordenar el lanzamiento", "No"],
                ["Zona", "Avisarte cuando el servicio llegue a tu municipio, no antes", "No"],
                ["Estado de la inscripción", "Distinguir si confirmaste, si caducó o si te diste de baja", "Automático"],
                ["Dos claves técnicas", "Una para confirmar tu correo y otra, distinta, para darte de baja", "Automático"],
                ["Origen de campaña", "Saber qué anuncio o enlace funcionó. No identifica a nadie", "Automático"],
                ["Huella de tu conexión", "Frenar el abuso automatizado. Ver la sección 5", "Automático"],
                ["Fechas", "Cuándo te inscribiste, cuándo confirmaste y, si es el caso, cuándo te diste de baja", "Automático"],
              ]}
            />

            <SubLegal>Confirmación en dos pasos</SubLegal>
            <P>
              Escribir un correo en un formulario no prueba que sea tuyo. Por eso, tras
              apuntarte, te llega un mensaje con un enlace y{" "}
              <strong className="font-bold text-paper">
                sólo quedas en la lista si lo pulsas
              </strong>
              . Si no lo haces, el enlace caduca a las 48 horas y la inscripción no llega a
              completarse. Así nadie puede apuntar a otra persona sin que esa persona se entere.
            </P>
            <P>
              Ese enlace vale una sola vez. El de darse de baja es{" "}
              <strong className="font-bold text-paper">otro distinto</strong>: si fueran el
              mismo, pedir la baja confirmaría la inscripción de quien nunca la quiso.
            </P>

            <SubLegal>Qué te enviamos, y qué no</SubLegal>
            <P>
              Sólo la confirmación, el aviso de lanzamiento y el acuse si te das de baja. Ni
              boletines, ni promociones, ni mensajes de terceros. Todos los que te escribimos
              estando en la lista llevan un enlace para salir de ella —el acuse de la baja no,
              porque para entonces ya has salido—, y{" "}
              <strong className="font-bold text-paper">
                ninguno lleva píxel de seguimiento ni enlaces que cuenten clics
              </strong>
              : no sabemos si lo abriste.
            </P>
          </SeccionLegal>

          <SeccionLegal id="aliados" numero={4} titulo="Comercios aliados">
            <P>
              Cuando este formulario se active, servirá para que un comercio nos cuente quién es
              y podamos contactarlo. Se guardan: nombre de la persona de contacto, nombre del
              negocio, teléfono, correo, municipio, tipo de comercio y el mensaje que escribas.
            </P>
            <P>
              Se guarda también{" "}
              <strong className="font-bold text-paper">la fecha y la hora en que aceptaste</strong>{" "}
              esta política, no una simple marca de «sí»: el día que haga falta demostrar cuándo
              se dio el consentimiento, un sí o un no no prueba nada.
            </P>
            <P>
              Esos datos los usa el equipo de +58Express para responderte. No se ceden a terceros
              con fines comerciales ni se usan para enviarte publicidad.
            </P>
          </SeccionLegal>

          <SeccionLegal id="tecnicos" numero={5} titulo="Datos técnicos y seguridad">
            <SubLegal>Tu dirección IP no se guarda</SubLegal>
            <P>
              Como en cualquier sitio web, nuestro proveedor de alojamiento necesita ver tu
              dirección IP para poder entregarte la página. Lo que{" "}
              <strong className="font-bold text-paper">nosotros</strong> guardamos en nuestra
              base de datos no es esa dirección, sino una huella criptográfica calculada a partir
              de ella con una clave secreta.
            </P>
            <P>
              Esa huella sirve para saber si dos envíos vienen del mismo sitio —y así frenar a
              quien intente apuntar mil correos— y para nada más. No se puede revertir para
              recuperar la dirección original.{" "}
              <strong className="font-bold text-paper">
                No conservamos direcciones IP en nuestros registros.
              </strong>
            </P>

            <SubLegal>Límites contra el abuso</SubLegal>
            <P>
              Se limita el número de envíos por huella y por hora, y el reenvío del correo de
              confirmación a uno cada diez minutos por dirección. Esto último protege también a
              quien no nos ha escrito nunca: impide que alguien use nuestro formulario para
              llenar un buzón ajeno.
            </P>

            <SubLegal>Comprobación de que no eres un robot</SubLegal>
            <P>
              Cuando los formularios se activen, usarán{" "}
              <strong className="font-bold text-paper">Cloudflare Turnstile</strong>, que
              comprueba si quien envía es una persona. A diferencia de otros sistemas parecidos,
              no muestra imágenes que clasificar ni construye un perfil publicitario. Cloudflare
              recibe tu dirección IP y señales técnicas de tu navegador para hacer esa
              comprobación.
            </P>
            <P>
              También hay un campo oculto que una persona nunca rellena y que los programas
              automáticos sí. Si aparece relleno, el envío se descarta. No recoge ningún dato
              sobre ti.
            </P>
          </SeccionLegal>

          <SeccionLegal id="analitica" numero={6} titulo="Analítica de uso">
            <P>
              Usamos <strong className="font-bold text-paper">Vercel Web Analytics</strong> para
              saber qué páginas se visitan y qué botones se pulsan. Es la información que nos dice
              si la web sirve para algo.
            </P>
            <P>
              No usa cookies y{" "}
              <strong className="font-bold text-paper">no recoge ningún dato personal</strong>.
              Esto es todo lo que viaja en cada medición:
            </P>
            <TablaLegal
              resumen="Campos que se envían en cada medición de uso."
              cabeceras={["Campo", "Qué contiene"]}
              filas={[
                [
                  "Dirección de la página",
                  "Sólo el dominio y la ruta. Lo que vaya después de «?» o de «#» se recorta antes de salir de tu navegador",
                ],
                ["Ruta", "La misma ruta, por separado"],
                ["Marca de tiempo", "Cuándo ocurrió"],
                ["Versión del script", "Qué versión de la herramienta lo midió"],
                [
                  "De dónde vienes",
                  "Sólo en la primera página de la visita, y sólo el dominio del sitio del que llegas — nunca su ruta ni lo que llevara detrás de «?». En una visita directa va vacío",
                ],
                [
                  "Evento",
                  "Al pulsar un botón: su nombre (por ejemplo «social_tiktok») y una categoría como «footer» o «contacto»",
                ],
              ]}
            />
            <P>
              Ni tu correo, ni tu nombre, ni tu teléfono, ni tu dirección IP, ni ningún
              identificador que permita seguirte entre visitas.
            </P>
            <P>
              Ese recorte de la dirección es deliberado. Si alguna vez llegaras a este sitio por
              un enlace que llevase datos tuyos pegados detrás —algo que{" "}
              <strong className="font-bold text-paper">ninguna dirección que genere esta web
              hace</strong>, pero que podría poner un tercero—, esos datos{" "}
              <strong className="font-bold text-paper">no se enviarían a la medición</strong>: se
              descartan antes.
            </P>
          </SeccionLegal>

          <SeccionLegal id="cookies" numero={7} titulo="Cookies">
            <P>
              <strong className="font-bold text-paper">Este sitio no usa cookies.</strong> Ni
              propias ni de terceros, ni técnicas ni publicitarias. Tampoco guarda nada en el
              almacenamiento local de tu navegador.
            </P>
            <P>
              Por eso no verás un aviso de cookies: no habría nada que consentir, y un cartel que
              pide permiso para algo que no ocurre sólo sirve para molestar.
            </P>
          </SeccionLegal>

          <SeccionLegal id="consentimiento" numero={8} titulo="En qué nos basamos para tratarlos">
            <P>
              Para la lista de espera y el formulario de comercios,{" "}
              <strong className="font-bold text-paper">en tu consentimiento</strong>: lo das al
              escribir tus datos, marcar la casilla correspondiente y —en la lista de espera—
              confirmar desde tu propio correo. Es libre y revocable: puedes retirarlo cuando
              quieras, sin justificarte, y sin que eso te perjudique en nada.
            </P>
            <P>
              Para las medidas contra el abuso descritas en la sección 5, en nuestro interés
              legítimo en proteger el servicio y a las personas cuyos buzones podrían ser usados
              sin su permiso. Ese tratamiento se reduce al mínimo imprescindible y no genera
              ningún perfil.
            </P>
          </SeccionLegal>

          <SeccionLegal id="proveedores" numero={9} titulo="Con quién se comparten">
            <P>
              No vendemos datos personales, no los cedemos con fines publicitarios y no los
              compartimos con nadie salvo con los proveedores que hacen funcionar el sitio, cada
              uno con acceso únicamente a lo que necesita:
            </P>
            <TablaLegal
              resumen="Proveedores que intervienen en el funcionamiento del sitio, qué reciben y dónde están."
              cabeceras={["Proveedor", "Para qué", "Qué recibe", "Dónde"]}
              filas={[
                ["Vercel", "Alojar el sitio y ejecutar sus funciones", "Dirección IP y datos de la petición", "Estados Unidos"],
                ["Supabase", "Base de datos de la lista de espera y los comercios", "Los datos de las secciones 3 y 4", "Estados Unidos"],
                ["Resend", "Enviar los correos de confirmación, baja y acuse", "Tu dirección de correo y el contenido de esos correos", "Unión Europea"],
                [
                  "Google (Gmail)",
                  "Es nuestro buzón: ahí recibimos los correos que nos escribes y, cuando el formulario de comercios esté activo, el aviso interno que genera",
                  "Lo que escribas si nos escribes; y del formulario de comercios: nombre, negocio, teléfono, correo, municipio, tipo de comercio y mensaje",
                  "Según la política de Google",
                ],
                ["Cloudflare", "Comprobar que no eres un robot (cuando los formularios se activen)", "Dirección IP y señales del navegador", "Red global"],
                ["OpenStreetMap", "Las teselas del mapa de cobertura", "Dirección IP, al cargar el mapa", "Europa"],
                ["Meta (WhatsApp)", "Sólo si tú decides abrir WhatsApp desde un botón", "Lo que tú escribas en esa conversación", "Según su propia política"],
              ]}
            />
            <P>
              Una precisión sobre <strong className="font-bold text-paper">Gmail</strong>, porque
              antes esta política lo contaba mal: es la dirección de correo del equipo, y por eso
              aparece en dos situaciones distintas. La primera es cuando tú nos escribes. La
              segunda —
              <strong className="font-bold text-paper">
                cuando el formulario de comercios esté activo
              </strong>
              — es automática: al enviarlo, además de guardarse, se genera un aviso interno a ese
              buzón con los datos que acabas de rellenar. Ocurre sin que tú tengas que escribir
              ningún correo.
            </P>
            <P>
              La última fila no es un proveedor nuestro: es una aplicación tuya. Si pulsas un
              botón de WhatsApp, sales de este sitio y lo que ocurra a partir de ahí se rige por
              las condiciones de esa empresa. El mensaje va escrito de antemano, pero{" "}
              <strong className="font-bold text-paper">no se envía hasta que tú lo envías</strong>.
            </P>
          </SeccionLegal>

          <SeccionLegal id="transferencias" numero={10} titulo="Tratamiento fuera de Venezuela">
            <P>
              Como se ve en la tabla anterior, varios de esos proveedores tratan la información
              fuera de Venezuela —principalmente en Estados Unidos y en la Unión Europea—. Es
              inevitable en un sitio web moderno, y preferimos decirlo con claridad a esconderlo.
            </P>
            <P>
              Elegimos proveedores con compromisos contractuales de seguridad y confidencialidad,
              y les entregamos el mínimo necesario. Al usar este sitio o al enviarnos tus datos,
              entiendes que ese tratamiento fuera del país ocurre.
            </P>
          </SeccionLegal>

          <SeccionLegal id="conservacion" numero={11} titulo="Cuánto tiempo se conservan">
            <TablaLegal
              resumen="Plazos de conservación de cada tipo de dato."
              cabeceras={["Dato", "Hasta cuándo"]}
              filas={[
                [
                  "Inscripción sin confirmar",
                  "El enlace caduca a las 48 horas. El registro se borra pasados 30 días desde que se creó: nunca llegó a haber consentimiento",
                ],
                [
                  "Inscripción confirmada",
                  "Mientras sigas en la lista. No tiene borrado automático: sale cuando te das de baja o cuando nos lo pides",
                ],
                [
                  "Baja",
                  "Se conserva únicamente la constancia de que pediste la baja, para no volver a escribirte por error",
                ],
                [
                  "Contacto de comercio",
                  "Se borra pasados 12 meses desde que enviaste el formulario",
                ],
                [
                  "Registros contra el abuso",
                  "Se borran una vez superadas las 24 horas desde el último intento",
                ],
              ]}
            />
            <P>
              Los borrados automáticos los hace{" "}
              <strong className="font-bold text-paper">un proceso que se ejecuta una vez al
              día</strong>. Eso significa que un registro no desaparece en el instante exacto en
              que cumple su plazo, sino en el primer pase diario posterior: en el peor caso,
              menos de veinticuatro horas más tarde. Lo decimos así porque es lo que ocurre, no
              un máximo que no podríamos garantizar.
            </P>
            <P>
              Cumplidos esos plazos los datos se eliminan. Si una norma nos obligara a conservar
              algo más tiempo, se conservaría sólo lo exigido y sólo durante ese plazo.
            </P>
          </SeccionLegal>

          <SeccionLegal id="derechos" numero={12} titulo="Tus derechos">
            <P>
              El artículo 28 de la Constitución de la República Bolivariana de Venezuela reconoce
              a toda persona el derecho de{" "}
              <strong className="font-bold text-paper">
                acceder a la información y a los datos que sobre sí misma consten en registros
                oficiales o privados
              </strong>
              , de conocer el uso que se haga de ellos y su finalidad, y de solicitar{" "}
              <em>ante el tribunal competente</em> su actualización, rectificación o destrucción
              si fuesen erróneos o afectasen ilegítimamente sus derechos.
            </P>
            <P>
              Esa última vía es judicial, y existe siempre. Pero{" "}
              <strong className="font-bold text-paper">
                no queremos que tengas que ir a un tribunal para que corrijamos un correo mal
                escrito
              </strong>
              : por eso ofrecemos un canal directo, y sobre los datos que tengamos tuyos puedes
              pedirnos:
            </P>
            <ListaLegal>
              <Item>
                <strong className="font-bold text-paper">Acceder</strong> — saber qué tenemos y
                para qué lo usamos.
              </Item>
              <Item>
                <strong className="font-bold text-paper">Rectificar</strong> — corregir lo que
                esté mal o incompleto.
              </Item>
              <Item>
                <strong className="font-bold text-paper">Eliminar</strong> — que borremos tus
                datos.
              </Item>
              <Item>
                <strong className="font-bold text-paper">Retirar tu consentimiento</strong> — en
                la lista de espera basta el enlace de baja de cualquiera de nuestros correos; no
                hace falta escribirnos.
              </Item>
            </ListaLegal>

            <SubLegal>Si no te atendemos</SubLegal>
            <P>
              La vía judicial existe y conviene que la conozcas. La{" "}
              <strong className="font-bold text-paper">
                Ley Orgánica del Tribunal Supremo de Justicia
              </strong>{" "}
              (Gaceta Oficial N.º 6.684 Extraordinario, del 19 de enero de 2022) regula la demanda
              de <em>habeas data</em> en sus artículos 167 y siguientes. Procede cuando quien
              administra la base de datos no responde al requerimiento previo dentro de los{" "}
              <strong className="font-bold text-paper">veinte días hábiles</strong> siguientes, o
              responde negativamente.
            </P>
            <P>
              Se presenta ante el Tribunal de Municipio con competencia en lo Contencioso
              Administrativo de tu domicilio. Preferimos decírtelo a que lo descubras por tu
              cuenta: un derecho que no se conoce no se ejerce.
            </P>
          </SeccionLegal>

          <SeccionLegal id="ejercer" numero={13} titulo="Cómo ejercerlos">
            <P>
              Escribe a{" "}
              <EnlaceCorreo className="font-bold text-signal underline underline-offset-4 transition-colors duration-150 hover:text-signal-bright" />{" "}
              diciendo qué quieres. No hace falta un formato especial ni justificar el motivo.
            </P>
            <P>
              <strong className="font-bold text-paper">
                Nos comprometemos a responderte en un máximo de {EMPRESA.plazoRespuesta}
              </strong>{" "}
              desde que recibimos tu solicitud.
            </P>
            <P>
              Es un <strong className="font-bold text-paper">compromiso nuestro</strong>, asumido
              voluntariamente y por escrito, y no un plazo que nos imponga una norma: el deber de
              dar «oportuna y adecuada respuesta» del artículo 51 de la Constitución está
              dirigido a las autoridades y a los funcionarios públicos, no a una empresa privada.
              Preferimos decirlo así —y obligarnos igual— antes que atribuirle a la ley una
              exigencia que no hace.
            </P>
            <P>
              Elegimos quince y no más por una razón concreta: son{" "}
              <strong className="font-bold text-paper">
                menos de los veinte días hábiles
              </strong>{" "}
              que el artículo 167 de la Ley Orgánica del Tribunal Supremo de Justicia manda dejar
              transcurrir antes de poder demandar por <em>habeas data</em>. Queremos haberte
              respondido antes de que esa puerta llegue siquiera a abrirse.
            </P>
            <P>
              Para atender una solicitud puede que necesitemos comprobar que la dirección de
              correo es tuya, precisamente para no entregarle tus datos a otra persona.
            </P>
          </SeccionLegal>

          <SeccionLegal id="menores" numero={14} titulo="Menores de edad">
            <P>
              Este sitio no está dirigido a niños, niñas ni adolescentes. La lista de espera y el
              formulario de comercios están pensados para{" "}
              <strong className="font-bold text-paper">personas mayores de edad</strong>, y no
              pedimos datos a menores a sabiendas.
            </P>
            <P>
              No preguntamos la edad: hacerlo supondría recoger un dato más sin ninguna forma
              fiable de comprobarlo. Y no existe en Venezuela una edad mínima legal establecida
              para el consentimiento digital, así que tampoco podríamos apoyarnos en una.
            </P>
            <P>
              Si eres madre, padre o representante y crees que un menor a tu cargo nos ha
              facilitado datos, escríbenos a{" "}
              <EnlaceCorreo className="font-bold text-signal underline underline-offset-4 transition-colors duration-150 hover:text-signal-bright" />{" "}
              y los eliminaremos.
            </P>
          </SeccionLegal>

          <SeccionLegal id="seguridad" numero={15} titulo="Cómo protegemos la información">
            <ListaLegal>
              <Item>Todo el sitio se sirve cifrado, y la conexión con la base de datos también.</Item>
              <Item>
                La base de datos de la web está <strong className="font-bold text-paper">separada</strong> de
                la de la aplicación: una credencial de este sitio no abre nada de la operación.
              </Item>
              <Item>
                Ningún dato de estas tablas es accesible desde el navegador. Sólo el servidor
                puede leerlas.
              </Item>
              <Item>Las claves de los enlaces de confirmación y de baja son aleatorias y no adivinables.</Item>
              <Item>
                Ninguna medida es infalible. Si ocurriera una brecha que afectara a tus datos, te
                lo comunicaríamos por el correo que nos hayas dado.
              </Item>
            </ListaLegal>
          </SeccionLegal>

          <SeccionLegal id="no-hacemos" numero={16} titulo="Lo que no hacemos">
            <P>
              Decir lo que no ocurre es tan útil como decir lo que ocurre, y se puede comprobar:
            </P>
            <ListaLegal>
              <Item>No vendemos ni alquilamos datos personales. A nadie, por ningún motivo.</Item>
              <Item>No usamos cookies ni tecnologías de seguimiento entre sitios.</Item>
              <Item>No hacemos perfiles publicitarios ni decisiones automatizadas sobre personas.</Item>
              <Item>No conservamos direcciones IP en nuestros registros.</Item>
              <Item>No rastreamos la apertura de los correos que enviamos.</Item>
              <Item>
                <strong className="font-bold text-paper">
                  Este sitio web no recoge documentos de identidad, licencias, certificados
                  médicos, fotografías personales ni documentos de vehículos.
                </strong>{" "}
                Esa documentación pertenece al proceso de la aplicación móvil, que es otro
                sistema, con otra base de datos y su propia política.
              </Item>
            </ListaLegal>
          </SeccionLegal>

          <SeccionLegal id="marco" numero={17} titulo="Marco legal aplicable">
            <P>
              Esta política se rige por el derecho de la República Bolivariana de Venezuela, y en
              particular por el{" "}
              <strong className="font-bold text-paper">artículo 28 de la Constitución</strong>,
              que es la norma que reconoce los derechos descritos en la sección 12.
            </P>
            <P>
              El consentimiento que prestas por medios electrónicos y el registro de su fecha y
              hora tienen valor conforme al{" "}
              <strong className="font-bold text-paper">
                Decreto con Rango y Fuerza de Ley sobre Mensajes de Datos y Firmas Electrónicas
              </strong>{" "}
              (Gaceta Oficial N.º 37.148, del 28 de febrero de 2001), que reconoce eficacia
              jurídica y valor probatorio a la información en formato electrónico.
            </P>
            <P>
              Queremos ser claros en algo que muchas políticas esquivan:{" "}
              <strong className="font-bold text-paper">
                Venezuela no cuenta con una ley general de protección de datos personales
                equiparable al Reglamento europeo
              </strong>
              , ni con una autoridad administrativa de control en la materia. No vamos a invocar
              normas que no nos resultan aplicables para aparentar rigor.
            </P>
            <P>
              Sí existe, en cambio, un criterio vinculante. En la{" "}
              <strong className="font-bold text-paper">
                sentencia N.º 1318 del 4 de agosto de 2011
              </strong>
              , la Sala Constitucional del Tribunal Supremo de Justicia fijó los principios que
              rigen el tratamiento de datos personales mientras no haya ley especial. Son los que
              seguimos:
            </P>
            <ListaLegal>
              <Item>
                <strong className="font-bold text-paper">Autonomía de la voluntad</strong> — el
                consentimiento debe ser previo, libre, informado, inequívoco y revocable.
              </Item>
              <Item>
                <strong className="font-bold text-paper">Autodeterminación informativa</strong> —
                decides tú sobre tus datos.
              </Item>
              <Item>
                <strong className="font-bold text-paper">Finalidad y calidad</strong> — se usan
                sólo para lo que se anunció, y no para otra cosa.
              </Item>
              <Item>
                <strong className="font-bold text-paper">Temporalidad</strong> — no se conservan
                más allá de lo necesario.
              </Item>
              <Item>
                <strong className="font-bold text-paper">Seguridad y confidencialidad</strong>,{" "}
                <strong className="font-bold text-paper">exactitud</strong> y{" "}
                <strong className="font-bold text-paper">responsabilidad</strong> sobre lo que se
                trata.
              </Item>
            </ListaLegal>
            <P>
              El resto de los compromisos de este documento los asumimos nosotros, por escrito, y
              son exigibles a nosotros.
            </P>
          </SeccionLegal>

          <SeccionLegal id="cambios" numero={18} titulo="Cambios en esta política">
            <P>
              Cuando el sitio empiece a tratar datos de una forma distinta, esta política cambiará
              antes —no después—. La versión vigente es siempre la de esta página, con su fecha de
              entrada en vigor arriba.
            </P>
            <P>
              Si el cambio afecta de forma sustancial a datos que ya nos hayas dado, te lo
              comunicaremos por correo y, cuando corresponda, te pediremos el consentimiento otra
              vez.
            </P>
          </SeccionLegal>

          <SeccionLegal id="contacto" numero={19} titulo="Contacto">
            <P>
              Para cualquier duda, solicitud o reclamación sobre tus datos, escríbenos a{" "}
              <EnlaceCorreo className="font-bold text-signal underline underline-offset-4 transition-colors duration-150 hover:text-signal-bright" />
              .
            </P>
            <P>
              {EMPRESA.razonSocial} — {EMPRESA.rif}
              <br />
              {EMPRESA.domicilio}
            </P>
          </SeccionLegal>
        </div>
      </Bloque>
    </PageShell>
  );
}
