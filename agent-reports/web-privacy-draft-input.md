# Plantilla técnica para la Política de Privacidad del sitio público

> **Esto no es un documento legal ni asesoría jurídica.** Es el andamiaje técnico —
> qué se trata, por qué, con quién y cuánto tiempo— para que quien tenga criterio
> jurídico redacte el texto definitivo sin tener que averiguar los hechos.
>
> **Los `[[CORCHETES DOBLES]]` son huecos que sólo puede rellenar el dueño.** No se
> han inventado: ni razón social, ni domicilio, ni responsable, ni jurisdicción.

**Ámbito de esta plantilla:** <https://mas58express.com> — el sitio público.
**No cubre** la aplicación móvil, que necesitará su propio aviso.
**Fecha:** 13 de septiembre de 2026 · Contrastado con `web-legal-requirements.md`

---

## 0. Huecos que hay que rellenar antes de redactar

| Hueco | Qué es | Por qué bloquea |
|---|---|---|
| `[[RAZÓN SOCIAL]]` | Nombre legal completo de la empresa o de la persona | Sin responsable identificado no hay política válida |
| `[[RIF / CÉDULA]]` | Identificación fiscal | Identifica al responsable ante quien reclame |
| `[[DOMICILIO]]` | Dirección física completa | Exigido para ejercer derechos y por las tiendas |
| `[[RESPONSABLE DEL TRATAMIENTO]]` | Persona o cargo que responde | Es quien firma |
| `[[CORREO DE PRIVACIDAD]]` | Buzón para ejercer derechos | Tiene que **existir y responderse**; hoy no hay MX en el dominio |
| `[[JURISDICCIÓN]]` | Ley aplicable y tribunales | Determina qué normativa se cita |
| `[[PLAZO DE RESPUESTA]]` | Días para atender una solicitud | No prometer lo que no se pueda cumplir |

> Mientras `[[CORREO DE PRIVACIDAD]]` no exista, el único contacto real publicable
> es el WhatsApp `+58 412-514-3242` y el correo `58expressapp@gmail.com`.

---

## 1. Identificación del responsable

```
Responsable:      [[RAZÓN SOCIAL]]
Identificación:   [[RIF / CÉDULA]]
Domicilio:        [[DOMICILIO]]
Contacto:         [[CORREO DE PRIVACIDAD]]
Jurisdicción:     [[JURISDICCIÓN]]
```

---

## 2. Tratamientos que ocurren HOY

Verificados sobre el sitio en producción. Los tres primeros pasan **sin que el
visitante rellene nada**.

### 2.1 Servir el sitio — Vercel

| | |
|---|---|
| **Datos** | Dirección IP, agente de usuario, ruta solicitada, marca de tiempo |
| **Finalidad** | Entregar las páginas y mantener el servicio |
| **Encargado** | **Vercel Inc.** (Estados Unidos) |
| **Transferencia internacional** | Sí |
| **Retención** | La de los registros de la plataforma; +58Express no los consulta ni los conserva |
| **Base** | Interés legítimo en prestar el servicio |

### 2.2 Mapa de cobertura — OpenStreetMap

| | |
|---|---|
| **Datos** | **Dirección IP** y qué teselas del mapa se piden |
| **Finalidad** | Dibujar el mapa de la sección de cobertura |
| **Encargado** | **OpenStreetMap Foundation** (Reino Unido) |
| **Cuándo ocurre** | Al llegar a la sección de cobertura de la portada |
| **Cómo evitarlo** | No hay alternativa hoy; conviene declararlo |

> **Es el tratamiento más fácil de pasar por alto y ya está activo.** Cada visitante
> que baja hasta el mapa envía su IP a un tercero.

### 2.3 Canales de contacto — Meta y Google

| Canal | Datos | Encargado |
|---|---|---|
| WhatsApp `+58 412-514-3242` | Teléfono, nombre de perfil, contenido del mensaje | **Meta** |
| Correo `58expressapp@gmail.com` | Dirección, nombre, contenido | **Google** |

El visitante **sale del sitio** hacia su aplicación: la web no guarda, no envía ni ve
el mensaje. La política debe decir, aun así, para qué se usan esas conversaciones,
cuánto se conservan y quién del equipo accede.

### 2.4 Lo que NO ocurre hoy — conviene decirlo explícitamente

