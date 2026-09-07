-- =============================================================================
--  +58Express — esquema completo de PostgreSQL
-- =============================================================================
--
--  QUE ES ESTE FICHERO
--
--  Todo el esquema que la aplicacion necesita, en un solo archivo listo para
--  ejecutar sobre una base de datos vacia. 25 tablas, 57 indices, 3 funciones
--  y 4 disparadores.
--
--  POR QUE EXISTE, SI YA HAY MIGRACIONES
--
--  `supabase/migrations/` es la fuente de verdad y `npm run db:migrate` es la
--  forma normal de aplicarla. Este fichero es para el otro caso: montar una
--  base nueva de cero de una sola vez --una copia de desarrollo, un entorno de
--  pruebas, una migracion de proveedor-- sin depender de Node ni del migrador.
--
--  NO ESTA ESCRITO A MANO. Se genera concatenando las migraciones en su orden,
--  para que sea identico por construccion a lo que produce el migrador. Un
--  esquema escrito aparte seria una segunda verdad, y se desincronizaria en
--  cuanto alguien anadiera una migracion.
--
--  COMO SE USA
--
--      createdb plus58express
--      psql -d plus58express -f esquema-completo.sql
--
--  o contra un servidor remoto:
--
--      psql "$DATABASE_URL" -f esquema-completo.sql
--
--  ES IDEMPOTENTE: todo va con IF NOT EXISTS, asi que volver a ejecutarlo sobre
--  una base ya montada no rompe nada ni borra datos.
--
--  AL FINAL SE REGISTRAN LAS MIGRACIONES en `public.schema_migrations`. Sin eso
--  el proximo `npm run db:migrate` intentaria aplicarlas otra vez sobre un
--  esquema que ya las tiene. Con eso, el migrador las ve aplicadas y no hace
--  nada, que es lo correcto.
--
--  LO QUE ESTE FICHERO NO TRAE
--
--  El libro de comisiones del conductor --driver_commission_reservations,
--  driver_finance_state y tres tablas mas-- vive en la rama
--  `feat/driver-finance-1`, que NO esta fusionada. `/api/health` ya anuncia
--  `driverCommissionDebtLedger: true`, pero ese codigo no esta en master. Se
--  entrega aparte, en `esquema-driver-finance.sql`, para aplicarlo el dia que
--  se decida fusionar esa rama.
--
--  Generado el 7 de septiembre de 2026 desde el HEAD de master.
-- =============================================================================


-- =============================================================================
--  Preambulo: los roles que el esquema da por hechos
--
--  Las migraciones terminan revocando todo permiso a `anon` y `authenticated`,
--  que son los dos roles con los que Supabase expone su API publica. Es
--  deliberado y hay que conservarlo: el servidor de +58Express se conecta con
--  su propia DATABASE_URL y NADIE mas debe poder leer estas tablas. Ademas
--  todas llevan RLS activo.
--
--  El problema es que esos dos roles solo existen en Supabase. En un PostgreSQL
--  normal --uno de desarrollo, uno de otro proveedor-- el fichero se paraba en
--  seco con «role "anon" does not exist», y el esquema no llegaba a montarse.
--
--  Se crean aqui si faltan. En Supabase esta rama no se ejecuta nunca porque ya
--  existen, asi que el fichero vale igual en los dos sitios. Se crean SIN
--  login y SIN herencia: son destinatarios de un revoke, no cuentas.
--
--  Si tu usuario no tiene permiso para crear roles, esto falla con un mensaje
--  claro; ejecutalo como superusuario o pide que los creen antes.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
    raise notice 'creado el rol anon (no existia: esto no es Supabase)';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
    raise notice 'creado el rol authenticated (no existia: esto no es Supabase)';
  end if;
end
$$;

-- ============================================================================
--  1/10  20260822045339_postgres_persistence_schema.sql
-- ============================================================================

-- +58Express DATABASE-1
-- Supabase is used only as managed PostgreSQL. The application connects with
-- DATABASE_URL; no Supabase Auth, Realtime, Storage or Data API is required.

create table if not exists public.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists public.users (
  id text primary key,
  payload jsonb not null,
  email_key text generated always as (nullif(lower(btrim(payload ->> 'email')), '')) stored,
  phone_key text generated always as (nullif(regexp_replace(payload ->> 'phone', '[^0-9]', '', 'g'), '')) stored,
  role text generated always as (payload ->> 'role') stored,
  account_status text generated always as (payload ->> 'accountStatus') stored,
  constraint users_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint users_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint users_role_valid check (role is null or role in ('admin', 'passenger', 'driver')),
  constraint users_account_status_valid check (account_status is null or account_status in ('ACTIVE', 'DISABLED'))
);

create unique index if not exists users_email_key_unique on public.users (email_key) where email_key is not null;
create unique index if not exists users_phone_key_unique on public.users (phone_key) where phone_key is not null;
create index if not exists users_role_idx on public.users (role);

create table if not exists public.trips (
  id text primary key,
  payload jsonb not null,
  passenger_id text generated always as (payload ->> 'passengerId') stored,
  driver_id text generated always as (payload ->> 'driverId') stored,
  assigned_driver_id text generated always as (payload ->> 'assignedDriverId') stored,
  status text generated always as (payload ->> 'status') stored,
  constraint trips_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint trips_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint trips_passenger_fk foreign key (passenger_id) references public.users(id) deferrable initially deferred,
  constraint trips_driver_fk foreign key (driver_id) references public.users(id) deferrable initially deferred,
  constraint trips_assigned_driver_fk foreign key (assigned_driver_id) references public.users(id) deferrable initially deferred
);

create index if not exists trips_passenger_idx on public.trips (passenger_id);
create index if not exists trips_driver_idx on public.trips (driver_id);
create index if not exists trips_status_idx on public.trips (status);
create index if not exists trips_status_unassigned_idx on public.trips (status, assigned_driver_id)
  where status in ('SEARCHING', 'SCHEDULED');

create table if not exists public.notifications (
  id text primary key,
  payload jsonb not null,
  user_id text generated always as (payload ->> 'userId') stored,
  target_role text generated always as (payload ->> 'targetRole') stored,
  constraint notifications_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint notifications_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint notifications_user_fk foreign key (user_id) references public.users(id) deferrable initially deferred
);
create index if not exists notifications_user_idx on public.notifications (user_id);
create index if not exists notifications_target_role_idx on public.notifications (target_role);

create table if not exists public.messages (
  id text primary key,
  payload jsonb not null,
  trip_id text generated always as (payload ->> 'tripId') stored,
  sender_id text generated always as (payload ->> 'senderId') stored,
  constraint messages_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint messages_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint messages_trip_fk foreign key (trip_id) references public.trips(id) deferrable initially deferred,
  constraint messages_sender_fk foreign key (sender_id) references public.users(id) deferrable initially deferred
);
create index if not exists messages_trip_idx on public.messages (trip_id);

