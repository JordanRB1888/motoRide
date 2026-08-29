-- +58Express DRIVER-FINANCE-1 v4 · libro contable del conductor
-- =====================================================================
-- EL PROBLEMA QUE RESUELVE
-- ------------------------
-- El proyecto guarda cada entidad como un documento que se reescribe ENTERO
-- (`insert ... on conflict do update set payload = excluded.payload`). Con el
-- dinero del conductor dentro de `users.payload`, una sentencia atomica podia
-- cobrar correctamente y, un instante despues, otra replica con una copia
-- vieja del documento deshacia el cobro al persistir. Tres auditorias
-- independientes lo reprodujeron: saldo 10.00 -> cobro -> 9.00 -> escritura
-- obsoleta -> 10.00 otra vez.
--
-- LA CURA
-- -------
-- El dinero se muda a filas propias, y `users.payload` pasa a ser una
-- PROYECCION de solo lectura de esas filas. El disparador de mas abajo
-- reestampa los campos financieros en cada escritura del documento, asi que
-- una escritura obsoleta ya no puede revertir nada: entra con datos viejos y
-- sale con los autoritativos.
--
-- APLICAR ESTA MIGRACION NO MUEVE NI UN CENTIMO. Solo crea tablas vacias y un
-- disparador que permanece INERTE mientras no exista una fila en
-- `driver_finance_state`, y esas filas solo las crea el codigo con
-- DRIVER_FINANCE_ENABLED encendida. Es seguro aplicarla ANTES del codigo.
--
-- PRIVACIDAD: aqui hay deuda de personas concretas. Ninguna columna generada
-- ni ningun indice expone importes; se indexa por identidad y estado. El
-- acceso en ejecucion es SOLO del backend con DATABASE_URL, como el resto del
-- esquema, y se revoca a los roles anonimos igual que en las demas tablas.

-- ---------------------------------------------------------------------
-- Verificacion de compatibilidad: fallar CLARO, y ANTES de tocar nada.
-- ---------------------------------------------------------------------
-- `create table if not exists` acepta sin rechistar una tabla vieja con otra
-- forma, y a partir de ahi el codigo escribiria dinero contra un esquema que
-- no es el que espera. Esta comprobacion va la PRIMERA a proposito: si alguna
-- de las tablas ya existe con una forma incompatible, la migracion se detiene
-- con un mensaje entendible sin haber creado ni modificado nada.
--
-- Sobre una base limpia no hace nada: solo mira tablas que YA existen.
do $compatibilidad$
declare
  faltantes text;
begin
  select string_agg(requerida.tabla || '.' || requerida.columna, ', '
                    order by requerida.tabla || '.' || requerida.columna)
    into faltantes
    from (values
      ('driver_finance_state',              'wallet_balance_usd'),
      ('driver_finance_state',              'deferred_commission_usd'),
      ('driver_finance_state',              'maintenance_anchor_at'),
      ('driver_finance_state',              'last_charged_period'),
      ('driver_finance_state',              'activity_anchor_at'),
      ('driver_finance_state',              'last_qualifying_trip_at'),
      ('driver_finance_state',              'inactivity_warned_threshold'),
      ('driver_finance_state',              'block_active'),
      ('driver_commission_reservations',    'trip_id'),
      ('driver_commission_reservations',    'reserved_usd'),
      ('driver_commission_reservations',    'applied_usd'),
      ('driver_commission_reservations',    'deferred_usd'),
      ('driver_commission_reservations',    'deferred_paid_usd'),
      ('driver_commission_reservations',    'status'),
      ('driver_maintenance_obligations',    'period'),
      ('driver_maintenance_obligations',    'status'),
      ('driver_maintenance_obligations',    'transaction_id'),
      ('driver_maintenance_obligations',    'paid_at'),
      ('driver_inactivity_warnings',        'anchor_at'),
      ('driver_inactivity_warnings',        'threshold_days'),
      ('driver_inactivity_warnings',        'delivered_at')
    ) as requerida(tabla, columna)
   where to_regclass('public.' || requerida.tabla) is not null
     and not exists (
       select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = requerida.tabla
          and c.column_name = requerida.columna
     );

  if faltantes is not null then
    raise exception 'DRIVER_FINANCE_SCHEMA_INCOMPATIBLE: faltan columnas requeridas (%)', faltantes;
  end if;
