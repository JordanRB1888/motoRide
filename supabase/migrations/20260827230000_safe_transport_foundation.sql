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
