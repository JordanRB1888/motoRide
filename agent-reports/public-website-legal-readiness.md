# Capa legal de mas58express.com

**Legal identity = COMPLETA**
**Privacy Policy = PUBLICADA**
**Terms = PUBLICADOS**
**Driver sensitive documents on web = NO**
**WAITLIST_ENABLED = false**
**PARTNER_LEADS_ENABLED = false**

| | |
|---|---|
| **Rama** | `feat/public-marketing-site` |
| **Producción** | `plus58express-2uf59a9md` → <https://mas58express.com/privacidad> y <https://mas58express.com/terminos> |
| **Fecha** | 13 de septiembre de 2026 |
| **Versión de los documentos** | 1.0 |
| **Alcance** | Sitio web público. **No** la aplicación móvil |

> **Esto no es asesoramiento jurídico.** Es un trabajo de ingeniería hecho con
> una revisión documental conservadora: cada afirmación legal del texto se
> verificó contra fuentes, y lo que no pudo verificarse no se afirmó. Antes de
> encender los formularios conviene que un abogado venezolano lo revise —sobre
> todo las secciones 10, 13 y 17 de la política—.

---

## 1. Qué se publicó

Las dos páginas eran un marcador que decía, literalmente, «no contiene un
documento legal válido», y estaban en `noindex`. Ahora son documentos reales.

| Página | Antes | Ahora |
|---|---|---|
| `/privacidad` | Marcador, `noindex`, fuera del sitemap | **19 secciones**, indexable, en el sitemap |
| `/terminos` | Marcador, `noindex`, fuera del sitemap | **17 secciones**, indexable, en el sitemap |

La identidad legal vive en un solo fichero, `web/lib/legal.ts`, y de ahí la leen
los dos documentos. Tres copias de una razón social son tres oportunidades de que
una se quede vieja, y la que quedaría mal es justo la que alguien leería el día
que hubiera un problema.

---

## 2. La revisión jurídica, y lo que cambió

Se verificaron cinco cuestiones con fuentes, cada una por un investigador
independiente y con una fase de refutación posterior: **diez agentes, 400
consultas a fuentes**. Tres hallazgos cambiaron el texto publicado, y dos de
ellos corregían errores míos.

### 2.1 Artículo 28 de la Constitución — y un error mío

Texto verificado contra el PDF publicado por la Asamblea Nacional. Y contiene una
frase que mi primera redacción se había comido:

> «…así como de conocer el uso que se haga de los mismos y su finalidad, y de
> solicitar **ante el tribunal competente** la actualización, la rectificación o
> la destrucción de aquellos…»

Yo había escrito que el artículo reconoce el derecho «de solicitar su
actualización, rectificación o destrucción», sin más. Eso convierte un derecho de
**vía judicial** en una obligación directa de la empresa que la norma no impone,
y habría sido una afirmación legal falsa en un documento legal.

Corregido: el texto cita el artículo como es, y a continuación explica que
ofrecemos **además** un canal directo, para no obligar a nadie a ir a un tribunal
por un correo mal escrito.

### 2.2 No existe una ley general — pero sí un criterio vinculante

Esta fue la aportación más valiosa de la fase de refutación, y no estaba en mi
borrador inicial.

#### Lo que no hay

Verificado con confianza alta: Venezuela **no tiene** una ley general vigente
comparable al RGPD europeo ni a las de Argentina, Colombia o Brasil. No hay
autoridad de control, ni registro de bases de datos, ni obligación de notificar
brechas, ni régimen de transferencias internacionales, ni ley de cookies.

> El investigador lo dijo sin rodeos: la «LOPD venezolana» **es un mito** que
> circula en blogs y en textos generados por inteligencia artificial. Han
> circulado anteproyectos; ninguno se ha convertido en ley.

La política lo dice en voz alta en su sección 17, en lugar de invocar normas
inaplicables para aparentar rigor. Es la diferencia entre un documento que
compromete y uno decorativo.

#### Lo que sí hay

**Sentencia N.º 1318 del 4 de agosto de 2011**, Sala Constitucional del Tribunal
Supremo de Justicia (exp. AA50-T-2004-2395, caso Defensoría del Pueblo / SICRI
contra el artículo 192 del Decreto-Ley de Reforma de la Ley General de Bancos,
ponente Luisa Estella Morales). La Sala estableció **con carácter vinculante** los
principios que rigen todo tratamiento de datos personales mientras no exista ley
especial.

Lo confirmaron **tres agentes independientes** —el investigador original y dos
refutadores, uno de ellos buscando activamente el error—, coincidiendo en número,
fecha, expediente, caso y ponente.

Mi borrador sólo decía «no hay ley». Eso era cierto pero incompleto, y dejaba la
política sin fundamento positivo. Ahora la sección 17 enumera esos principios
—autonomía de la voluntad, autodeterminación informativa, finalidad y calidad,
temporalidad, seguridad, exactitud y responsabilidad— y declara que son los que
se siguen. El documento pasó de «no nos obliga nada» a «nos obliga esto».

