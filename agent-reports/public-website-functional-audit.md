# Auditoría funcional del sitio público de +58Express

**Alcance:** cableado, no diseño. Qué funciona de verdad y qué es sólo superficie.
**Sitio:** <https://mas58express.com> · **Rama:** `feat/public-marketing-site` · **HEAD:** `c80048e`
**Fecha:** 13 de septiembre de 2026
**Método:** 290 pulsaciones reales con Playwright sobre producción en las diez rutas, más lectura de código y peticiones HTTP.
**Esta ronda no modificó ni una línea de código, ni desplegó, ni tocó DNS ni Vercel.**

---

## 1. Resumen ejecutivo

El sitio está **impecablemente construido como folleto y vacío como herramienta comercial**.

Tres cifras lo resumen:

| | |
|---|---|
| Elementos interactivos únicos en todo el sitio | **33** |
| Formularios, campos, áreas de texto o desplegables | **0** |
| Vías de contacto — correo, teléfono, WhatsApp, redes | **0** |

Los 33 elementos son: la barra, el pie, doce enlaces de navegación, el selector de diez servicios, las tres
tarjetas de zona y la hamburguesa. Nada más. El único destino que no es una ruta interna es el ancla
`/#descargar` y dos enlaces de atribución del mapa.

**Consecuencia:** un visitante convencido —un conductor que quiere trabajar, un comercio que quiere
vender, un pasajero que quiere avisos— **no tiene ni una sola acción disponible**. No es que las acciones
fallen: no existen.

Y lo más caro de todo es lo que ya está hecho y sin conectar: **el backend tiene un endpoint público y
terminado de postulación de conductores** (`POST /api/driver-applications`, sin autenticación, con limitador
de altas, siete documentos y bandeja «Solicitudes» en el Admin), **la API está viva** en
`api-staging.mas58express.com` y **responde 200**. La web no lo llama. Convertir conductores no es
construir: es cablear.

Con un matiz que sí es un bloqueo real y confirmado: **el backend rechaza hoy al propio dominio del sitio**.

```
OPTIONS /api/driver-applications   Origin: https://mas58express.com  → 403 ORIGIN_NOT_ALLOWED
GET     /api/health                Origin: http://localhost:3000     → 200
```

Cualquier formulario que se escriba mañana en el sitio fallaría en el primer envío, y fallaría en la consola
del navegador, no en la pantalla del visitante.

---

## 1 bis. Matriz completa de interacciones

Las 33 interacciones únicas del sitio, verificadas con clic real, más las piezas que un visitante espera
encontrar y no existen. `Esperado` es lo que promete a ojos de quien visita; `Real`, lo que hace.