- **Cero cookies**, propias o de terceros (ninguna respuesta trae `Set-Cookie`).
- **Cero analítica**, cero píxeles publicitarios, cero `localStorage`.
- **Cero formularios**: el sitio no tiene ni un campo de entrada.

Por eso **hoy no hay banner de consentimiento**: no habría nada que consentir.

---

## 3. Tratamientos PLANIFICADOS

Ninguno está activo. Cada uno debe entrar en la política **antes** de encenderse.

### 3.1 Lista de espera del lanzamiento

| | |
|---|---|
| **Datos** | Correo electrónico. Opcional: zona (una de tres) y rol (pasajero / conductor / comercio) |
| **Finalidad** | **Un solo aviso** cuando la aplicación se publique |
| **Base** | Consentimiento explícito al enviar el formulario |
| **Encargados** | Resend (envío) · `[[ALMACÉN POR DECIDIR]]` |
| **Retención** | Hasta 30 días después del aviso, o hasta la baja |
| **Derechos** | Baja en un clic, enlazada en cada correo |
| **Exige antes** | Doble confirmación por correo, antibot y límite de peticiones |

### 3.2 Protección antibot — Turnstile

| | |
|---|---|
| **Datos** | IP y señales del navegador |
| **Finalidad** | Impedir altas automáticas |
| **Encargado** | **Cloudflare** |
| **Por qué se elige** | Recoge menos datos que un CAPTCHA clásico y no perfila al visitante |

### 3.3 Postulación de conductor — **datos sensibles**

| | |
|---|---|
| **Datos de identidad** | Nombre, apellidos, cédula, teléfono, correo |
| **Documentos** | **Cédula (anverso y reverso), licencia de conducir, certificado médico, selfie** |
| **Vehículo** | Datos, fotografías y **placa** |
| **Finalidad** | Verificar y aprobar a quien va a transportar personas |
| **Destino** | `POST /api/driver-applications` → volumen propio del backend |
| **Quién accede** | Administradores, desde el panel |
| **Retención** | **Distinguir**: postulación **rechazada** → plazo corto y borrado · **aprobada** → pasa a expediente de conductor y se rige por la relación contractual |

> Es el tratamiento de mayor riesgo de todo el proyecto: documentos de identidad y
> un certificado médico. `[[PLAZO DE BORRADO DE RECHAZADAS]]` tiene que decidirse.

### 3.4 Contacto de comercios aliados

| | |
|---|---|
| **Datos** | Nombre, negocio, teléfono, correo, municipio, tipo de comercio, mensaje |
| **Finalidad** | Evaluar el alta y responder |
| **Base** | Consentimiento |
| **Retención** | `[[PLAZO]]` — propuesta: 12 meses desde el último contacto |

### 3.5 Analítica sin cookies, si se aprueba

| | |
|---|---|
| **Datos** | Evento, ruta, país, tipo de dispositivo — **sin identificador personal, sin cookies** |
| **Finalidad** | Saber qué funciona del sitio |
| **Encargado** | `[[PROVEEDOR POR DECIDIR]]` |
| **Consentimiento** | No haría falta banner si no hay cookies ni identificadores |

### 3.6 Eliminación de cuenta y de datos

| | |
|---|---|
| **Qué es** | Página **pública**, alcanzable **sin instalar la aplicación** |
| **Por qué** | **Google Play lo exige** para aprobar la publicación |
| **Datos** | Los necesarios para identificar a quien solicita |
| **Debe explicar** | Qué se borra, qué se conserva y por qué, y en cuánto tiempo |

---

## 3 bis. Lo que la Fase 1-B dejó CONSTRUIDO (y apagado) — 13/09/2026

La infraestructura ya existe en el código y está probada. **Nada de esto recoge
todavía un solo dato**: los interruptores lo impiden y hay pruebas que lo vigilan
en cada despliegue. Cuando se enciendan, estos son los hechos exactos que la
política tendrá que declarar.

### Encargados del tratamiento, definitivos

| Encargado | Para qué | Qué recibe | Dónde está |
|---|---|---|---|
| **Vercel** | Servir el sitio y ejecutar las rutas de API | IP, cabeceras, ruta | EE. UU. |
| **OpenStreetMap** | Teselas del mapa — **ya activo hoy** | IP del visitante | Reino Unido |
| **Resend** | Correos de confirmación, baja y acuse | Dirección y contenido | UE (`eu-west-1`) |
| **Cloudflare (Turnstile)** | Comprobar que no es un robot | IP y señales del navegador | Global |
| **Vercel Web Analytics** | Medir el uso — **sin cookies ni datos personales** | Evento, ruta, país, dispositivo | EE. UU. |
| **Almacén de la web** | Guardar la lista y los contactos | Ver abajo | **Por decidir** |