### 2.3 Ley sobre Mensajes de Datos y Firmas Electrónicas

Verificada: Decreto con Rango y Fuerza de Ley, **Gaceta Oficial N.º 37.148 del 28
de febrero de 2001**, vigente, desarrollado por un Reglamento Parcial (G.O.
38.086, 14/12/2004). Sostiene lo que la política necesita: el consentimiento
prestado por medios electrónicos y el registro de su fecha y hora tienen eficacia
jurídica y valor probatorio.

> **No se cita el número de decreto**, a propósito: las fuentes oficiales se
> contradicen entre «1.024» y «1.204». La referencia de Gaceta sí es unívoca, así
> que se usa esa y sólo esa.

### 2.4 El plazo de 15 días hábiles es un compromiso, no una obligación legal

Verificado con confianza alta. El deber de dar «oportuna y adecuada respuesta»
del **artículo 51 de la Constitución** está dirigido a «cualquier autoridad,
funcionario público o funcionaria pública», y su sanción es la destitución del
cargo: no alcanza a un particular. Los plazos de la LOPA (20 días, 4 meses) son
para la Administración Pública.

Conclusión: **no existe un plazo exigible a una empresa privada.** La política lo
dice así y asume los 15 días hábiles como compromiso propio — que obliga igual,
pero sin atribuirle a la ley algo que no dice.

### 2.6 El habeas data SÍ tiene procedimiento desde 2022

El hallazgo más importante llegó con el resultado final del flujo, y desmiente
buena parte de lo que se lee por ahí —incluida mi propia suposición de partida—:

> **La Ley Orgánica del Tribunal Supremo de Justicia** (Gaceta Oficial N.º 6.684
> Extraordinario, del 19 de enero de 2022) **regula la demanda de habeas data en
> sus artículos 167 a 178.** La LOTSJ anterior, de 2010, no lo hacía.

Tres consecuencias, todas incorporadas al texto publicado:

1. **La competencia ya no es de la Sala Constitucional.** Hoy se presenta ante el
   **Tribunal de Municipio con competencia en lo Contencioso Administrativo del
   domicilio del solicitante** (art. 169), criterio confirmado por la propia Sala
   en la sentencia N.º 759 del 21/05/2025. Casi toda la literatura anterior a
   2022 dice otra cosa, y el investigador avisó expresamente de no repetirla.
2. **Hay una ventana de veinte días hábiles.** El artículo 167 exige requerir
   antes al administrador de la base y esperar ese plazo —o recibir una negativa—
   antes de poder demandar. **No es una obligación de responder** impuesta a la
   empresa: es el tiempo que hay que dejar pasar.
3. **Por eso los 15 días hábiles del compromiso son los correctos.** Son menos
   que esa ventana: nos obligamos a responder antes de que la vía judicial llegue
   siquiera a abrirse. La política lo explica así, con esas palabras.

La sección 12 de la política incluye ahora un apartado «Si no te atendemos» que
explica esa vía. Un derecho que no se conoce no se ejerce, y ocultarlo en un
documento de privacidad sería justo lo contrario de lo que un documento de
privacidad debería hacer.

### 2.5 Menores

Confianza media. La LOPNNA (G.O. 6.185 Extraordinario, 08/06/2015) define niño
como menor de 12 y adolescente de 12 a menos de 18, y protege su honor, imagen y
vida privada; pero **no establece una edad mínima de consentimiento digital**.

La cláusula se redactó en consecuencia: el sitio no está dirigido a menores, los
formularios se destinan a personas mayores de edad, no se pregunta la edad
—porque sería recoger un dato más sin forma fiable de comprobarlo— y se da un
canal para que una madre, padre o representante pida la eliminación.

---

## 3. Lo que la web trata, según el código

La política no describe lo que el sitio *probablemente* hace: describe lo que
hace, leído de las tablas y de las rutas.

### 3.1 Hoy, con los formularios apagados

**Cero formularios publicados.** Ni un campo. Lo único que ocurre al navegar es
que Vercel sirve las páginas, OpenStreetMap entrega las teselas del mapa y la
analítica cuenta la visita sin cookies ni datos personales.

La política lo dice en su sección 2 antes que nada, porque publicar un documento
que describe una recogida que todavía no ocurre confundiría a quien lo lea hoy.

### 3.2 Cuando se enciendan

| Tabla | Campos |
|---|---|
| `lista_de_espera` | correo · rol · zona · estado · dos testigos distintos · caducidad · fechas · origen de campaña · `ip_hash` |
| `contactos_aliados` | nombre · negocio · teléfono · correo · municipio · tipo de comercio · mensaje · **`consentimiento_en` con fecha y hora** · estado · `ip_hash` |
| `intentos_web` | clave técnica (`waitlist:<hmac>` o `envio:<id>`) · ventana · contador. **Ningún dato personal** |

### 3.3 Tres afirmaciones que la política puede hacer porque el código las sostiene