create table if not exists public.support_messages (
  id text primary key,
  payload jsonb not null,
  conversation_user_id text generated always as (payload ->> 'conversationUserId') stored,
  sender_id text generated always as (payload ->> 'senderId') stored,
  constraint support_messages_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint support_messages_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint support_messages_conversation_user_fk foreign key (conversation_user_id) references public.users(id) deferrable initially deferred,
  constraint support_messages_sender_fk foreign key (sender_id) references public.users(id) deferrable initially deferred
);
create index if not exists support_messages_conversation_idx on public.support_messages (conversation_user_id);

create table if not exists public.settings (
  id text primary key,
  payload jsonb not null,
  constraint settings_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint settings_payload_id_matches check ((payload ->> 'id') is not distinct from id)
);

create table if not exists public.transactions (
  id text primary key,
  payload jsonb not null,
  user_id text generated always as (payload ->> 'userId') stored,
  trip_id text generated always as (payload ->> 'tripId') stored,
  transaction_type text generated always as (payload ->> 'type') stored,
  transaction_status text generated always as (payload ->> 'status') stored,
  reference_key text generated always as (nullif(upper(btrim(payload ->> 'reference')), '')) stored,
  constraint transactions_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint transactions_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint transactions_user_fk foreign key (user_id) references public.users(id) deferrable initially deferred,
  constraint transactions_trip_fk foreign key (trip_id) references public.trips(id) deferrable initially deferred
);
create index if not exists transactions_user_idx on public.transactions (user_id);
create index if not exists transactions_trip_idx on public.transactions (trip_id);
create unique index if not exists transactions_active_topup_reference_unique on public.transactions (reference_key)
  where transaction_type = 'TOP_UP' and transaction_status <> 'REJECTED' and reference_key is not null;
create unique index if not exists transactions_one_pending_payout_per_user on public.transactions (user_id)
  where transaction_type = 'PAYOUT' and transaction_status = 'PENDING';

create table if not exists public.driver_applications (
  id text primary key,
  payload jsonb not null,
  user_id text generated always as (payload ->> 'userId') stored,
  status text generated always as (payload ->> 'status') stored,
  constraint driver_applications_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint driver_applications_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint driver_applications_user_fk foreign key (user_id) references public.users(id) deferrable initially deferred
);
create unique index if not exists driver_applications_user_unique on public.driver_applications (user_id);
create index if not exists driver_applications_status_idx on public.driver_applications (status);

create table if not exists public.driver_documents (
  id text primary key,
  payload jsonb not null,
  application_id text generated always as (payload ->> 'applicationId') stored,
  user_id text generated always as (payload ->> 'userId') stored,
  document_type text generated always as (payload ->> 'type') stored,
  constraint driver_documents_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint driver_documents_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint driver_documents_application_fk foreign key (application_id) references public.driver_applications(id) deferrable initially deferred,
  constraint driver_documents_user_fk foreign key (user_id) references public.users(id) deferrable initially deferred
);
create unique index if not exists driver_documents_application_type_unique on public.driver_documents (application_id, document_type);
create index if not exists driver_documents_user_idx on public.driver_documents (user_id);

create table if not exists public.admin_actions (
  id text primary key,
  payload jsonb not null,
  admin_id text generated always as (payload ->> 'adminId') stored,
  target_user_id text generated always as (payload ->> 'targetUserId') stored,
  application_id text generated always as (payload ->> 'applicationId') stored,
  transaction_id text generated always as (payload ->> 'transactionId') stored,
  constraint admin_actions_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint admin_actions_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint admin_actions_admin_fk foreign key (admin_id) references public.users(id) deferrable initially deferred,
  constraint admin_actions_target_user_fk foreign key (target_user_id) references public.users(id) deferrable initially deferred,
  constraint admin_actions_application_fk foreign key (application_id) references public.driver_applications(id) deferrable initially deferred,
  constraint admin_actions_transaction_fk foreign key (transaction_id) references public.transactions(id) deferrable initially deferred
);
create index if not exists admin_actions_admin_idx on public.admin_actions (admin_id);
create index if not exists admin_actions_target_user_idx on public.admin_actions (target_user_id);

-- Defense in depth: these tables are not an API. Runtime access is through the
-- custom-authenticated Railway backend using DATABASE_URL only.
revoke all on all tables in schema public from anon, authenticated;

alter table public.schema_migrations enable row level security;
alter table public.users enable row level security;
alter table public.trips enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;
alter table public.support_messages enable row level security;
alter table public.settings enable row level security;
alter table public.transactions enable row level security;
alter table public.driver_applications enable row level security;
alter table public.driver_documents enable row level security;
alter table public.admin_actions enable row level security;

-- ============================================================================
--  2/10  20260822090000_add_foreign_key_indexes.sql
-- ============================================================================

-- Cover every foreign key used by PostgreSQL to validate parent updates/deletes.
create index if not exists trips_assigned_driver_idx on public.trips (assigned_driver_id);
create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists support_messages_sender_idx on public.support_messages (sender_id);
create index if not exists admin_actions_application_idx on public.admin_actions (application_id);
create index if not exists admin_actions_transaction_idx on public.admin_actions (transaction_id);

-- ============================================================================
--  3/10  20260824120000_push_subscriptions.sql
-- ============================================================================

-- +58Express PUSH-1
-- Suscripciones de Web Push. Sigue la convención de las demás colecciones:
-- el documento vive en `payload`, y las columnas generadas existen solo para
-- poder indexar y declarar integridad referencial de verdad.
--
-- El endpoint es material sensible (permite enviar notificaciones a ese
-- dispositivo). Nunca se registra en trazas ni se devuelve por la API; aquí
-- se indexa porque la unicidad global es justamente lo que impide que un
-- teléfono reutilizado siga recibiendo los avisos de la cuenta anterior.

create table if not exists public.push_subscriptions (
  id text primary key,
  payload jsonb not null,
  user_id text generated always as (payload ->> 'userId') stored,
  endpoint_key text generated always as (nullif(btrim(payload ->> 'endpoint'), '')) stored,
  disabled_at text generated always as (payload ->> 'disabledAt') stored,
  constraint push_subscriptions_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint push_subscriptions_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint push_subscriptions_user_fk foreign key (user_id) references public.users(id) deferrable initially deferred
);