> El almacén es **distinto** del de la aplicación a propósito: los datos de la web
> no comparten credenciales ni ciclo de vida con los viajes ni con las cuentas.

### Qué se guarda exactamente

**Lista de espera** — `lista_de_espera`: correo (normalizado) · rol y zona
(opcionales, de una lista cerrada) · estado · **dos testigos distintos**, uno para
confirmar y otro para darse de baja · caducidad del primero · fechas de
confirmación y de baja · origen de campaña (saneado) · **`ip_hash`** · creado y
actualizado.

**Comercios** — `contactos_aliados`: nombre · negocio · teléfono · correo ·
municipio · tipo de comercio · mensaje (opcional) · **`consentimiento_en`, con
fecha y hora** · estado del contacto · `ip_hash` · creado.

### Tres decisiones técnicas con consecuencia legal

1. **La IP nunca se guarda en claro.** Se almacena un HMAC-SHA256 con sal
   secreta: sirve para saber si dos peticiones vienen del mismo sitio y para nada
   más, y sin la sal no se puede revertir. La política puede afirmar con verdad
   que **no se conserva la dirección IP**.
2. **El consentimiento se guarda con fecha y hora**, no como un sí/no. Un
   booleano no prueba nada el día que alguien pregunte cuándo aceptó.
3. **Los correos no llevan rastreo.** Ni píxel de apertura ni enlaces envueltos
   para contar clics — hay una prueba que falla si aparece un `<img>` en la
   plantilla de confirmación.

### Retención, ya implementable

| Dato | Plazo |
|---|---|
| Alta **sin confirmar** | El testigo caduca a las **48 h**; el registro se borra a los 30 días — nunca hubo consentimiento |
| Alta **confirmada** | Hasta 30 días tras el aviso de lanzamiento, o hasta la baja |
| **Baja** | Se conserva la constancia de la baja, no el resto |
| Contacto de comercio | Propuesta: 12 meses desde el último contacto |
| Registro del límite de peticiones | Ventana de 1 hora |

### El límite de peticiones también es un tratamiento

Se guarda el `ip_hash` con marca de tiempo durante una hora para cortar el abuso:
cinco altas por hora y por huella, y un correo de confirmación cada diez minutos
por dirección. Base: interés legítimo en proteger el servicio. Conviene
mencionarlo.

---

## 4. Esqueleto de secciones sugerido

1. Quiénes somos — `[[RAZÓN SOCIAL]]`, `[[DOMICILIO]]`, `[[CORREO DE PRIVACIDAD]]`
2. Qué datos tratamos y por qué — §2 y §3
3. Con quién los compartimos — Vercel, OpenStreetMap, Meta, Google, Resend, Cloudflare
4. Transferencias internacionales — todos los encargados están fuera de Venezuela
5. Cuánto los conservamos — la tabla de retención
6. Tus derechos y cómo ejercerlos — `[[CORREO DE PRIVACIDAD]]`, `[[PLAZO DE RESPUESTA]]`
7. Cookies — hoy ninguna; se actualiza si cambia
8. Menores — `[[EDAD MÍNIMA]]`
9. Seguridad — HTTPS obligatorio, CSP, sin cookies, acceso restringido al panel
10. Cambios en esta política — cómo se avisan
11. Ley aplicable — `[[JURISDICCIÓN]]`

---

## 5. Qué NO debe decir el texto

- No prometer plazos de respuesta que no se puedan cumplir.
- No declarar tratamientos que no existen (hoy: analítica, cookies, publicidad).
- No citar una normativa sin que `[[JURISDICCIÓN]]` esté decidida.
- No publicar `hola@mas58express.com` mientras el dominio no tenga MX.
- No omitir OpenStreetMap por ser «sólo un mapa»: es una transferencia real y activa.

---

## 6. Orden de publicación

1. Rellenar los huecos de §0.
2. Redactar con criterio jurídico sobre §2 y §3.
3. Publicar `/privacidad` y `/terminos`, **quitarles el `noindex`** y devolverlas al sitemap.
4. Sólo entonces: encender la lista de espera (`WAITLIST_ENABLED = true`).
5. Antes de enviar la app a las tiendas: términos completos y eliminación de cuenta.