1. **«No conservamos direcciones IP.»** Cierto: se guarda un HMAC-SHA256 con sal
   secreta, irreversible sin la sal.
2. **«Los correos no llevan rastreo.»** Cierto, y hay una prueba que falla si
   aparece un `<img>` en la plantilla.
3. **«Este sitio no usa cookies.»** Cierto y certificado en producción:
   `document.cookie` vacío, `localStorage` y `sessionStorage` a cero.

---

## 4. Documentos sensibles de conductores: NO

**El sitio web no recoge, no recibe y no almacena** cédulas, licencias,
certificados médicos, fotografías personales ni documentos de vehículos.

Eso no es una promesa: es una constatación. Las dos únicas tablas de la base de
la web son las de arriba, y ninguna tiene un campo donde pudiera caber un
documento. No hay subida de ficheros en todo el sitio.

Esa documentación pertenece al proceso de la **aplicación móvil**, que es otro
sistema, con otra base de datos y su propia política. La sección 16 de la
política lo declara explícitamente, y la 1 acota el alcance al sitio web.

---

## 5. Encargados y tratamiento fuera de Venezuela

| Proveedor | Para qué | Dónde |
|---|---|---|
| Vercel | Alojar y ejecutar | Estados Unidos |
| Supabase | Base de la web (`us-east-1`) | Estados Unidos |
| Resend | Correos de confirmación y baja | Unión Europea |
| Cloudflare | Turnstile, cuando se active | Red global |
| OpenStreetMap | Teselas del mapa | Europa |
| Meta (WhatsApp) · Google (Gmail) | Sólo si la persona decide abrirlos | Su propia política |

Las dos últimas no son encargados nuestros: son aplicaciones de quien visita. El
mensaje va escrito de antemano y **no se envía hasta que la persona lo envía**.

---

## 6. SEO

- `noindex` retirado de `/privacidad` y `/terminos`.
- Ambas añadidas al `sitemap.xml` con prioridad 0.3 — deben ser encontrables, no
  son puerta de entrada de nadie.
- `robots.txt` sin `Disallow`: bloquear la descarga impediría al rastreador leer
  la etiqueta, y la URL podría seguir apareciendo sin descripción.
- Canonical correcto en las dos, y títulos y descripciones propios.
- `/gracias` y `/baja` siguen fuera del sitemap y con `noindex`: son destinos de
  un enlace de correo, no contenido que nadie deba encontrar buscando.

---

## 7. Verificación

| | |
|---|---|
| TypeScript | limpio |
| Build | correcto |
| Playwright | **167/167 contra producción** · 164 en local (3 saltadas: la analítica sólo existe en un despliegue) |
| axe (WCAG 2.1 AA) | 27 análisis, **0 infracciones** |
| `WAITLIST_ENABLED` · `PARTNER_LEADS_ENABLED` | **`false`** · **`false`** |
| Campos de formulario | **0** |

> **Un fallo de accesibilidad encontrado y corregido en el camino:** la tabla
> responsive de los documentos legales metía `<div>` dentro de `<dl>`, lo que
> rompe la lista de definición —un lector de pantalla deja de emparejar etiqueta
> y valor—. axe lo marcó como infracción seria en `/privacidad` móvil. Ahora cada
> tarjeta es su propia `<dl>` con `<dt>`/`<dd>` como hijos directos.

> **Y una prueba mal planteada por mí:** las dos comprobaciones de analítica que
> añadí en la ronda anterior fallaban contra un servidor local, porque el script
> lo sirve la infraestructura de Vercel y esa ruta no existe fuera de un
> despliegue. Quedan acotadas al despliegue en lugar de dar un fallo que no dice
> nada.

---

## 8. Lo que falta ANTES de encender los formularios

No se ha encendido nada, y quedan cosas que hacer primero.

1. **Implementar el borrado automático por retención.** La política se
   compromete a eliminar las inscripciones sin confirmar a los 30 días y los
   contactos de comercios a los 12 meses. Hoy **sólo está implementado** el
   barrido de los registros contra el abuso (24 h). Mientras no haya datos, nada
   se incumple; el día que los haya, sí. **Es el bloqueo técnico principal.**
2. **Revisión por un abogado venezolano**, en particular de las secciones 10
   (tratamiento fuera del país), 13 (plazo) y 17 (marco legal).
3. **Confirmar la entrega real de Resend**, pendiente desde la ronda anterior.
4. **Comprobar el RIF.** Se publica exactamente como lo facilitó el dueño,
   `J508723600`. La forma habitual de presentarlo lleva guiones
   —`J-50872360-0`— pero separar un identificador oficial es una suposición sobre
   dónde van los grupos, y equivocarse en un documento legal es peor que no
   separarlo. **Confírmalo y lo formateo.**
5. Encender `WAITLIST_ENABLED` y `PARTNER_LEADS_ENABLED`, desplegar y certificar
   el flujo completo con Turnstile visible.