-- Unicidad GLOBAL del endpoint, no por (usuario, endpoint): un endpoint solo
-- puede pertenecer a una cuenta a la vez. Deliberadamente NO es parcial. Una
-- suscripción revocada conserva su fila, de modo que volver a registrar el
-- mismo endpoint reutiliza y reasigna esa fila en vez de crear una segunda.
create unique index if not exists push_subscriptions_endpoint_key
  on public.push_subscriptions (endpoint_key)
  where endpoint_key is not null;

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- La consulta caliente del envío: las suscripciones vivas de un usuario.
create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions (user_id)
  where disabled_at is null;

-- Defensa en profundidad, igual que el resto del esquema: estas tablas no son
-- una API. El acceso en ejecución es solo del backend con DATABASE_URL.
revoke all on public.push_subscriptions from anon, authenticated;
alter table public.push_subscriptions enable row level security;

-- ============================================================================
--  4/10  20260827230000_safe_transport_foundation.sql
-- ============================================================================

-- +58Express SAFE-TRANSPORT-1B
-- Fundación de datos del traslado recurrente: suscripciones y ocurrencias.
-- Misma convención documental que el resto del esquema: el documento vive en
-- `payload`, y las columnas generadas existen solo para indexar y declarar
-- integridad referencial de verdad.
--
-- PRIVACIDAD: estos documentos contienen patrones de vida (casa ↔ trabajo y
-- horarios). Jamás se indexan direcciones ni coordenadas; el acceso en
-- ejecución es SOLO del backend con DATABASE_URL, igual que todo el esquema.

create table if not exists public.transport_subscriptions (
  id text primary key,
  payload jsonb not null,
  passenger_id text generated always as (payload ->> 'passengerId') stored,
  status text generated always as (payload ->> 'status') stored,
  constraint transport_subscriptions_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint transport_subscriptions_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint transport_subscriptions_passenger_fk foreign key (passenger_id) references public.users(id) deferrable initially deferred
);

create index if not exists transport_subscriptions_passenger_idx
  on public.transport_subscriptions (passenger_id);

-- La consulta operativa: qué suscripciones deben materializarse.
create index if not exists transport_subscriptions_status_idx
  on public.transport_subscriptions (status);

create table if not exists public.scheduled_rides (
  id text primary key,
  payload jsonb not null,
  subscription_id text generated always as (payload ->> 'subscriptionId') stored,
  passenger_id text generated always as (payload ->> 'passengerId') stored,
  occurrence_key text generated always as (nullif(btrim(payload ->> 'occurrenceKey'), '')) stored,
  scheduled_pickup_at text generated always as (payload ->> 'scheduledPickupAt') stored,
  assignment_status text generated always as (payload ->> 'assignmentStatus') stored,
  service_status text generated always as (payload ->> 'serviceStatus') stored,
  constraint scheduled_rides_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint scheduled_rides_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint scheduled_rides_subscription_fk foreign key (subscription_id) references public.transport_subscriptions(id) deferrable initially deferred,
  constraint scheduled_rides_passenger_fk foreign key (passenger_id) references public.users(id) deferrable initially deferred
);

-- EL candado de idempotencia del materializador futuro: la misma ocurrencia
-- (suscripción + fecha local + dirección) solo puede existir UNA vez, y lo
-- garantiza la base de datos — correr el materializador dos veces, o desde
-- dos procesos por accidente, no puede duplicar un traslado.
create unique index if not exists scheduled_rides_occurrence_key
  on public.scheduled_rides (occurrence_key)
  where occurrence_key is not null;

create index if not exists scheduled_rides_subscription_idx
  on public.scheduled_rides (subscription_id);

-- Las consultas operativas del panel y del evaluador de cobertura.
create index if not exists scheduled_rides_pickup_at_idx
  on public.scheduled_rides (scheduled_pickup_at);

create index if not exists scheduled_rides_assignment_idx
  on public.scheduled_rides (assignment_status);

-- Defensa en profundidad, igual que el resto del esquema: estas tablas no son
-- una API. El acceso en ejecución es solo del backend con DATABASE_URL.
revoke all on public.transport_subscriptions from anon, authenticated;
alter table public.transport_subscriptions enable row level security;
revoke all on public.scheduled_rides from anon, authenticated;
alter table public.scheduled_rides enable row level security;

-- ============================================================================
--  5/10  20260830120000_fx_exchange_rates.sql
-- ============================================================================

-- +58Express FX-BCV-1
-- Tasas de cambio oficiales publicadas por el Banco Central de Venezuela.
--
-- POR QUÉ ESTA TABLA NO ES DOCUMENTAL
--
-- El resto del esquema guarda documentos (`payload jsonb` más columnas
-- generadas), y aquí se hace distinto A PROPÓSITO:
--
--   · una tasa no es un documento que evoluciona, es un hecho publicado en una
--     fecha: cuatro campos, inmutables, sin estructura anidada;
--   · JSONB obligaría a que el valor viajara como texto para no perder
--     precisión, y bastaría con que alguien lo escribiera como número JSON en
--     JavaScript para que 794.99170000 dejara de ser exacto. Con `numeric` esa
--     puerta no existe.
--
-- Con esto se cobra dinero, así que la precisión la garantiza el motor y no la
-- disciplina de quien escriba el próximo `INSERT`.

create table if not exists public.exchange_rates (
  -- Identidad determinista y legible: `USD-VES-BCV-2026-08-31`. Que la clave
  -- primaria SEA la identidad de negocio es lo que hace la escritura
  -- idempotente: reejecutar la tarea del día no puede duplicar nada.
  id text primary key,

  base_currency text not null,
  quote_currency text not null,

  -- 10 dígitos enteros y 8 decimales: los 8 que publica el BCV, con margen de
  -- sobra para el entero. NUNCA `float` ni `double precision`.
  rate numeric(18, 8) not null,

  -- La fecha para la que RIGE la tasa, según el propio BCV. No es el día en que
  -- la descargamos: el BCV publica por la tarde la tasa del día siguiente, y
  -- confundir las dos es cobrar con la tasa equivocada.
  value_date date not null,

  source text not null,

  -- Cuándo la obtuvimos nosotros. Sirve para diagnosticar, no para calcular.
  fetched_at timestamptz not null default now(),

  -- Cuántas veces el BCV corrigió la tasa de esta misma fecha valor. Empieza en
  -- 1. Que quede rastro importa: una corrección silenciosa sobre un valor con
  -- el que ya se cobró es exactamente lo que no debe pasar inadvertido.
  revision integer not null default 1,

  constraint exchange_rates_rate_positive check (rate > 0),
  constraint exchange_rates_revision_positive check (revision >= 1),

  -- El dólar es la base del sistema y el BCV publica en bolívares. Se declara
  -- en el esquema para que una tercera moneda exija una migración pensada, en
  -- lugar de aparecer por accidente.
  constraint exchange_rates_base_is_usd check (base_currency = 'USD'),
  constraint exchange_rates_quote_is_ves check (quote_currency = 'VES'),

  -- La ÚNICA fuente admitida. Ni Binance, ni mercado paralelo, ni APIs que
  -- republican al BCV: la restricción existe para que meterlas requiera cambiar
  -- el esquema a la vista de todos.
  constraint exchange_rates_source_is_bcv check (source = 'BCV'),

  -- La clave primaria tiene que coincidir con los campos que la componen. Sin
  -- esto, un identificador mal construido crearía una fila duplicada que el
  -- índice único no vería, y habría dos tasas para el mismo día.
  constraint exchange_rates_id_matches check (
    id = base_currency || '-' || quote_currency || '-' || source || '-' || to_char(value_date, 'YYYY-MM-DD')
  )
);