| Elemento | Página | Esperado | Real | Estado | Prioridad |
|---|---|---|---|---|---|
| Logo → `/` | las 10 | Volver al inicio | Navega; estando ya en `/` no hace nada | FUNCIONA | P3 |
| Barra: Servicios, Seguridad, Conductores, Aliados, Nosotros, Ayuda | las 10 | Navegar | Navegan | FUNCIONA | — |
| Barra: «Conoce la app» | las 10 | Llevar a la descarga | Navega a `/#descargar` y se detiene en la sección | FUNCIONA | — |
| Hamburguesa + panel móvil | las 10 | Abrir el menú | Abre a pantalla completa, atrapa el foco, Escape cierra | FUNCIONA | — |
| Salto al contenido | las 10 | Saltar la navegación | Funciona con teclado; lleva el foco a `<main>` | FUNCIONA | — |
| Pie: 7 enlaces + Privacidad y Términos | las 10 | Navegar | Navegan | FUNCIONA | — |
| Hero: «Conoce la app» | `/` | Descargar la app | Ancla a una sección que dice «Próximamente» | PARCIAL | P0 |
| Hero: «Quiero conducir» | `/` | Empezar a ser conductor | Navega a una página informativa sin ninguna acción | PARCIAL | P0 |
| Selector de 10 servicios | `/` | Ver cada servicio en el teléfono | Cambia el texto; **9 de 10 muestran la misma pantalla** | PARCIAL | P1 |
| «Todo para quien pide» / «…quien conduce» | `/` | Ampliar información | Navegan correctamente | FUNCIONA | P3 |
| 3 tarjetas de zona | `/` | Mover el mapa a esa zona | La cámara vuela; cambia `aria-current` | FUNCIONA | — |
| Pines del mapa | `/` | Abrir información de la zona | Muestran el nombre; no llevan a ninguna parte | PARCIAL | P2 |
| Mapa: zoom | `/` | Acercarse | Sin controles y rueda desactivada: imposible | NO EXISTE | P2 |
| Mapa: buscar mi dirección | `/` | Saber si me cubren | No existe | NO EXISTE | P1 |
| Distintivos Google Play / App Store | `/#descargar` | Ir a la tienda | `<span>` con imagen, no son enlaces (deliberado) | PLACEHOLDER | P1 |
| Aviso «Disponible cuando se publique» | `/#descargar` | Explicar la espera | Atributo `title`: invisible en móvil y con teclado | PARCIAL | P2 |
| «Quiero conducir» / «Quiero ser aliado» (descarga) | `/#descargar` | Convertir | Navegan a páginas sin acción | PARCIAL | P0 |
| «Ver más» | `/pasajeros` | Ampliar | Ancla a `/#descargar` | FUNCIONA | P3 |
| CTA de postulación | `/conductores` | Postularme | **No existe ninguno** | NO EXISTE | P0 |
| Formulario de conductor | `/conductores` | Dejar mis datos y documentos | No existe (el backend sí lo soporta) | NO EXISTE | P0 |
| Aviso «Contenido pendiente» | `/conductores` | Explicar la espera | Se muestra, pero su texto no describe la realidad | PLACEHOLDER | P1 |
| CTA de alta de comercio | `/aliados` | Darme de alta | **No existe ninguno** | NO EXISTE | P0 |
| «Se coordina con el equipo» | `/aliados` | Decirme cómo contactar | No da ningún medio de contacto | DEAD CTA | P0 |
| FAQ «¿Cómo me hago conductor?» | `/ayuda` | Decirme cómo | «Regístrate en la app» — la app no existe | DEAD CTA | P0 |
| Contacto: correo, teléfono, WhatsApp, redes | todo el sitio | Hablar con la empresa | **Cero canales**, ni enlace ni texto | NO EXISTE | P0 |
| Formularios de cualquier tipo | todo el sitio | Dejar datos | **Cero formularios y cero campos** | NO EXISTE | P0 |
| Lista de espera / «avísame» | `/#descargar`, cobertura | Que me avisen | No existe | NO EXISTE | P0 |
| Página 404 | cualquier URL errónea | Volver al sitio | La de fábrica de Next, en inglés, sin marca, 1 enlace | NO EXISTE | P1 |
| Analítica y cookies | todo el sitio | — | Cero de todo; ningún `Set-Cookie` | NO EXISTE | P0 |
| Cabeceras de seguridad | todo el sitio | — | Sólo HSTS; sin CSP, nosniff, frame-ancestors, referrer | PARCIAL | P1 |
| Privacidad y Términos | `/privacidad`, `/terminos` | Documento legal | Marcador que declara no ser válido | PLACEHOLDER | P0 |
| Eliminación de cuenta | — | Exigida por Google Play | No existe | NO EXISTE | P1 |
| Correo entrante del dominio | — | Recibir en `@mas58express.com` | Sin MX; además sin SPF ni DMARC | NO EXISTE | P0 |
| `admin-staging.mas58express.com` | — | — | Panel y alta de conductor públicos e indexables, sin enlazar | PARCIAL | P0 |
| `POST /api/driver-applications` | — (backend) | Recibir postulaciones | Existe, público y funcionando; **el sitio no lo llama** y el CORS le da 403 | NO EXISTE (en la web) | P0 |

---

## 2. Qué funciona hoy

Verificado con clics reales, no leyendo `href`.

