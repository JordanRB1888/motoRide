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