-- La identidad de negocio, declarada también sobre las columnas reales. Es
-- redundante con la clave primaria y esa redundancia es el punto: si algún día
-- cambia la forma del identificador, esto sigue impidiendo dos tasas para la
-- misma fecha, moneda y fuente.
create unique index if not exists exchange_rates_identity
  on public.exchange_rates (base_currency, quote_currency, source, value_date);

-- La consulta caliente: «la tasa vigente», que es la de fecha valor más
-- reciente. Descendente porque siempre se lee por el extremo nuevo.
create index if not exists exchange_rates_latest_idx
  on public.exchange_rates (base_currency, quote_currency, source, value_date desc);

-- ============================================================================
--  6/10  20260830140000_fx_exchange_rate_observations.sql
-- ============================================================================

-- +58Express FX-BCV-1A
-- Historial APPEND-ONLY de las observaciones oficiales del BCV.
--
-- QUÉ PROBLEMA RESUELVE
--
-- `exchange_rates` guarda UNA fila por fecha valor y la actualiza cuando el BCV
-- corrige. `revision` contaba las correcciones, pero el valor anterior
-- desaparecía: quedaba constancia de que algo cambió y ninguna forma de saber
-- de qué a qué. Con eso no se puede auditar un cobro hecho con la tasa vieja.
--
-- Aquí se guarda CADA observación oficial. `exchange_rates` sigue siendo la
-- tasa vigente —la consulta caliente no cambia— y esta tabla es la memoria.
--
--   exchange_rates          la verdad de AHORA          (una fila por fecha valor)
--   exchange_rate_observations   todo lo que se observó (una fila por revisión)
--
-- APPEND-ONLY DE VERDAD
--
-- No es una promesa en un comentario: hay un disparador que rechaza UPDATE y
-- DELETE. Una tabla de auditoría que se puede editar no es una tabla de
-- auditoría.

create table if not exists public.exchange_rate_observations (
  -- Identidad determinista, con la revisión dentro: 'USD-VES-BCV-2026-08-31#1'.
  -- Que la revisión forme parte de la clave es lo que hace que registrar dos
  -- veces la misma observación sea imposible en lugar de improbable.
  id text primary key,

  base_currency text not null,
  quote_currency text not null,
  rate numeric(18, 8) not null,
  value_date date not null,
  source text not null,

  -- Cuándo la publicó el BCV según nuestra descarga, y cuándo la anotamos aquí.
  -- Son dos instantes distintos y los dos importan para reconstruir el orden.
  fetched_at timestamptz not null,
  recorded_at timestamptz not null default now(),

  -- 1 para la primera observación de esa fecha valor; 2, 3… para cada
  -- corrección posterior del BCV.
  revision integer not null,

  constraint exchange_rate_observations_rate_positive check (rate > 0),
  constraint exchange_rate_observations_revision_positive check (revision >= 1),
  constraint exchange_rate_observations_base_is_usd check (base_currency = 'USD'),
  constraint exchange_rate_observations_quote_is_ves check (quote_currency = 'VES'),
  constraint exchange_rate_observations_source_is_bcv check (source = 'BCV'),

  constraint exchange_rate_observations_id_matches check (
    id = base_currency || '-' || quote_currency || '-' || source || '-'
         || to_char(value_date, 'YYYY-MM-DD') || '#' || revision::text
  )
);

-- La identidad declarada también sobre las columnas reales. Redundante con la
-- clave primaria a propósito: si algún día cambia la forma del identificador,
-- esto sigue impidiendo dos observaciones con el mismo número de revisión.
create unique index if not exists exchange_rate_observations_identity
  on public.exchange_rate_observations
     (base_currency, quote_currency, source, value_date, revision);

-- La consulta de auditoría: la historia completa de un día, en orden.
create index if not exists exchange_rate_observations_historia_idx
  on public.exchange_rate_observations
     (base_currency, quote_currency, source, value_date, revision desc);

-- ---------------------------------------------------------------------------
-- Append-only, impuesto por el motor
-- ---------------------------------------------------------------------------

create or replace function public.exchange_rate_observations_solo_anexar()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'exchange_rate_observations es append-only: % no esta permitido', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists exchange_rate_observations_sin_modificar
  on public.exchange_rate_observations;

drop trigger if exists exchange_rate_observations_sin_modificar on public.exchange_rate_observations;
create trigger exchange_rate_observations_sin_modificar
  before update or delete on public.exchange_rate_observations
  for each row execute function public.exchange_rate_observations_solo_anexar();

-- ---------------------------------------------------------------------------
-- Rescate de lo que ya hubiera
-- ---------------------------------------------------------------------------

-- Se anota la revisión ACTUAL de cada tasa ya guardada, para que el historial
-- arranque completo desde hoy.
--
-- LIMITACIÓN HONESTA: si el BCV corrigió alguna tasa ANTES de esta migración,
-- ese valor anterior no se guardó en ninguna parte y no hay forma de
-- recuperarlo. El historial es fiel a partir de aquí, no hacia atrás.
insert into public.exchange_rate_observations
  (id, base_currency, quote_currency, rate, value_date, source, fetched_at, revision)
select
  r.base_currency || '-' || r.quote_currency || '-' || r.source || '-'
    || to_char(r.value_date, 'YYYY-MM-DD') || '#' || r.revision::text,
  r.base_currency, r.quote_currency, r.rate, r.value_date, r.source,
  r.fetched_at, r.revision
from public.exchange_rates r
on conflict (id) do nothing;

-- ============================================================================
--  7/10  20260831090000_wallet_payouts_foundation.sql
-- ============================================================================

