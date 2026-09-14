# Capa legal de mas58express.com

**Legal identity = COMPLETA**
**Privacy Policy = PUBLICADA**
**Terms = PUBLICADOS**
**Driver sensitive documents on web = NO**
**Automatic retention cleanup = IMPLEMENTADO / CERTIFICADO**
**Legal review by lawyer = INCORPORATED**
**Reviewer = Fernando Atencio**
**Date = 14 de septiembre de 2026**
**WAITLIST_ENABLED = false**
**PARTNER_LEADS_ENABLED = false**

| | |
|---|---|
| **Rama** | `feat/public-marketing-site` |
| **Producción** | `plus58express-1nrka1fsa` → <https://mas58express.com/privacidad> y <https://mas58express.com/terminos> |
| **Fecha** | 13 de septiembre de 2026 · revisión de términos el 14 |
| **Versión de los documentos** | Privacidad **1.0** · Términos **1.1** |
| **Alcance** | Sitio web público. **No** la aplicación móvil |

> **Esto no es asesoramiento jurídico.** Es un trabajo de ingeniería hecho con
> una revisión documental conservadora: cada afirmación legal del texto se
> verificó contra fuentes, y lo que no pudo verificarse no se afirmó.
>
> **El 14 de septiembre de 2026 se incorporaron las observaciones jurídicas del
> abogado Fernando Atencio sobre `/terminos`** — §10 de este informe. Son
> observaciones incorporadas, **no una certificación del documento**: el abogado
> revisó y señaló, y lo señalado se aplicó tal cual. La política de privacidad
> **no** ha pasado todavía por esa revisión; siguen recomendadas sus secciones
> 10, 13 y 17.

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
| Playwright | **178/178 contra producción** · 164 en local (3 saltadas: la analítica sólo existe en un despliegue) |
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

1. ~~**Implementar el borrado automático por retención.**~~ ✅ **Hecho y
   certificado el 13 de septiembre de 2026** — sección 9.
2. **Revisión por un abogado venezolano**, en particular de las secciones 10
   (tratamiento fuera del país), 13 (plazo) y 17 (marco legal).
3. **Confirmar la entrega real de Resend**, pendiente desde la ronda anterior.
4. ~~**Comprobar el RIF.**~~ ✅ **Confirmado el 13 de septiembre de 2026** contra
   el documento oficial: figura exactamente como `J508723600`, sin separadores, y
   así se publica. Queda anotado en el código que **no debe «normalizarse»** a
   `J-50872360-0`: eso sería inferir dónde van los grupos de un identificador
   oficial, y en un documento legal una inferencia no es un detalle de estilo,
   es un dato distinto del que consta.
5. Encender `WAITLIST_ENABLED` y `PARTNER_LEADS_ENABLED`, desplegar y certificar
   el flujo completo con Turnstile visible.

---

## 9. Borrado automático por retención

**Automatic retention cleanup = IMPLEMENTADO / CERTIFICADO**

Añadido el 13 de septiembre de 2026. Una promesa de borrado que nadie ejecuta es
peor que no haberla hecho: convierte un documento legal en una declaración falsa.
Esto la cumple.

### 9.1 Qué se elige, y por qué no otra cosa

**Un cron job de Vercel**, que ya viene con el proyecto: ni un servicio nuevo, ni
un coste añadido.

La alternativa seria era **`pg_cron` dentro de Supabase**, y tiene una ventaja
real —no expondría ninguna ruta que proteger—. Se descartó porque dejaría la
lógica de borrado en SQL, fuera del repositorio y fuera del alcance de las
pruebas. Con el cron de Vercel, el borrado vive en el mismo sitio que el resto
del código, se prueba con fechas simuladas contra la base real, y la ruta es sólo
el disparador.

| | |
|---|---|
| Disparador | `web/vercel.json` → `/api/cron/retencion` |
| Frecuencia | `0 4 * * *` — **una vez al día, 04:00 UTC** (medianoche en Venezuela) |
| Ejecución | Servidor, runtime Node. Nunca el navegador |
| Registrado | Confirmado con `vercel crons ls` |