| Elemento | Página | Comportamiento comprobado |
|---|---|---|
| Barra de navegación (6 entradas) | las 10 | Navega correctamente. Área táctil de 44 px |
| Menú móvil | las 10 | Abre a pantalla completa, atrapa el foco, Escape cierra y devuelve el foco |
| Pie (7 entradas + 2 legales) | las 10 | Navega correctamente; incluye `/pasajeros`, que no está en la barra |
| Logo → `/` | las 10 | Navega (salvo estando ya en la portada, donde no hace nada) |
| «Conoce la app» → `/#descargar` | las 10 | **Funciona de verdad**: desde una página interna navega a la portada y se detiene en la sección de descarga (`scrollY 10.075 px`, sección visible) |
| «Quiero conducir» / «Quiero ser aliado» | `/` | Navegan a `/conductores` y `/aliados` |
| «Todo para quien pide/conduce» | `/` | Navegan a `/pasajeros` y `/conductores` |
| Selector de 10 servicios | `/` | Los botones responden y cambian el texto |
| 3 tarjetas de zona + mapa | `/` | **Funciona**: cambian `aria-current` y la cámara del mapa vuela — comprobado por cambio de teselas |
| Pines del mapa | `/` | Reaccionan al puntero y al clic mostrando el nombre de la zona |
| Salto al contenido | las 10 | Funciona con teclado (Tab + Intro lleva el foco a `<main>`) |
| `www` → apex | — | 308 conservando la ruta |

Además, y conviene no confundirlo con «no hay medición»: el sitio **sí tiene medición técnica** —suite de
62 pruebas Playwright, 21 análisis axe sin infracciones, Lighthouse 100/100/100/100 en escritorio y
93/100/100/100 en móvil—. Lo que no existe es **analítica de negocio**.

---

## 3. Qué sólo parece funcionar

| Elemento | Parece | Es |
|---|---|---|
| **Selector de servicios** | Que el teléfono enseña cada uno de los diez servicios | **Nueve de los diez muestran la misma captura** (`home`). Sólo «Transporte seguro» cambia a `driver`. El visitante ve diez veces la misma pantalla creyendo ver diez servicios |
| **`/conductores`** | La página donde te haces conductor | Texto. Su único `<button>` es la hamburguesa. Termina en un recuadro «Contenido pendiente» |
| **`/aliados`** | La página donde tu comercio se da de alta | Texto. Mismo caso. El aviso dice que el alta «se coordina directamente con el equipo» — y no da forma de alcanzar a ese equipo |
| **Distintivos de Google Play y App Store** | Enlaces a las tiendas | `<span>` con imagen, al 55 % de opacidad y en escala de grises. Deliberado y honesto, pero no son enlaces |
| **Aviso «Disponible cuando se publique»** | Una explicación al pasar el ratón | Atributo `title`: no aparece en móvil ni con teclado. En táctil, el 90 % del tráfico esperado, el visitante no recibe ninguna explicación |
| **Pines del mapa** | Puntos de interés que abren algo | Muestran el nombre. No abren nada ni llevan a ninguna parte |
| **`/ayuda`** | Soporte | Seis preguntas. «¿Cómo me hago conductor?» responde «te registras… subes tu documentación» — y no hay dónde registrarse. Callejón sin salida |
| **Textos legales** | Política de privacidad y términos | Marcadores que declaran por escrito que no son documentos válidos |

---

## 4. CTA muertos y callejones

No hay ningún `href="#"`, ningún `javascript:void(0)` ni ningún enlace roto: **en sentido estricto no hay CTA
muertos**. Lo que hay es peor de diagnosticar y más caro comercialmente: **embudos que terminan en pared**.

```
Portada → «Quiero conducir»   → /conductores → (nada)
Portada → «Quiero ser aliado» → /aliados     → (nada)
Portada → «Conoce la app»     → #descargar   → «Próximamente», sin captura de interés
/ayuda  → «¿Cómo me hago conductor?» → «regístrate en la app» → la app no existe
```

Y un bucle cerrado: en `/conductores`, el único botón primario visible es «Conoce la app», que devuelve a la
portada, cuyo botón de conductor devuelve a `/conductores`.

**Tres defectos aislados** (verificados con clic real):

| Defecto | Dónde | Estado |
|---|---|---|
| El logo no hace nada estando en la portada | `/` | Menor: debería subir al inicio |
| «Aliados» y «Nosotros» no hacen nada estando en esa misma página | `/aliados`, `/nosotros` | Menor |
| **La página 404 es la de fábrica de Next**: fondo blanco, en inglés, sin marca, sin barra, **un solo enlace en toda la página** | cualquier URL inexistente | **P1** — es el destino de toda campaña mal enlazada |

---

## 5. Formularios

**No existe ninguno.** Ni contacto, ni conductor, ni aliado, ni empresas, ni soporte, ni lista de espera, ni
lanzamiento, ni boletín.