-- +58Express WALLET-PAYOUTS-1
-- Cartera normalizada, libro mayor, métodos de retiro y solicitudes de retiro.
--
-- POR QUÉ ESTAS TABLAS NO SON DOCUMENTALES
--
-- El resto del esquema guarda documentos (`payload jsonb` más columnas
-- generadas). Aquí se hace distinto, por la misma razón que en `exchange_rates`
-- y con más motivo todavía:
--
--   · el saldo de hoy vive en `users.payload.walletBalance` como número JSON,
--     redondeado en JavaScript con Math.round(x*100)/100. Eso es coma flotante
--     en la ruta del dinero;
--   · un saldo, un estado y un titular no son «metadata»: son las columnas por
--     las que se consulta, se restringe y se audita.
--
-- JSONB queda para lo que de verdad es complementario: la instantánea del
-- método de pago (de forma variable según el tipo) y la metadata de auditoría.
--
-- ESTA MIGRACIÓN NO TOCA NADA EXISTENTE
--
-- No modifica `users`, ni `transactions`, ni el retiro que el producto ya
-- ofrece. Construye la fundación al lado. Migrar el flujo antiguo a este es una
-- fase con su propia autorización.

-- ---------------------------------------------------------------------------
-- Cartera
-- ---------------------------------------------------------------------------

create table if not exists public.wallets (
  -- Identidad determinista: una cartera por persona, y el identificador lo
  -- dice. Así crear dos carteras para el mismo usuario es imposible, no
  -- improbable.
  id text primary key,
  user_id text not null,
  currency text not null default 'USD',

  -- TRES cifras, no una. El saldo único de hoy no puede expresar que parte del
  -- dinero está comprometido en un retiro en curso, ni que parte no es
  -- retirable.
  available_usd numeric(18, 2) not null default 0,
  reserved_usd numeric(18, 2) not null default 0,
  withdrawable_available_usd numeric(18, 2) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint wallets_currency_is_usd check (currency = 'USD'),
  constraint wallets_id_matches check (id = 'wallet-' || user_id),

  -- LAS INVARIANTES DEL DINERO, EN EL MOTOR
  --
  -- No en un `if` de JavaScript. Un `if` protege el camino que alguien recordó
  -- proteger; esto protege todos, incluidos el script de mantenimiento escrito
  -- con prisa y la consola de administración de Supabase.
  constraint wallets_available_no_negativo check (available_usd >= 0),
  constraint wallets_reserved_no_negativo check (reserved_usd >= 0),
  constraint wallets_retirable_no_negativo check (withdrawable_available_usd >= 0),

  -- Lo retirable es un SUBCONJUNTO de lo disponible. Si esto se rompiera, el
  -- sistema creería poder transferir dinero que no tiene.
  constraint wallets_retirable_cabe_en_disponible
    check (withdrawable_available_usd <= available_usd),

  constraint wallets_user_fk foreign key (user_id)
    references public.users(id) deferrable initially deferred
);

create unique index if not exists wallets_user_unico on public.wallets (user_id);

-- ---------------------------------------------------------------------------
-- Libro mayor — APPEND-ONLY
-- ---------------------------------------------------------------------------

create table if not exists public.wallet_ledger_entries (
  id text primary key,
  wallet_id text not null,
  user_id text not null,

  -- SIEMPRE positivo. El sentido lo da `direction`, nunca el signo: un importe
  -- con signo invita a que alguien sume donde debía restar y el error pase
  -- desapercibido porque «la cuenta cuadra».
  amount_usd numeric(18, 2) not null,
  currency text not null default 'USD',
  direction text not null,
  entry_type text not null,
  fund_class text not null,

  -- Qué provocó el movimiento. Se puede reconstruir el porqué de cada céntimo.
  reference_type text,
  reference_id text,

  -- La misma operación lógica no puede escribir dos veces. Es lo que hace que
  -- un reintento tras un fallo de red sea seguro.
  idempotency_key text not null,

  -- Saldos resultantes, para auditar sin recalcular el libro entero.
  available_after_usd numeric(18, 2) not null,
  reserved_after_usd numeric(18, 2) not null,

  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint wallet_ledger_amount_positivo check (amount_usd > 0),
  constraint wallet_ledger_currency_is_usd check (currency = 'USD'),
  constraint wallet_ledger_direction_valida check (direction in ('CREDIT', 'DEBIT')),
  constraint wallet_ledger_tipo_valido check (entry_type in (
    'WITHDRAWAL_RESERVE', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_SETTLE',
    'WALLET_CREDIT', 'WALLET_DEBIT'
  )),
  constraint wallet_ledger_clase_valida check (fund_class in (
    'EARNED', 'DEPOSITED', 'REFUND', 'PROMO', 'BONUS', 'REFERRAL', 'ADJUSTMENT'
  )),
  constraint wallet_ledger_saldos_no_negativos
    check (available_after_usd >= 0 and reserved_after_usd >= 0),
  constraint wallet_ledger_metadata_objeto check (jsonb_typeof(metadata) = 'object'),

  -- La metadata es para diagnosticar, no para colar datos bancarios en una
  -- tabla que se consulta con menos cuidado que la de métodos de pago.
  constraint wallet_ledger_metadata_sin_secretos check (
    not (metadata ?| array[
      'password', 'clave', 'pin', 'otp', 'token',
      'accountNumber', 'phone', 'documentNumber', 'holderName'
    ])
  ),

  constraint wallet_ledger_wallet_fk foreign key (wallet_id)
    references public.wallets(id) deferrable initially deferred,
  constraint wallet_ledger_user_fk foreign key (user_id)
    references public.users(id) deferrable initially deferred
);

create unique index if not exists wallet_ledger_idempotencia
  on public.wallet_ledger_entries (idempotency_key);

create index if not exists wallet_ledger_wallet_idx
  on public.wallet_ledger_entries (wallet_id, created_at desc);

create index if not exists wallet_ledger_referencia_idx
  on public.wallet_ledger_entries (reference_type, reference_id);

-- ---------------------------------------------------------------------------
-- Métodos de retiro
-- ---------------------------------------------------------------------------