> **Dónde vive el fichero, y por qué importa.** Los tres proyectos de la cuenta
> declaran `Root Directory: .`, y en la raíz del repositorio ya hay un
> `vercel.json` que es el *rewrite* de SPA del proyecto Vite. Tocarlo habría
> afectado a ese otro proyecto. `plus58express-web` no tiene Git conectado —se
> despliega por CLI desde `web/`—, así que su configuración es `web/vercel.json`
> y no alcanza a nadie más. **Si algún día se conecta Git a este proyecto, habrá
> que revisarlo**: con `Root Directory: .` se leería el de la raíz.

### 9.2 Los tres plazos, y a quién NO tocan

| Qué | Plazo | Criterio exacto |
|---|---|---|
| Altas **sin confirmar** | 30 días | `estado IN ('pendiente','caducado','rebotado')` y `creado_en` anterior al corte |
| Contactos de comercios | 12 meses | `creado_en` anterior al corte |
| Registros del limitador | 24 horas | `ultimo_en` anterior al corte |

**Lo que no se borra nunca por antigüedad:**

- **Las confirmadas.** Hay consentimiento: la política no promete borrarlas por
  el paso del tiempo, sino 30 días después del aviso de lanzamiento o cuando la
  persona se dé de baja.
- **Las dadas de baja.** Es la constancia de que alguien pidió no recibir más
  correos. Borrarla llevaría a volver a escribirle — justo lo contrario de lo que
  pidió.

`creado_en` y no `actualizado_en`, deliberadamente: la política dice «el registro
se elimina a los 30 días», y la antigüedad se cuenta desde el alta. Con
`actualizado_en`, una fila tocada el día 29 sobreviviría hasta el 59, que es más
de lo prometido.

### 9.3 Cómo está protegida la única ruta que borra datos

Vercel envía `Authorization: Bearer $CRON_SECRET` en cada ejecución. La ruta lo
comprueba con **comparación en tiempo constante**, y:

- **sin `CRON_SECRET` configurada no se ejecuta nada.** Una configuración a
  medias no puede convertirse en una puerta abierta para provocar borrados;
- quien no acierte recibe **404, no 401**. Un 401 confirmaría que la ruta existe;
  un 404 no dice nada;
- el secreto **no lleva el prefijo `NEXT_PUBLIC_`**, así que jamás viaja al
  navegador, y la ruta se ejecuta en Node;
- no está en el sitemap ni enlazada desde ninguna parte.

El valor lo generó la propia máquina (32 bytes aleatorios) y se subió a Vercel
por la entrada estándar, como Secret y sólo en Production.

### 9.4 Lo que se registra en los logs

Tres números:

```
[retencion] espera=0 aliados=0 intentos=0
```

Ni un correo, ni un identificador, ni una IP.

### 9.5 Certificación

**Siete pruebas con fechas simuladas, contra Supabase real.** Las filas se
envejecen de verdad en la base en lugar de adelantar el reloj del programa: si se
llamara a la purga con un «ahora» treinta días en el futuro, miraría también las
filas reales con ese futuro por delante. Envejecer sólo las de prueba deja el
experimento acotado.

| Caso | Esperado | Resultado |
|---|---|---|
| 29 días sin confirmar | conserva | ✅ |
| 31 días sin confirmar | elimina | ✅ |
| Confirmada y dada de baja, con 400 días | **no se tocan** | ✅ |
| 11 meses de un comercio | conserva | ✅ |
| 13 meses de un comercio | elimina | ✅ |
| Ejecutarla dos veces | segunda pasada en cero | ✅ |
| Fila recién creada | sigue ahí tras barrer | ✅ |

Más tres de paridad sobre el almacén de memoria, para que las dos
implementaciones del contrato no se separen con el tiempo, y una que comprueba
que la ruta responde **404 sin cabecera, con `Bearer` vacío, con un secreto
equivocado y con `Basic`** — y **405** ante un POST.