| | UI | Validación | POST/API | Persiste | Correo | Confirmación | Antispam | Límite |
|---|---|---|---|---|---|---|---|---|
| Contacto | NO | NO | NO | NO | NO | NO | NO | NO |
| Conductor | NO | NO | NO | NO | NO | NO | NO | NO |
| Aliado | NO | NO | NO | NO | NO | NO | NO | NO |
| Empresas | NO | NO | NO | NO | NO | NO | NO | NO |
| Soporte | NO | NO | NO | NO | NO | NO | NO | NO |
| Lista de espera | NO | NO | NO | NO | NO | NO | NO | NO |
| Boletín | NO | NO | NO | NO | NO | NO | NO | NO |

El proyecto web no tiene **ningún** manejador de ruta (`app/**/route.ts` = 0), ninguna acción de servidor
(`"use server"` = 0), ninguna llamada `fetch` y ninguna variable de entorno. Las diez rutas se hornean en el
build y se sirven estáticas.

---

## 6. Conversión de conductores — `/conductores`

**Qué ocurre cuando alguien decide «quiero conducir»: nada.**

| Pieza | Estado |
|---|---|
| CTA en la portada | **FUNCIONA** (dos: hero y sección de descarga) |
| Destino | **FUNCIONA** — `/conductores`, HTTP 200 |
| CTA propio en `/conductores` | **NO EXISTE** |
| Formulario | **NO EXISTE** |
| API | **NO EXISTE en el sitio** — pero **SÍ en el backend** |
| Persistencia | **NO EXISTE en el sitio** |
| Correo de aviso | **NO EXISTE en el sitio** |
| Seguimiento | **NO EXISTE** (cero analítica) |

**El activo que nadie está usando.** `server/routes/driverApplications.js:206` expone
`POST /api/driver-applications` **sin `requireAuth`** — es público a propósito: quien aún no tiene cuenta debe
poder postularse. Acepta multipart, exige documentación, crea usuario y expediente, persiste y emite
`driver_application:new` a los administradores. El Admin tiene la pestaña **«Solicitudes»** para resolverlas.
La API está viva (`api-staging.mas58express.com/api/health` → 200).

**Y hay más: la postulación ya está desplegada bajo el dominio de marca.**
`admin-staging.mas58express.com` responde 200, sirve «SOLICITUD DE CONDUCTOR» y apunta a la API viva. No
está enlazada desde el sitio, no tiene `robots.txt` y por tanto es indexable — con la identidad visual
antigua y el lema «Tu moto, al instante», que contradice el mensaje de «todavía no está publicada».

> **Decisión P0 más barata de toda la auditoría:** decidir qué se hace con `admin-staging`. O es el destino
> al que enlazar hoy mismo con una etiqueta `<a>`, o se cierra y se despublica. Hoy no es ninguna de las dos.

**El bloqueo real:** CORS. Confirmado con preflight, no supuesto.

---

## 7. Conversión de aliados — `/aliados`

Más vacío todavía, porque aquí **tampoco existe el producto detrás**.

| Pieza | Estado |
|---|---|
| CTA en la portada | **FUNCIONA** |
| CTA propio en `/aliados` | **NO EXISTE** |
| Formulario / validación / backend / almacenamiento / correo / confirmación | **NO EXISTE** |
| Modelo de comercio en el backend | **NO EXISTE** — ni rol, ni tabla, ni endpoint |
| Bandeja en el Admin | **NO EXISTE** (el Admin tiene 8 pestañas: Operaciones, Flota, Solicitudes, Usuarios, Tarifas, Recargas, Finanzas, Soporte) |

La diferencia con conductores es decisiva para planificar: **conductores es cablear; aliados es construir.**
La página promete «presencia en la aplicación» y «entregas sin flota propia», y detrás no hay ni una línea
de producto. Mientras eso siga así, lo honesto y suficiente es capturar el interés (nombre, negocio,
teléfono) y responder a mano.

---

## 8. Contacto y soporte

**Cero canales.** Ni como enlace ni como texto plano, en el HTML de las diez rutas: sin `mailto:`, sin
`tel:`, sin `wa.me`, sin redes sociales. El pie contiene navegación, formas de pago y aviso de copyright.

Y el dominio **tampoco puede recibir correo**, comprobado en DNS:

```
mas58express.com        MX  → SIN REGISTRO
mas58express.com        TXT → SIN REGISTRO   (no hay SPF)
_dmarc.mas58express.com TXT → SIN REGISTRO   (no hay DMARC)
```