create table if not exists public.payment_methods (
  id text primary key,
  user_id text not null,
  method_type text not null,
  status text not null default 'ACTIVE',

  bank_code text not null,
  bank_name text not null,

  -- Transferencia bancaria.
  account_type text,
  account_number text,

  -- Pago Móvil.
  phone text,

  holder_name text not null,
  holder_document_type text not null,
  holder_document_number text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_methods_tipo_valido check (method_type in ('BANK_TRANSFER', 'PAGO_MOVIL')),
  constraint payment_methods_estado_valido check (status in ('ACTIVE', 'DISABLED')),
  constraint payment_methods_banco_valido check (bank_code ~ '^[0-9]{4}$'),
  constraint payment_methods_documento_valido
    check (holder_document_type in ('V', 'E', 'J', 'G', 'P')),
  constraint payment_methods_documento_numerico
    check (holder_document_number ~ '^[0-9]{5,10}$'),
  constraint payment_methods_titular_no_vacio
    check (length(btrim(holder_name)) >= 2),

  -- Cada tipo trae SUS campos y no los del otro. Sin esto cabría un Pago Móvil
  -- con número de cuenta y sin teléfono, que no se puede pagar.
  constraint payment_methods_campos_por_tipo check (
    (method_type = 'BANK_TRANSFER'
       and account_number is not null and account_type is not null and phone is null)
    or
    (method_type = 'PAGO_MOVIL'
       and phone is not null and account_number is null and account_type is null)
  ),
  constraint payment_methods_tipo_de_cuenta
    check (account_type is null or account_type in ('CORRIENTE', 'AHORRO')),
  constraint payment_methods_cuenta_veinte_digitos
    check (account_number is null or account_number ~ '^[0-9]{20}$'),

  -- LA COMPROBACIÓN QUE DE VERDAD ATRAPA ERRORES: en Venezuela los cuatro
  -- primeros dígitos de la cuenta SON el código del banco. Si no coinciden,
  -- uno de los dos campos está mal — y una transferencia a la cuenta
  -- equivocada no se deshace con un UPDATE.
  constraint payment_methods_cuenta_coincide_con_banco check (
    method_type <> 'BANK_TRANSFER' or account_number like bank_code || '%'
  ),

  constraint payment_methods_movil_venezolano check (
    phone is null or phone ~ '^0(412|414|416|424|426)[0-9]{7}$'
  ),

  constraint payment_methods_user_fk foreign key (user_id)
    references public.users(id) deferrable initially deferred
);

create index if not exists payment_methods_user_idx
  on public.payment_methods (user_id, status);

-- ---------------------------------------------------------------------------
-- Solicitudes de retiro
-- ---------------------------------------------------------------------------

create table if not exists public.withdrawal_requests (
  id text primary key,
  user_id text not null,
  wallet_id text not null,

  amount_usd numeric(18, 2) not null,
  currency text not null default 'USD',
  status text not null default 'REQUESTED',

  -- El método que se eligió. La referencia se conserva para poder enlazar,
  -- pero los datos con los que se pagará están en la instantánea de abajo.
  payment_method_id text not null,

  -- INSTANTÁNEA INMUTABLE. Si mañana esta persona cambia su cuenta bancaria, el
  -- retiro que pidió ayer sigue apuntando a la cuenta que eligió ayer. Resolver
  -- los datos leyendo siempre el método «actual» significa pagar a una cuenta
  -- que quien solicitó nunca seleccionó.
  method_type text not null,
  method_snapshot jsonb not null,

  -- Instantánea del tipo de cambio, de FX-BCV-1. Opcional: un retiro puede no
  -- necesitar equivalente en bolívares.
  fx_rate numeric(18, 8),
  fx_effective_date date,
  fx_fetched_at timestamptz,
  fx_source text,
  amount_ves numeric(18, 2),

  -- La referencia bancaria real. No se genera: tiene que venir de la operación.
  payment_reference text,

  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint withdrawals_amount_positivo check (amount_usd > 0),
  constraint withdrawals_currency_is_usd check (currency = 'USD'),
  constraint withdrawals_estado_valido check (status in (
    'REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'CANCELLED'
  )),
  constraint withdrawals_tipo_de_metodo check (method_type in ('BANK_TRANSFER', 'PAGO_MOVIL')),
  constraint withdrawals_snapshot_objeto check (jsonb_typeof(method_snapshot) = 'object'),

  -- La instantánea del cambio está ENTERA o no está. Una a medias —tasa sin
  -- fecha, o importe en bolívares sin tasa— es peor que ninguna: parece
  -- auditable y no lo es.
  constraint withdrawals_fx_completo_o_ausente check (
    (fx_rate is null and fx_effective_date is null and fx_fetched_at is null
       and fx_source is null and amount_ves is null)
    or
    (fx_rate is not null and fx_effective_date is not null and fx_fetched_at is not null
       and fx_source is not null and amount_ves is not null)
  ),
  constraint withdrawals_fx_positivo check (fx_rate is null or fx_rate > 0),
  constraint withdrawals_ves_no_negativo check (amount_ves is null or amount_ves >= 0),

  -- La ÚNICA fuente admitida para la tasa, igual que en FX-BCV-1.
  constraint withdrawals_fx_source_is_bcv check (fx_source is null or fx_source = 'BCV'),

  -- PAGADO EXIGE REFERENCIA. Es la diferencia entre «lo dimos por pagado» y
  -- «hay una operación bancaria que lo demuestra», impuesta por el motor.
  constraint withdrawals_pagado_con_referencia check (
    status <> 'PAID'
    or (payment_reference is not null and length(btrim(payment_reference)) > 0)
  ),

  constraint withdrawals_wallet_fk foreign key (wallet_id)
    references public.wallets(id) deferrable initially deferred,
  constraint withdrawals_user_fk foreign key (user_id)
    references public.users(id) deferrable initially deferred,

  -- SIN `on delete cascade` a propósito: borrar un método de pago que respalda
  -- un retiro histórico haría desaparecer la evidencia de a dónde se mandó el
  -- dinero. Los métodos se DESACTIVAN, no se borran.
  constraint withdrawals_metodo_fk foreign key (payment_method_id)
    references public.payment_methods(id)
);

create unique index if not exists withdrawals_idempotencia
  on public.withdrawal_requests (idempotency_key);

create index if not exists withdrawals_user_idx
  on public.withdrawal_requests (user_id, created_at desc);

create index if not exists withdrawals_estado_idx
  on public.withdrawal_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Auditoría administrativa — APPEND-ONLY
-- ---------------------------------------------------------------------------

create table if not exists public.withdrawal_audit_events (
  id text primary key,
  withdrawal_id text not null,
  actor_user_id text not null,
  actor_role text not null,
  action text not null,
  from_status text,
  to_status text,
  reason text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint withdrawal_audit_metadata_objeto check (jsonb_typeof(metadata) = 'object'),
  constraint withdrawal_audit_metadata_sin_secretos check (
    not (metadata ?| array[
      'password', 'clave', 'pin', 'otp', 'token', 'jwt', 'cookie',
      'accountNumber', 'phone', 'documentNumber'
    ])
  ),
  constraint withdrawal_audit_retiro_fk foreign key (withdrawal_id)
    references public.withdrawal_requests(id)
);

create index if not exists withdrawal_audit_retiro_idx
  on public.withdrawal_audit_events (withdrawal_id, created_at asc);

-- ---------------------------------------------------------------------------
-- Inmutabilidad, impuesta por disparadores
-- ---------------------------------------------------------------------------