end
$compatibilidad$;

-- ---------------------------------------------------------------------
-- A. Reserva de comision, con DUENO durable: el viaje.
-- ---------------------------------------------------------------------
-- Una reserva sin dueno no se puede reconciliar: si el proceso muere entre
-- reservar y asignar, nadie sabe a que carrera pertenecia ese dinero
-- comprometido y queda mermando la capacidad del conductor para siempre.
create table if not exists public.driver_commission_reservations (
  trip_id text primary key,
  driver_id text not null,
  reserved_usd numeric(10, 2) not null check (reserved_usd >= 0),
  applied_usd numeric(10, 2) not null default 0 check (applied_usd >= 0),
  deferred_usd numeric(10, 2) not null default 0 check (deferred_usd >= 0),
  -- Cuanto de lo diferido ya se cobro con ingresos posteriores. La deuda se
  -- recauda FILA A FILA, de la mas vieja a la mas nueva, no desde un total
  -- acumulado que nadie sabe de donde viene.
  deferred_paid_usd numeric(10, 2) not null default 0 check (deferred_paid_usd >= 0),
  status text not null default 'RESERVED'
    check (status in ('RESERVED', 'SETTLED', 'RELEASED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint driver_commission_reservations_driver_fk
    foreign key (driver_id) references public.users(id)
    on delete no action deferrable initially deferred
);

-- ---------------------------------------------------------------------
-- B. Obligacion mensual de mantenimiento, unica por conductor y periodo.
-- ---------------------------------------------------------------------
-- La unicidad la declara la BASE, no una busqueda previa: dos evaluadores
-- simultaneos no pueden crear el mismo mes, y el perdedor no tiene nada que
-- sobrescribir porque el estado del cobro ya no vive en el documento.
create table if not exists public.driver_maintenance_obligations (
  id text primary key,                     -- driver-maintenance:<driverId>:<periodo>
  driver_id text not null,
  period integer not null check (period >= 1),
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  status text not null default 'DUE' check (status in ('DUE', 'PAID')),
  transaction_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint driver_maintenance_obligations_unico unique (driver_id, period),
  constraint driver_maintenance_obligations_driver_fk
    foreign key (driver_id) references public.users(id)
    on delete no action deferrable initially deferred
);

-- ---------------------------------------------------------------------
-- C. Estado financiero del conductor: LA fila que serializa su dinero.
-- ---------------------------------------------------------------------
-- Cada operacion de dinero empieza bloqueando esta fila (`for update`), asi
-- que dos replicas nunca reparten el mismo saldo. El bloqueo es POR
-- CONDUCTOR: no hay contencion global.
--
-- Las anclas se guardan en milisegundos desde epoch, la misma representacion
-- que usa el documento, para que la proyeccion sea literal y no haya dos
-- cronologias que puedan discrepar.
create table if not exists public.driver_finance_state (
  driver_id text primary key,
  wallet_balance_usd numeric(12, 2) not null default 0,
  deferred_commission_usd numeric(12, 2) not null default 0 check (deferred_commission_usd >= 0),
  maintenance_anchor_at bigint,
  last_charged_period integer not null default 0 check (last_charged_period >= 0),
  activity_anchor_at bigint,
  last_qualifying_trip_at bigint,
  inactivity_warned_threshold integer,
  block_active boolean not null default false,
  block_reason text,
  block_since timestamptz,
  block_cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_finance_state_block_reason
    check (block_active = false or block_reason is not null),
  constraint driver_finance_state_driver_fk
    foreign key (driver_id) references public.users(id)
    on delete no action deferrable initially deferred
);

-- ---------------------------------------------------------------------
-- D. Reclamo de aviso: un recordatorio, una sola vez, aunque haya replicas.
-- ---------------------------------------------------------------------
-- La identidad es SEMANTICA (conductor + ancla + umbral), no un identificador
-- que genere quien llama: dos replicas que calculan el mismo aviso chocan en
-- la base y solo una lo entrega. Un aviso que no se entrega se retira, para
-- que la siguiente pasada lo reintente en vez de perderlo.
create table if not exists public.driver_inactivity_warnings (
  driver_id text not null,
  anchor_at bigint not null,
  threshold_days integer not null check (threshold_days > 0),
  claimed_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint driver_inactivity_warnings_pk primary key (driver_id, anchor_at, threshold_days),
  constraint driver_inactivity_warnings_driver_fk
    foreign key (driver_id) references public.users(id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Invariantes de estado. Se anaden por separado y de forma idempotente para
-- no romper una base donde las tablas ya existan sin ellas.
-- ---------------------------------------------------------------------
do $invariantes$
begin
  -- Una reserva liquidada reparte EXACTAMENTE lo que reservo.
  if not exists (select 1 from pg_constraint where conname = 'driver_commission_reservations_settled_cuadra') then
    alter table public.driver_commission_reservations
      add constraint driver_commission_reservations_settled_cuadra
      check (status <> 'SETTLED' or round(applied_usd + deferred_usd, 2) = round(reserved_usd, 2));
  end if;

  -- Una liberada no reparte nada: la carrera no llego a existir.
  if not exists (select 1 from pg_constraint where conname = 'driver_commission_reservations_released_en_cero') then
    alter table public.driver_commission_reservations
      add constraint driver_commission_reservations_released_en_cero
      check (status <> 'RELEASED' or (applied_usd = 0 and deferred_usd = 0 and deferred_paid_usd = 0));
  end if;

  -- Viva si y solo si sin resolver: el estado y la fecha no pueden mentirse.
  if not exists (select 1 from pg_constraint where conname = 'driver_commission_reservations_resuelta_coherente') then
    alter table public.driver_commission_reservations
      add constraint driver_commission_reservations_resuelta_coherente
      check ((status = 'RESERVED') = (resolved_at is null));
  end if;

  -- No se puede cobrar mas deuda de la que se difirio.
  if not exists (select 1 from pg_constraint where conname = 'driver_commission_reservations_cobrado_acotado') then
    alter table public.driver_commission_reservations
      add constraint driver_commission_reservations_cobrado_acotado
      check (deferred_paid_usd <= deferred_usd);
  end if;

  -- Pagada exige constancia: cuando, y con que apunte del libro.
  if not exists (select 1 from pg_constraint where conname = 'driver_maintenance_obligations_pagada_con_prueba') then
    alter table public.driver_maintenance_obligations
      add constraint driver_maintenance_obligations_pagada_con_prueba
      check ((status = 'PAID') = (paid_at is not null and transaction_id is not null));
  end if;

  -- Un aviso entregado no puede serlo antes de reclamarse.
  if not exists (select 1 from pg_constraint where conname = 'driver_inactivity_warnings_entrega_posterior') then
    alter table public.driver_inactivity_warnings
      add constraint driver_inactivity_warnings_entrega_posterior
      check (delivered_at is null or delivered_at >= claimed_at);
  end if;
end
$invariantes$;

-- ---------------------------------------------------------------------
-- Indices de las consultas de ejecucion (ninguno sobre importes).
-- ---------------------------------------------------------------------
create index if not exists driver_commission_reservations_driver_idx
  on public.driver_commission_reservations (driver_id, status);

-- La consulta del reconciliador: solo lo que sigue sin resolver.
create index if not exists driver_commission_reservations_vivas_idx
  on public.driver_commission_reservations (created_at)
  where status = 'RESERVED';

-- La cobranza de deuda diferida, de la mas vieja a la mas nueva.
create index if not exists driver_commission_reservations_deuda_idx
  on public.driver_commission_reservations (driver_id, resolved_at)
  where status = 'SETTLED';

create index if not exists driver_maintenance_obligations_pendientes_idx
  on public.driver_maintenance_obligations (driver_id, status, period);

create index if not exists driver_inactivity_warnings_driver_idx
  on public.driver_inactivity_warnings (driver_id);

-- ---------------------------------------------------------------------
-- EL DISPARADOR: `users.payload` deja de ser autoridad financiera.
-- ---------------------------------------------------------------------
-- Este es el corazon de v4. Cualquier escritura del documento de un conductor
-- --venga de donde venga, incluida una replica con una copia de hace diez
-- minutos-- sale de aqui con los campos de dinero reestampados desde las
-- tablas autoritativas. El documento conserva los campos por compatibilidad
-- con toda la aplicacion (pantallas, informes, sockets), pero como CACHE.
--
-- Permanece inerte para quien no tiene fila en `driver_finance_state`: con la
-- funcionalidad apagada no existe ninguna, y el comportamiento historico no
-- cambia en absoluto.
create or replace function public.driver_finance_project()
returns trigger
language plpgsql
as $proyeccion$
declare
  estado public.driver_finance_state%rowtype;
  pendientes jsonb;
  bloqueo jsonb;
begin
  if (new.payload ->> 'role') is distinct from 'driver' then
    return new;
  end if;

  select * into estado from public.driver_finance_state where driver_id = new.id;
  if not found then
    return new;
  end if;

  select coalesce(jsonb_agg(period order by period), '[]'::jsonb)
    into pendientes
    from public.driver_maintenance_obligations
   where driver_id = new.id and status = 'DUE';

  new.payload = new.payload || jsonb_build_object(
    'walletBalance', estado.wallet_balance_usd,
    'deferredCommissionUSD', estado.deferred_commission_usd,
    'maintenance', coalesce(new.payload -> 'maintenance', '{}'::jsonb) || jsonb_build_object(
      'anchorAt', estado.maintenance_anchor_at,
      'lastChargedPeriod', estado.last_charged_period,
      'pendingPeriods', pendientes
    ),
    'activityAnchorAt', estado.activity_anchor_at,
    'lastQualifyingTripAt', estado.last_qualifying_trip_at,
    'inactivityWarnedThreshold', estado.inactivity_warned_threshold
  );

  if estado.block_active then
    bloqueo = jsonb_build_object(
      'active', true,
      'reason', estado.block_reason,
      'since', to_char(estado.block_since at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  elsif estado.block_cleared_at is not null then
    bloqueo = jsonb_build_object(
      'active', false,
      'clearedAt', to_char(estado.block_cleared_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  else
    bloqueo = null;
  end if;
  if bloqueo is not null then
    new.payload = jsonb_set(new.payload, '{financialBlock}', bloqueo, true);
  end if;

  return new;
end
$proyeccion$;

drop trigger if exists driver_finance_project_trg on public.users;
create trigger driver_finance_project_trg
  before insert or update on public.users
  for each row execute function public.driver_finance_project();

-- ---------------------------------------------------------------------
-- Cierre de acceso, igual que el resto del esquema.
-- ---------------------------------------------------------------------
alter table public.driver_commission_reservations enable row level security;
alter table public.driver_maintenance_obligations enable row level security;
alter table public.driver_finance_state enable row level security;
alter table public.driver_inactivity_warnings enable row level security;

revoke all on public.driver_commission_reservations from anon, authenticated;
revoke all on public.driver_maintenance_obligations from anon, authenticated;
revoke all on public.driver_finance_state from anon, authenticated;
revoke all on public.driver_inactivity_warnings from anon, authenticated;