Dos consecuencias. La primera: publicar `hola@mas58express.com` hoy sería publicar un buzón que no existe.
La segunda, que no estaba en ningún informe previo y es de seguridad: **sin SPF ni DMARC en el dominio
organizativo, cualquiera puede enviar correo firmando como `@mas58express.com`** y ningún receptor lo
rechazará — justo mientras se construye la confianza de marca.

> El subdominio `send.mas58express.com` sí tiene MX, SPF y DKIM: es el canal de **salida** de Resend que usa
> el backend para los códigos de verificación. Sirve para enviar, no para recibir, y no protege al apex.

---

## 9. Descarga y tiendas — y la lista de espera

**Comportamiento actual:** `STORES = { available: false, google: null, apple: null, label: "Próximamente" }`
en `lib/content.ts`. Los distintivos son imágenes inertes atenuadas. El ancla funciona. No hay QR, ni enlace
de beta, ni deep link, ni manifiesto instalable (`/manifest.json` → 404).

Es **honesto y está bien resuelto como declaración**. Como embudo es un final muerto: el visitante más
convencido del sitio —el que ha bajado hasta el final— se encuentra con «vuelve luego» y ninguna forma de
que le avisen.

**¿Se puede convertir en «Avísame cuando esté disponible»?** Sí, y es la pieza de mayor retorno por esfuerzo
de toda la auditoría. Lo que exige, en orden:

1. **Un documento de privacidad válido y un responsable identificado.** Pedir un correo sin eso no es una
   decisión de producto, es un problema legal. **Bloqueante.**
2. **Dónde aterriza el dato.** Tres opciones reales: una ruta de Next en Vercel contra un almacén propio;
   el backend de Railway (exige resolver el CORS); o un proveedor de listas. Decisión de arquitectura, §17.
3. **Doble confirmación por correo** — sin ella, la lista es un vertedero de direcciones ajenas.
4. **Antibot** (Turnstile o, como mínimo, honeypot + tiempo mínimo de relleno) y **límite de peticiones**.
5. **Qué se promete exactamente**: un solo aviso el día del lanzamiento, y darse de baja en un clic.

Riesgo real a nombrar: una lista recogida hoy y usada dentro de seis meses tiene una tasa de rebote alta y
puede quemar la reputación del dominio recién estrenado. Si se hace, se envía **pronto** y **una vez**.

---

## 10. Mapa y cobertura

**Es una ilustración interactiva, no una herramienta de consulta.** Y funciona bien en lo que hace.

| Aspecto | Realidad |
|---|---|
| Datos | **Estáticos**: tres zonas escritas a mano en `lib/zonas.ts` (Santa Cruz de Mara, El Moján, Maracaibo) |
| Clic en tarjeta | **FUNCIONA** — la cámara vuela (verificado por cambio de teselas) |
| Recorrido por scroll | **FUNCIONA** — la zona activa sigue a la lectura |
| Pines | Muestran el nombre; no abren nada |
| Arrastrar | Sí |
| **Zoom** | **NO** — sin controles y con la rueda desactivada: el visitante no puede acercarse |
| Búsqueda de dirección | **NO EXISTE** |
| Consulta «¿cubrís mi barrio?» | **NO EXISTE** |
| Geocodificador | **NO EXISTE** |
| Persistencia | **NO EXISTE** |
| Teselas | OpenStreetMap sin clave, **sin alternativa ni estado de error** si dejan de servir |

**El hueco comercial más desaprovechado del sitio.** La cobertura es la sección con más código y la única
donde **el visitante ya ha declarado intención y ubicación** al recorrer las zonas. Si su respuesta es «no
llegan a mi zona», el sitio no le ofrece absolutamente nada: ni «avísame cuando lleguen», ni un dato de
demanda que justifique abrir esa zona mañana.

Dos avisos operativos: usar la teselería gratuita de OSM en un sitio comercial va contra su política de uso;
y cada visitante que llega a esa sección **envía hoy su IP a un tercero** (OSMF, Reino Unido) sin que exista
política de privacidad que lo declare.

---

## 11. Contenido y CMS

Todo el contenido está **compilado**: 186 cadenas de copy en 23 ficheros, diez rutas prerenderizadas, cero
`fetch`, cero `process.env`. Cambiar una coma exige commit y despliegue.