create or replace function public.wallet_payouts_solo_anexar()
returns trigger
language plpgsql
as $$
begin
  raise exception '% es append-only: % no esta permitido', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists wallet_ledger_sin_modificar on public.wallet_ledger_entries;
create trigger wallet_ledger_sin_modificar
  before update or delete on public.wallet_ledger_entries
  for each row execute function public.wallet_payouts_solo_anexar();

drop trigger if exists withdrawal_audit_sin_modificar on public.withdrawal_audit_events;
create trigger withdrawal_audit_sin_modificar
  before update or delete on public.withdrawal_audit_events
  for each row execute function public.wallet_payouts_solo_anexar();

/*
 * Un retiro SÍ cambia de estado, pero lo que se pactó al crearlo no.
 *
 * El importe, la instantánea del método y la del tipo de cambio son el acuerdo
 * con la persona en el momento de solicitar. Que puedan editarse después
 * convierte cualquier revisión administrativa en una oportunidad de cambiar
 * cuánto y a dónde, sin dejar rastro.
 */
create or replace function public.withdrawal_snapshot_inmutable()
returns trigger
language plpgsql
as $$
begin
  if new.amount_usd is distinct from old.amount_usd
     or new.user_id is distinct from old.user_id
     or new.wallet_id is distinct from old.wallet_id
     or new.payment_method_id is distinct from old.payment_method_id
     or new.method_type is distinct from old.method_type
     or new.method_snapshot is distinct from old.method_snapshot
     or new.fx_rate is distinct from old.fx_rate
     or new.fx_effective_date is distinct from old.fx_effective_date
     or new.fx_fetched_at is distinct from old.fx_fetched_at
     or new.fx_source is distinct from old.fx_source
     or new.amount_ves is distinct from old.amount_ves
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at
  then
    raise exception 'los terminos de un retiro son inmutables: solo cambian estado, referencia y updated_at'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists withdrawals_terminos_inmutables on public.withdrawal_requests;
create trigger withdrawals_terminos_inmutables
  before update on public.withdrawal_requests
  for each row execute function public.withdrawal_snapshot_inmutable();

-- ============================================================================
--  8/10  20260904120000_auth_identity_foundation.sql
-- ============================================================================

-- +58Express AUTH-FINAL-1
-- Identidad canónica: USER != AUTH IDENTITY != VERIFIED CONTACT, y desafíos OTP.
--
-- POR QUÉ TRES TABLAS Y NO TRES CAMPOS EN `users`
--
--   · Un User puede tener varias formas de demostrar quién es (contraseña,
--     Google, Apple) y cada una debe ser única en TODO el sistema: dos Users no
--     pueden reclamar la misma cuenta de Google. Eso es una restricción de
--     tabla, no un campo.
--   · Un contacto verificado tiene un solo dueño; uno sin verificar, no. Esa
--     diferencia también es una restricción, parcial.
--   · Un desafío OTP vive cinco minutos y se borra. No pertenece al documento
--     de la persona.
--
-- Estas tablas siguen el patrón documental del resto del esquema (`payload
-- jsonb` más columnas generadas), porque el servidor las lee y escribe como a
-- las demás. Las columnas generadas existen para que las restricciones y los
-- índices vivan en el motor, que es la última autoridad frente a dos
-- peticiones simultáneas.
--
-- ESTA MIGRACIÓN NO TOCA NADA EXISTENTE
--
-- No modifica `users` ni cambia cómo se entra hoy. La contraseña sigue en
-- `users.payload.passwordHash`, donde siempre estuvo: la identidad PASSWORD
-- apunta al User y no duplica el hash.
--
-- El servidor exige estas tablas al arrancar (las carga como al resto). Hay
-- que aplicar esta migración ANTES de desplegar la versión que las conoce; si
-- falta, el arranque falla con `MISSING_TABLE:<tabla>` en vez de con un error
-- crudo.

-- ---------------------------------------------------------------------------
-- Identidades de autenticación
-- ---------------------------------------------------------------------------

create table if not exists public.auth_identities (
  id text primary key,
  payload jsonb not null,
  user_id text generated always as (payload ->> 'userId') stored,
  provider text generated always as (payload ->> 'provider') stored,
  provider_subject text generated always as (payload ->> 'providerSubject') stored,
  constraint auth_identities_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint auth_identities_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint auth_identities_provider_valid check (provider in ('PASSWORD', 'GOOGLE', 'APPLE')),
  constraint auth_identities_subject_present check (provider_subject is not null and provider_subject <> ''),
  constraint auth_identities_user_fk foreign key (user_id) references public.users(id) deferrable initially deferred
);

-- La restricción central: (provider, providerSubject) es único en el sistema.
create unique index if not exists auth_identities_provider_subject_unique
  on public.auth_identities (provider, provider_subject);
create index if not exists auth_identities_user_idx
  on public.auth_identities (user_id);

-- ---------------------------------------------------------------------------
-- Contactos verificados
-- ---------------------------------------------------------------------------

create table if not exists public.verified_contacts (
  id text primary key,
  payload jsonb not null,
  user_id text generated always as (payload ->> 'userId') stored,
  contact_type text generated always as (payload ->> 'type') stored,
  value_normalized text generated always as (payload ->> 'valueNormalized') stored,
  verified_at text generated always as (payload ->> 'verifiedAt') stored,
  constraint verified_contacts_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint verified_contacts_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint verified_contacts_type_valid check (contact_type in ('EMAIL', 'PHONE')),
  constraint verified_contacts_value_present check (value_normalized is not null and value_normalized <> ''),
  constraint verified_contacts_user_fk foreign key (user_id) references public.users(id) deferrable initially deferred
);

-- Un User no repite el mismo contacto.
create unique index if not exists verified_contacts_user_type_value_unique
  on public.verified_contacts (user_id, contact_type, value_normalized);
-- Un contacto VERIFICADO tiene un solo dueño. Sin verificar puede aparecer en
-- varias cuentas: aparecer en un registro no demuestra posesión.
create unique index if not exists verified_contacts_verified_owner_unique
  on public.verified_contacts (contact_type, value_normalized)
  where verified_at is not null;

-- ---------------------------------------------------------------------------
-- Desafíos de verificación (OTP)
-- ---------------------------------------------------------------------------