### 9.6 Un hueco que esto cerró de paso

Hasta hoy **el adaptador de Postgres nunca se había ejecutado dentro de una
función de Vercel**: todas las pruebas contra Supabase corrían desde una máquina
local. Si la conexión al pooler fallara desde el runtime de producción —egress,
TLS, tiempos—, no nos habríamos enterado hasta el día de encender los
formularios.

Se cerró disparando el cron de verdad contra producción, con un secreto generado
al efecto:

```
HTTP 200 {"ok":true,"esperaEliminadas":0,"aliadosEliminados":0,"intentosEliminados":0}
HTTP 200 {"ok":true,"esperaEliminadas":0,"aliadosEliminados":0,"intentosEliminados":0}
```

Dos ejecuciones seguidas, idénticas. Eso prueba de una vez: la comprobación de la
cabecera con el formato exacto que envía Vercel, la construcción del adaptador en
el runtime, **la conexión desde Vercel a Supabase con la CA anclada**, los tres
borrados y la idempotencia.

Terminado, **el secreto se rotó** a un valor que nadie conserva, y se comprobó que
el anterior ya no abre nada. La base quedó en cero filas en las tres tablas.

---

## 10. Observaciones jurídicas incorporadas — Fernando Atencio

**Legal review by lawyer = INCORPORATED · Reviewer = Fernando Atencio · Date = 14
de septiembre de 2026.**

Alcance: **`/terminos` únicamente.** La política de privacidad no formó parte de
esta revisión y **no se modificó**. Los términos pasan a **versión 1.1**; la
política se queda en la 1.0, que es lo honesto: cambió un documento, no los dos.

> Son **observaciones incorporadas**, no una certificación. El abogado revisó y
> señaló; lo señalado se aplicó tal cual, sin reinterpretarlo y sin añadir
> cláusulas por iniciativa propia.

### Qué cambió, sección por sección

| § | Observación | Aplicado |
|---|---|---|
| 2 | Título → «Qué es este sitio y su alcance» | Título cambiado; contenido intacto |
| 3 | Eliminar «lo coherente es no usarlo» por tono coercitivo | Suprimida la oración completa. **No se sustituyó por otra frase de presión**: quitar sólo el predicado habría dejado un fragmento sin sentido |
| 4 | Encabezado → política de seguridad; nuevo cierre | H2 → «Políticas de seguridad y usos prohibidos» (la variante corta que el propio abogado ofrece), con la frase completa justo debajo. Lista intacta. Cierre sustituido literalmente |
| 5 | Nueva redacción del párrafo de cierre | Sustituido literalmente, sin duplicar el primer párrafo |
| 11 | Evitar «tu/tus/te» por señalativos | «la persona usuaria», «su inscripción», «su baja», «lo que nos escriba» |
| 13 | Nuevo enfoque, sin dos frases concretas | Sustituida entera por la redacción facilitada, en tres párrafos. Sin exclusiones agresivas |

### Alineación de texto

El abogado sugirió justificar los párrafos. **No se aplicó**, conforme a tu
criterio de aceptación: se mantiene alineación a la izquierda en todos los
tamaños. La justificación en columnas estrechas abre ríos de espacio y perjudica
la lectura, y el resultado actual ya es limpio. Comprobado: no hay `justify` en
ninguna hoja de estilo ni en los componentes legales.

### Comprobado en producción

- Las cinco frases retiradas devuelven **0 coincidencias**; las siete
  incorporadas, **1 cada una**.
- **Numeración 1–17 correcta y continua**; 17 anclas en el índice, **ninguna
  rota**.
- **Sin desbordamiento horizontal ni texto cortado** a 360, 390, 430, 768, 1024 y
  1440 px.
- El enlace interno a `/privacidad` sigue en pie.
- **188/188** pruebas contra producción; axe sin infracciones.