| Debería seguir en código | Debería poder gestionarse sin desplegar |
|---|---|
| Estructura de las páginas y navegación | **El interruptor de lanzamiento y las URL de tienda** — el día del lanzamiento no se puede depender de un despliegue |
| Copy de marca (hero, titulares) | **Zonas de cobertura** — abrir una zona es una decisión de negocio |
| Los diez servicios y su orden | **FAQ** — crece con las preguntas reales |
| Textos de seguridad | **Avisos temporales** (lanzamiento, promociones) |
| Metadatos y SEO técnico | **Logotipos y fichas de aliados**, cuando existan |

**Realidad del Admin, que conviene no dar por hecha:** hoy **no gestiona contenido**. Sus ocho pestañas son
operativas (flota, solicitudes, usuarios, tarifas, recargas, finanzas, soporte). La idea de administrar
banners y comercios es un plan, no una capacidad existente.

---

## 12. Analítica

**Inventario: cero de todo.** Verificado sobre el HTML servido, las cabeceras y el `package.json`.

| | Estado |
|---|---|
| Google Analytics / GTM | NO |
| Meta Pixel / TikTok Pixel | NO |
| Vercel Analytics | **NO activado** (`/_vercel/insights/script.js` → 404) |
| Vercel Speed Insights | NO |
| Eventos propios | NO |
| Cookies | **0 en las diez rutas** (ningún `Set-Cookie`) |
| `localStorage` / `sessionStorage` | NO |

Es una hoja en blanco: **no hay nada que desmontar y no hace falta banner de consentimiento hoy**. También
significa que hoy nadie sabe cuánta gente entra, desde dónde, con qué móvil ni qué hace.

**Esquema de eventos propuesto** (para cuando haya algo que medir — no implementar ahora):

| Evento | Propiedades | Por qué |
|---|---|---|
| `zona_consultada` | zona, origen (scroll/clic) | La única señal de intención + ubicación que ya existe |
| `fuera_de_cobertura` | texto consultado | Demanda que justifica abrir zona |
| `waitlist_enviada` | rol (pasajero/conductor/comercio), zona | **Métrica norte hasta el lanzamiento** |
| `postulacion_conductor_iniciada` / `_enviada` | paso abandonado | Embudo de conductores |
| `contacto_abierto` | canal (WhatsApp/correo) | Mide el canal que hoy no existe |
| `tienda_pulsada` | tienda, plataforma | El día que haya tiendas |

**Métrica norte hasta el lanzamiento: contactos cualificados captados por semana**, partidos por rol. No
visitas.

---

## 13. Seguridad web

Lo que hoy protege al sitio es, sobre todo, **no tener superficie**: es estático, sin cookies, sin secretos,
sin entradas.

**Cabeceras reales de producción** — sólo hay una:

```
Strict-Transport-Security: max-age=63072000        (sin includeSubDomains, sin preload)
Cache-Control, Server: Vercel
```

**Faltan por completo:** `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options` /
`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`. Contraste incómodo: **la API sí las trae todas**
(helmet), y el sitio público, que es el que ve todo el mundo, no.

**Qué cambia en cuanto exista el primer POST** — hoy nada de esto existe porque no hace falta:

| Control | Hoy | Necesario antes del primer formulario |
|---|---|---|
| Validación en servidor con esquema y lista blanca | — | **Sí, P0** |
| Saneado en el destino (no en la entrada) | — | Sí |
| CSRF | — | Según destino: token si es ruta de Next; no aplica igual si es API con CORS estricto |
| Límite de peticiones | — | **Sí** — por IP y por campo clave |
| Antibot (Turnstile / honeypot) | — | **Sí** |
| CORS | **Bloquea el propio dominio (403)** | **Resolver antes de cablear nada** |
| Gestión de secretos | El proyecto web no tiene ninguno | Sí, en cuanto haya proveedor de correo o almacén |

---

## 14. Legal

`/privacidad` y `/terminos` responden 200, llevan `noindex, nofollow`, están fuera del sitemap y sirven un
recuadro que declara por escrito que **no son documentos legales válidos**. No hay texto legal en ninguna
otra parte del repositorio.

Eso es honesto y correcto hoy. Deja de serlo en dos momentos: **cuando se pida el primer dato personal** y
**cuando se publique la app en las tiendas**.