create table if not exists public.auth_challenges (
  id text primary key,
  payload jsonb not null,
  channel text generated always as (payload ->> 'channel') stored,
  purpose text generated always as (payload ->> 'purpose') stored,
  destination text generated always as (payload ->> 'destination') stored,
  user_id text generated always as (payload ->> 'userId') stored,
  -- Texto ISO-8601 en UTC: ordena lexicográficamente igual que en el tiempo, y
  -- un cast a timestamptz no sería inmutable para una columna generada.
  expires_at text generated always as (payload ->> 'expiresAt') stored,
  constraint auth_challenges_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint auth_challenges_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint auth_challenges_channel_valid check (channel in ('WHATSAPP', 'SMS', 'EMAIL')),
  constraint auth_challenges_purpose_valid check (purpose in (
    'SIGNUP', 'LOGIN', 'PASSWORD_RESET', 'CHANGE_PHONE', 'CHANGE_EMAIL', 'ACCOUNT_LINK', 'SENSITIVE_ACTION'
  )),
  -- Nunca un código en claro: solo su hash.
  constraint auth_challenges_hash_present check ((payload ->> 'codeHash') is not null and (payload ->> 'codeHash') <> ''),
  constraint auth_challenges_no_plaintext check (payload ? 'code' = false),
  constraint auth_challenges_user_fk foreign key (user_id) references public.users(id) deferrable initially deferred
);

create index if not exists auth_challenges_destination_purpose_idx
  on public.auth_challenges (destination, purpose);
create index if not exists auth_challenges_expires_idx
  on public.auth_challenges (expires_at);
create index if not exists auth_challenges_user_idx
  on public.auth_challenges (user_id);

-- ============================================================================
--  9/10  20260904180000_trips_passenger_status_index.sql
-- ============================================================================

-- NOTA DE LA GENERACION: en la migracion original este indice se crea con
-- CONCURRENTLY, para no bloquear la tabla `trips` en produccion. Aqui se ha
-- quitado: este fichero monta una base vacia, no hay nada que bloquear, y
-- CONCURRENTLY impediria ejecutar el script dentro de una transaccion.
-- La migracion de `supabase/migrations/` sigue intacta.

-- PASSENGER-TRIP-HARDENING-1.1
--
-- El indice que necesita la reserva del unico viaje activo.
--
-- POR QUE NO BASTABAN LOS QUE YA HABIA
--
-- `trips_passenger_idx (passenger_id)` y `trips_status_idx (status)` existen
-- por separado desde el esquema inicial. La comprobacion de la reserva filtra
-- por LOS DOS a la vez:
--
--     select 1 from public.trips
--      where passenger_id = $1 and status = any($2::text[])
--
-- Con indices sueltos PostgreSQL elige uno y descarta por el otro leyendo las
-- filas: para una pasajera con muchos viajes en su historial, eso es recorrer
-- todos sus viajes viejos en CADA creacion, y esa comprobacion corre dentro de
-- una transaccion con un cerrojo tomado, asi que su coste retrasa a las demas
-- peticiones de esa misma persona.
--
-- El compuesto resuelve la comprobacion sin tocar la tabla.
--
-- CONCURRENTLY, para no bloquear la tabla
--
-- `create index` normal toma un ACCESS EXCLUSIVE sobre `trips` y detiene toda
-- creacion de viajes mientras dura. `concurrently` tarda mas pero deja la tabla
-- operativa, que es lo que corresponde en una tabla viva.
--
-- No puede ir dentro de una transaccion: si el gestor de migraciones las
-- envuelve, esta hay que aplicarla suelta.

create index if not exists trips_passenger_status_idx
  on public.trips (passenger_id, status);

-- ============================================================================
--  10/10  20260905220000_push_deliveries.sql
-- ============================================================================

-- +58Express PUSH-1
-- La memoria de lo ya avisado, para que un mismo hecho no suene dos veces.
--
-- Un hecho puede llegar dos veces a este servidor por caminos que nada tienen
-- que ver entre sí: un socket que reintenta, una reconexión que reproduce lo
-- pendiente, dos oyentes sobre el mismo evento. La máquina de estados impide
-- que el VIAJE cambie dos veces, pero no que el sitio que avisa se ejecute dos
-- veces — y el usuario no percibe «una transición idempotente», percibe que el
-- teléfono sonó tres veces por lo mismo.
--
-- El `id` ES la clave del hecho: `viaje:<tripId>:<tipo>` o `mensaje:<id>`. No
-- hay un segundo campo que diga lo mismo y pueda desincronizarse.
--
-- NO GUARDA NADA DE NADIE. Ni destinatario, ni contenido, ni endpoint: solo qué
-- hecho ya se avisó y cuándo. Quién lo recibió está en `push_subscriptions`, y
-- ahí es donde tiene que estar.

create table if not exists public.push_deliveries (
  id text primary key,
  payload jsonb not null,
  sent_at bigint generated always as ((payload ->> 'at')::bigint) stored,
  constraint push_deliveries_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint push_deliveries_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint push_deliveries_sent_at_present check ((payload ->> 'at') is not null)
);

-- La poda por antigüedad es la única consulta que recorre la tabla. Se recuerda
-- veinticuatro horas: un intento de repetir un aviso un día después no es un
-- duplicado, es otra cosa y probablemente un error en otro sitio.
create index if not exists push_deliveries_sent_at_idx
  on public.push_deliveries (sent_at);

-- Sin clave foránea, y es deliberado: esta tabla no referencia a nadie. Atarla
-- a `users` obligaría a guardar el destinatario, que es justo lo que no hace
-- falta aquí para decidir si un aviso ya salió.

-- Defensa en profundidad, igual que el resto del esquema: estas tablas no son
-- una API. El acceso en ejecución es solo del backend con DATABASE_URL.
revoke all on public.push_deliveries from anon, authenticated;
alter table public.push_deliveries enable row level security;


-- =============================================================================
--  Registro de las migraciones ya aplicadas
--
--  El migrador (`server/scripts/postgresMigrate.js`) mira esta tabla para saber
--  que le falta por aplicar. Como este fichero ya aplico las diez, se anotan
--  aqui: sin esto, el primer `npm run db:migrate` volveria a ejecutarlas.
--
--  `on conflict do nothing` para que sea seguro re-ejecutar el fichero entero.
-- =============================================================================

insert into public.schema_migrations (id, applied_at) values
  ('20260822045339_postgres_persistence_schema.sql', now()),
  ('20260822090000_add_foreign_key_indexes.sql', now()),
  ('20260824120000_push_subscriptions.sql', now()),
  ('20260827230000_safe_transport_foundation.sql', now()),
  ('20260830120000_fx_exchange_rates.sql', now()),
  ('20260830140000_fx_exchange_rate_observations.sql', now()),
  ('20260831090000_wallet_payouts_foundation.sql', now()),
  ('20260904120000_auth_identity_foundation.sql', now()),
  ('20260904180000_trips_passenger_status_index.sql', now()),
  ('20260905220000_push_deliveries.sql', now())
on conflict (id) do nothing;
