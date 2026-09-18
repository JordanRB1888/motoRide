# Insumo para redactar lo legal del sitio público

**Esto NO es asesoría legal.** Es el inventario técnico de qué datos toca el sitio
hoy, qué datos tocará, con qué proveedores y durante cuánto tiempo, para que quien
redacte la política de privacidad y los términos escriba sobre hechos y no sobre
suposiciones.

**Sitio:** <https://mas58express.com> · **Rama:** `feat/public-marketing-site`
**Fecha:** 13 de septiembre de 2026 · **Estado del sitio:** sin formularios, sin cookies

---

## 1. Lo que ocurre HOY, sin que nadie rellene nada

| Qué pasa | Dato implicado | Quién lo ve | Evidencia |
|---|---|---|---|
| El sitio se sirve desde Vercel | IP, cabeceras, ruta pedida, agente de usuario | **Vercel** (EE. UU.) | Registros de la plataforma; el sitio no los consulta |
| La sección de cobertura carga el mapa | **IP del visitante y qué teselas pide** | **OpenStreetMap Foundation** (Reino Unido) | `components/map/MapaZonas.tsx:39` → `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| Nada más | — | — | 0 cookies (`Set-Cookie` ausente en las diez rutas), 0 analítica, 0 píxeles, 0 `localStorage` |

**Lo que hay que declarar aunque no haya formularios:** la transferencia a
OpenStreetMap ya ocurre en cada visita que llega al mapa. Hoy no está declarada en
ninguna parte, y `/privacidad` es un marcador que dice explícitamente no ser un
documento válido.

**Cookies:** ninguna, ni propia ni de terceros. Mientras siga así **no hace falta
banner de consentimiento**. El día que entre analítica con cookies, sí.

---

## 2. Canales de contacto publicados en esta fase

| Canal | Dato que recibe | Proveedor | Dónde queda |
|---|---|---|---|
| WhatsApp `+58 412-514-3242` | Número de teléfono, nombre de perfil y el contenido del mensaje | **Meta** (WhatsApp) | En el teléfono de quien atiende y en los servidores de Meta |
| Correo `58expressapp@gmail.com` | Dirección de correo, nombre y contenido | **Google** (Gmail) | En la cuenta de Gmail |

Los dos son canales de terceros y no pasan por el sitio: el visitante sale del
navegador hacia WhatsApp o hacia su cliente de correo. **El sitio no guarda nada,
no envía nada y no ve el mensaje.**

Conviene que la política diga, aun así: a qué se dedican esos mensajes, cuánto
tiempo se conservan las conversaciones y quién del equipo tiene acceso.

---

## 3. Lo que vendrá, y qué exige cada cosa

### 3.1 Lista de espera del lanzamiento — **hoy apagada** (`WAITLIST_ENABLED = false`)

| | |
|---|---|
| **Datos** | Correo electrónico. Opcionalmente zona (una de las tres) y rol (pasajero / conductor / comercio) |
| **Finalidad** | **Un solo aviso** el día que la aplicación se publique en la zona |
| **Base para tratarlo** | Consentimiento, dado al enviar el formulario |
| **Proveedor de envío** | Resend (ya integrado en el backend) |
| **Dónde se guarda** | Sin decidir — ver §4 de `public-website-phase-0.md` |
| **Retención propuesta** | Hasta 30 días después del aviso de lanzamiento, o hasta que la persona se dé de baja |
| **Exige además** | Doble confirmación por correo, enlace de baja en cada envío, antibot y límite de peticiones |

> Riesgo que conviene que la política contemple: una lista recogida hoy y usada
> dentro de seis meses rebota mucho y quema la reputación del dominio. Si se
> recoge, se usa pronto.

### 3.2 Postulación de conductor — **hoy no existe en la web**

El backend ya la implementa (`POST /api/driver-applications`, público). Cuando el
sitio la use, tratará datos **sensibles**:

| Dato | Por qué |
|---|---|
| Nombre y apellidos, cédula | Identificación del conductor |
| Teléfono y correo | Contacto y cuenta |
| **Fotografía del documento de identidad** | Verificación |
| **Licencia de conducir** | Requisito legal |
| **Certificado médico** | Requisito legal |
| Datos y fotos del vehículo, placa | Verificación del vehículo |
| Foto de perfil | Identificación ante el pasajero |

**Retención:** distinguir entre la postulación **rechazada** (plazo corto y
borrado) y la **aprobada** (pasa a ser expediente de conductor y se rige por la
relación contractual). Hoy no hay política de borrado escrita.
**Quién accede:** administradores a través del panel.

### 3.3 Formulario de contacto propio — **hoy no existe**

Si algún día sustituye al WhatsApp: nombre, correo, mensaje y, si se decide,
teléfono. Finalidad: responder. Retención sugerida: mientras dure la conversación
y un plazo razonable después.

### 3.4 Protección antibot (Turnstile de Cloudflare) — **futuro**

En cuanto haya un formulario público. Cloudflare recibiría IP y señales del
navegador para decidir si la petición es automática. Es un tercero más que
declarar, y es la alternativa que menos datos recoge frente a un CAPTCHA clásico.

### 3.5 Analítica — **hoy no hay ninguna**

Cuando se decida, la elección determina el documento: una analítica sin cookies y
sin identificadores personales evita el banner; GA4 y los píxeles publicitarios lo
exigen y añaden transferencias internacionales.

---

## 4. Páginas legales que el sitio necesitará

| Documento | Estado | Cuándo pasa a ser obligatorio |
|---|---|---|
| **Política de privacidad** | Marcador | Antes del **primer formulario** y antes de enviar la app a las tiendas |
| **Identidad del responsable + correo para ejercer derechos** | No existe | Igual. Es el dato que hoy falta en todas partes |
| **Términos y condiciones (pasajero)** | Marcador | Publicación en tiendas |
| **Eliminación de cuenta y de datos, con URL pública** | **No existe** | **Google Play la exige** alcanzable sin instalar la app |
| Términos del conductor | No existe | Al abrir la postulación |
| Términos de comercios aliados | No existe | Al abrir el alta de comercios |
| Política de cookies | No aplica | Sólo si entra analítica con cookies |

---

## 5. Lo que hace falta decidir antes de redactar

1. **Quién es el responsable del tratamiento**: persona o sociedad, con domicilio.
   Sin esto no se puede redactar nada.
2. **Un correo para ejercer derechos** — puede ser el mismo público, pero tiene
   que existir y responderse.
3. **Dónde se guardan los datos de la web** (§4 del informe de fase 0): determina
   qué proveedores y qué transferencias hay que declarar.
4. **Plazos de retención** de cada cosa, sobre todo de las postulaciones
   rechazadas, que son las que llevan documentos de identidad.
5. **Si se declara el mapa**: la transferencia a OpenStreetMap ya existe hoy.

---

## 6. Lo que este documento NO es

No es un texto legal, ni un borrador, ni una recomendación jurídica. Es el
inventario de hechos técnicos verificados sobre el sitio, para que quien tenga
criterio legal no tenga que averiguarlos.