| Documento | Estado | Cuándo bloquea |
|---|---|---|
| Política de privacidad real | **NO EXISTE** | Bloquea cualquier formulario **y** la publicación en ambas tiendas |
| Responsable del tratamiento + correo para derechos | **NO EXISTE** | Igual |
| Términos y condiciones (pasajero) | **NO EXISTE** | Publicación en tiendas |
| **Página pública de eliminación de cuenta y datos** | **NO EXISTE** | **Google Play la exige con URL pública**, alcanzable sin instalar la app |
| Términos del conductor (documento aparte) | NO EXISTE | Al abrir el alta de conductores |
| Términos de aliados | NO EXISTE | Al abrir el alta de comercios |
| Política de cookies | No aplica hoy | Sólo si se añade analítica |

Dos cosas que ya deberían constar aunque no haya formularios: **la identidad del responsable** y **la
transferencia a un tercero que ya ocurre** (las teselas de OSM ven la IP de cada visitante).

No redacto texto legal: esto lo firma alguien con criterio jurídico sobre el tratamiento real.

---

## 15. SEO comercial

El SEO técnico está hecho. Lo que falta es que **alguna página pueda convertir** y que la marca exista como
entidad para un buscador (`ld+json` = 0 en las ocho rutas indexables; el sitio no está verificado en Search
Console).

**Páginas recomendadas** — y sólo cuando haya algo que ofrecer en ellas:

| Página | Intención | Recomendación |
|---|---|---|
| `/mototaxi-maracaibo` | Transaccional local, el mayor volumen del mercado | **Sí, P2** — pero sólo con captura (waitlist o WhatsApp). Sin eso, es otra página sin salida |
| `/delivery-maracaibo` | Transaccional local | **Sí, P2**, mismas condiciones |
| `/mototaxi-mara` · `/delivery-mara` | Volumen mucho menor | **Sí, P3** — su valor es la especificidad local (Santa Cruz de Mara, El Moján), donde casi nadie compite |
| `/conductores/maracaibo` | «trabajar de mototaxista en Maracaibo» | **Recomendada y por delante de las anteriores**: la intención de oferta es más fácil de servir hoy, porque el alta de conductor ya existe en el backend |
| `/comercios/maracaibo` | «vender por delivery» | Sólo cuando haya producto de comercios |
| Páginas por barrio | — | **No recomendadas**: no hay contenido honesto con que llenarlas y canibalizan |

**Advertencia que manda sobre todo lo anterior:** la regla del proyecto es no publicar ni una cifra que no se
pueda respaldar. Hoy no hay usuarios, ni viajes, ni valoraciones, ni cobertura por barrios que citar. Una
página de localidad honesta se llena con **lugares reales, zonas reales y el servicio real** — y con poco
más. Crear seis páginas delgadas para posicionar sin nada detrás perjudica más que ayuda.

---

## 16. Prioridades

### P0 — bloqueante antes de cualquier marketing real

| # | Hueco | Esfuerzo |
|---|---|---|
| 1 | **Un canal de contacto visible en todo el sitio** (WhatsApp de empresa es lo más barato y lo que el mercado espera) | bajo |
| 2 | **Decidir qué se hace con `admin-staging.mas58express.com`**: enlazarlo como alta de conductores hoy, o cerrarlo y despublicarlo | bajo |
| 3 | **Resolver el CORS**: el backend rechaza al propio dominio con 403 | bajo |
| 4 | **Política de privacidad válida + responsable identificado** — bloquea formularios y tiendas | alto |
| 5 | **Captura de interés** (waitlist) en la sección de descarga y en cobertura | medio |
| 6 | **Un punto de entrada de postulación de conductor** en `/conductores` | medio |
| 7 | **Medición mínima**: analítica respetuosa con la privacidad y Search Console | bajo |
| 8 | **MX, SPF y DMARC en el apex** — recibir correo y dejar de ser suplantable | bajo |

### P1 — muy importante

Página 404 propia en español con navegación · cabeceras de seguridad en `next.config.ts` · el teléfono del
selector de servicios enseñando pantallas distintas (o no prometiéndolo) · alta de comercios aunque se
resuelva a mano · acuse de recibo y plazo comprometido · JSON-LD de Organization y FAQPage · interruptor de
lanzamiento que no exija desplegar · fallback y estado de error para las teselas · página de eliminación de
cuenta.

### P2 — crecimiento

