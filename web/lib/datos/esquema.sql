-- Esquema del almacén de la web pública — proyecto Supabase «+58Express Web».
--
-- Este fichero es la DECLARACIÓN de lo que la aplicación espera encontrar, y se
-- guarda en el repositorio para que dentro de un año se pueda responder «¿cómo
-- era la tabla?» sin abrir un panel. No se ejecuta en ningún despliegue: las
-- tablas se crean a mano, una vez, y `scripts/verificar-esquema.mjs` comprueba
-- que lo que hay en la base coincide con lo que dice esto.
--
-- POR QUÉ RLS ACTIVADO Y SIN NINGUNA POLÍTICA
--
-- No es un descuido a medio terminar: es la configuración correcta para estas
-- dos tablas. Row Level Security con cero políticas significa «nadie que llegue
-- por la API pública puede leer ni escribir aquí», y eso es exactamente lo que
-- se quiere, porque el navegador NO debe consultar estas tablas nunca. El único
-- acceso ocurre desde el servidor, con la cadena de conexión del pooler, que
-- salta RLS por ser el rol propietario. Publicar una política sería abrir una
-- puerta que nadie necesita.

-- ---------------------------------------------------------------------------
-- 1. Lista de espera  (YA EXISTE — aquí sólo queda documentada)
-- ---------------------------------------------------------------------------
create table if not exists public.lista_de_espera (
  id                 uuid primary key default gen_random_uuid(),
  email              text        not null unique,   -- normalizado: recortado y en minúsculas
  rol                text,                          -- pasajero | conductor | comercio
  zona               text,                          -- santa-cruz-de-mara | el-mojan | maracaibo
  estado             text        not null default 'pendiente',
  token_confirmacion text,                          -- se pone a NULL al confirmar: el enlace vale una vez
  token_expira_en    timestamptz,
  token_baja         text,                          -- DISTINTO del de confirmación, y no se borra nunca
  confirmado_en      timestamptz,
  baja_en            timestamptz,
  origen             text,                          -- campaña o utm_source; jamás identifica a una persona
  ip_hash            text,                          -- HMAC-SHA256 con sal secreta; nunca la IP en claro
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);

-- El índice único sobre `email` no es un detalle de rendimiento: es lo que hace
-- que el alta sea idempotente. `ON CONFLICT (email) DO NOTHING` se apoya en él,
-- y sin él dos peticiones simultáneas crearían dos filas del mismo correo.
create unique index if not exists lista_de_espera_email_key
  on public.lista_de_espera (email);

-- Los testigos se buscan por valor en cada clic del correo.
create index if not exists lista_de_espera_token_confirmacion_idx
  on public.lista_de_espera (token_confirmacion);
create index if not exists lista_de_espera_token_baja_idx
  on public.lista_de_espera (token_baja);

alter table public.lista_de_espera enable row level security;
revoke all on public.lista_de_espera from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Contactos de comercios aliados  (YA EXISTE — aquí sólo queda documentada)
-- ---------------------------------------------------------------------------
create table if not exists public.contactos_aliados (
  id                uuid primary key default gen_random_uuid(),
  nombre            text        not null,
  negocio           text        not null,
  telefono          text        not null,
  email             text        not null,
  municipio         text        not null,
  tipo_comercio     text        not null,
  mensaje           text,
  consentimiento_en timestamptz not null,  -- CUÁNDO consintió: un booleano no prueba nada
  estado            text        not null default 'nuevo',
  ip_hash           text,
  creado_en         timestamptz not null default now()
);

alter table public.contactos_aliados enable row level security;
revoke all on public.contactos_aliados from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Intentos  (LO ÚNICO QUE ESTE FICHERO CREA)
-- ---------------------------------------------------------------------------
-- POR QUÉ HACE FALTA UNA TERCERA TABLA
--
-- El límite de peticiones tiene que contar INTENTOS, no filas creadas. Quien
-- prueba mil veces el mismo correo crea una sola fila en `lista_de_espera` y
-- haría mil intentos invisibles; y los envíos de correo hay que espaciarlos
-- aunque no cambien ninguna fila. Deducir el límite de las tablas de datos
-- contaría de menos justo en el caso que hay que frenar.
--
-- Y tiene que estar en la base, no en memoria: en un despliegue sin servidor
-- cada petición cae en una instancia distinta, así que un contador en memoria
-- protege de los robots que tengan la mala suerte de repetir instancia — o sea,
-- de ninguno.
--
-- NO GUARDA NI UN DATO PERSONAL. La clave es 'waitlist:<hmac de la ip>',
-- 'aliados:<hmac de la ip>' o 'envio:<id de la fila>'. Ni correos, ni IPs, ni
-- nombres: por eso el borrado de una fila de `lista_de_espera` no deja aquí
-- ningún rastro que identifique a nadie.
--
-- POR QUÉ UNA FILA-CONTADOR Y NO UN REGISTRO DE INTENTOS
--
-- La forma evidente sería una fila por intento y un `count(*)` sobre la ventana.
-- No sirve, y el motivo es sutil: en Postgres cada sentencia trabaja sobre la
-- instantánea que tomó al empezar, así que cincuenta peticiones simultáneas
-- cuentan las cincuenta CERO intentos previos —ninguna ve las filas de las otras,
-- que aún no han confirmado— y las cincuenta pasan el límite. Un contador así
-- sólo frena a quien va despacio, que es justo quien no hace falta frenar.
--
-- `ON CONFLICT ... DO UPDATE SET n = n + 1` sí toma cerrojo sobre la fila: la
-- segunda petición ESPERA a la primera y recibe 2, no 1. El precio es que la
-- ventana pasa a ser fija en vez de deslizante —en el peor caso, el del cambio
-- de cubo, caben hasta el doble de intentos—, y ese precio se paga con gusto: un
-- límite aproximado que se cumple siempre vale más que uno exacto que se rompe
-- precisamente cuando lo atacan.
--
-- `ventana` es el inicio del cubo. Para los envíos de correo, que no cuentan sino
-- que anotan el último, se usa el cubo 'epoch' y se lee `ultimo_en`.
create table if not exists public.intentos_web (
  clave     text        not null,
  ventana   timestamptz not null,
  n         integer     not null default 0,
  ultimo_en timestamptz not null default now(),
  primary key (clave, ventana)
);

-- El barrido de lo viejo mira `ultimo_en`, no `ventana`: las filas de envíos
-- viven en el cubo 'epoch' y con `ventana` se borrarían todas en el primer pase.
create index if not exists intentos_web_ultimo_en_idx
  on public.intentos_web (ultimo_en);

alter table public.intentos_web enable row level security;
revoke all on public.intentos_web from anon, authenticated;
