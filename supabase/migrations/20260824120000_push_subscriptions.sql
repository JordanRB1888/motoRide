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