Consulta «¿cubrís mi dirección?» con geocodificador · zoom en el mapa · páginas de localidad con captura ·
bandeja de comercios en el Admin · términos de conductor y de aliados · imagen social por página · eventos
de primera parte hacia el backend propio · centralizar el contenido que queda disperso.

### P3 — futuro

Gestión de contenido desde el Admin · PWA instalable y QR · puente de atribución web→app · política de
cookies si llega analítica con cookies · `security.txt` · horarios y expectativa de respuesta.

---

## 17. Arquitectura recomendada

**La decisión que ordena todas las demás: dónde aterriza el primer POST.** Tres caminos reales:

| Opción | A favor | En contra |
|---|---|---|
| **A · Ruta de Next en Vercel** (`app/api/.../route.ts`) hacia un almacén propio | Mismo origen, sin CORS, sin depender del backend; despliegue atómico con el sitio | Hay que elegir almacén y proveedor de correo; duplica lógica si luego se unifica |
| **B · El backend de Railway que ya existe** | Reutiliza `driver-applications`, la bandeja del Admin y Resend, que ya funcionan | Exige resolver el CORS **y** depender de un servicio en plan Free con arranque en frío |
| **C · Proveedor externo de formularios** | Inmediato | Datos personales fuera, marca prestada, difícil de auditar |

**Recomendación: A para la captura de interés, B para la postulación de conductores.** La waitlist es dato
propio, simple y de alta rotación: no merece acoplarse al backend de la app. La postulación, en cambio, ya
está construida, revisada y con bandeja de administración: duplicarla sería absurdo.

Con dos condiciones previas e ineludibles: **CORS resuelto** y **privacidad publicada**.

---

## 18. Plan por fases

**Fase 0 · Abrir la puerta (días, sin backend nuevo)**
Canal de contacto visible en el pie y en `/conductores` y `/aliados`. Decisión sobre `admin-staging`. Página
404 propia. Cabeceras de seguridad. Analítica mínima + Search Console. MX, SPF y DMARC.
→ *El sitio deja de ser un callejón sin salida.*

**Fase 1 · Captar (cuando exista privacidad)**
Waitlist en descarga y en cobertura, con doble confirmación, antibot y límite de peticiones. Eventos de
conversión. Corregir el selector de servicios.
→ *El sitio empieza a producir contactos cualificados.*

**Fase 2 · Convertir conductores (cablear lo que ya existe)**
Resolver CORS. Formulario de postulación en `/conductores` contra `POST /api/driver-applications`. Aviso al
equipo fuera de la app. Seguimiento del embudo.
→ *La web alimenta la operación.*

**Fase 3 · Comercios y territorio**
Alta de comercios, primero resuelta a mano. Consulta de cobertura con geocodificador. Páginas de localidad
con captura. Bandeja en el Admin.

**Fase 4 · Lanzamiento**
Interruptor de lanzamiento gobernado sin desplegar. Enlaces reales a tiendas. Aviso único a la lista.
Términos completos y eliminación de cuenta publicadas antes de enviar la app a revisión.

---

## Anexo · Método, y qué hubo que corregir

La auditoría combinó un rastreo propio con Playwright (290 pulsaciones reales sobre producción) y diez
auditorías paralelas por dimensión, más un crítico de completitud. **Cuatro afirmaciones de los auditores no
sobrevivieron a la comprobación y no están en este informe:**

1. «La API está caída» — **falsa**: `api-staging.mas58express.com/api/health` responde 200. El host muerto
   está en el bundle antiguo de `plus58express.vercel.app`.
2. «El backend no expone ningún endpoint público de escritura» — **falsa**:
   `POST /api/driver-applications` no lleva `requireAuth`.
3. «No hay proveedor de correo en el proyecto» — **falsa para el backend**: Resend está integrado y el
   arranque de staging declara `EMAIL=configurado`. Es cierta sólo para el proyecto web.
4. «No hay medición» — **imprecisa**: hay medición técnica (Playwright, axe, Lighthouse). Lo que no hay es
   analítica de negocio.

Un aviso de método que conviene conservar: **auditar este sitio con `curl` da resultados falsos**. El mapa
llega por `dynamic(ssr:false)` y no aparece en el HTML servido, así que cualquier afirmación del tipo «los
únicos botones de la página son X» obtenida sin navegador es inválida. Las cifras de este informe proceden
del rastreo con navegador real.
