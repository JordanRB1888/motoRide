-- +58Express DRIVER-FINANCE-1 v3 · PROPUESTA (NO APLICADA)
-- =====================================================================
-- Esta migración NO se ha ejecutado en ninguna base, ni de producción ni de
-- pruebas: vive en `proposals/` a propósito. Es el diseño que cierra el
-- hallazgo crítico de la segunda auditoría independiente, y necesita un
-- PostgreSQL de pruebas antes de aplicarse en ningún sitio.
--
-- EL PROBLEMA QUE RESUELVE
-- ------------------------
-- El estado financiero sensible a la concurrencia vive hoy dentro de
-- `users.payload`, y ese documento se escribe ENTERO desde memoria
-- (`insert ... on conflict do update set payload = excluded.payload`). Una
-- primitiva SQL atómica puede apuntar una reserva correctamente y, un
-- instante después, la escritura del documento completo de otra réplica —con
-- una copia vieja del conductor— la borra. La atomicidad se pierde no por
-- SQL, sino por el modelo de escritura que la rodea.
--
-- La cura no es más SQL sobre el mismo documento: es sacar el dinero
-- concurrente FUERA del documento, a filas propias que ninguna escritura de
-- `users` pueda tocar.
--
-- PRIVACIDAD: aquí hay deuda de personas concretas. Ninguna columna generada
-- expone importes; se indexa por identidad y estado, nunca por dinero. El
-- acceso en ejecución es SOLO del backend con DATABASE_URL, como el resto
-- del esquema, y se revoca a los roles anónimos igual que en las demás
-- tablas del proyecto.

-- ---------------------------------------------------------------------
-- A. Reserva de comisión, con DUEÑO durable: el viaje.
-- ---------------------------------------------------------------------
-- Una reserva sin dueño no se puede reconciliar: si el proceso muere entre
-- reservar y asignar, nadie sabe a qué carrera pertenecía ese dinero
-- comprometido y queda mermando la capacidad del conductor para siempre.
-- Con el viaje como clave, un reconciliador acotado puede liberar
-- exactamente las huérfanas.
create table if not exists public.driver_commission_reservations (
  trip_id text primary key,
  driver_id text not null,
  reserved_usd numeric(10, 2) not null check (reserved_usd >= 0),
  applied_usd numeric(10, 2) not null default 0 check (applied_usd >= 0),
  deferred_usd numeric(10, 2) not null default 0 check (deferred_usd >= 0),
  status text not null default 'RESERVED'
    check (status in ('RESERVED', 'SETTLED', 'RELEASED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint driver_commission_reservations_driver_fk
    foreign key (driver_id) references public.users(id) deferrable initially deferred
);

-- La consulta del reconciliador: reservas vivas de un conductor.
create index if not exists driver_commission_reservations_driver_idx
  on public.driver_commission_reservations (driver_id, status);

-- ---------------------------------------------------------------------
-- B. Obligación mensual de mantenimiento, única por conductor y periodo.
-- ---------------------------------------------------------------------
-- La unicidad la declara la BASE, no una búsqueda previa: dos evaluadores
-- simultáneos no pueden crear el mismo mes, y el perdedor no tiene nada que
-- sobrescribir porque el estado del cobro no vive en el documento.
create table if not exists public.driver_maintenance_obligations (
  id text primary key,                     -- driver-maintenance:<driverId>:<periodo>
  driver_id text not null,
  period integer not null check (period >= 1),
  amount_usd numeric(10, 2) not null,
  status text not null default 'DUE' check (status in ('DUE', 'PAID')),
  transaction_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint driver_maintenance_obligations_unico unique (driver_id, period),
  constraint driver_maintenance_obligations_driver_fk
    foreign key (driver_id) references public.users(id) deferrable initially deferred
);

create index if not exists driver_maintenance_obligations_pendientes_idx
  on public.driver_maintenance_obligations (driver_id, status, period);

-- ---------------------------------------------------------------------
-- C. Estado financiero del conductor: la fila que serializa el dinero.
-- ---------------------------------------------------------------------
-- Aquí viven los relojes y el comprometido. Al estar FUERA de
-- `users.payload`, ninguna escritura del documento completo puede pisarlos,
-- que es exactamente el fallo que la auditoría demostró. El saldo sigue en
-- `users` por ahora: moverlo afecta también a la billetera de las pasajeras,
-- que ya está cobrando de verdad, y ese paso merece su propia fase.
create table if not exists public.driver_finance_state (
  driver_id text primary key,
  committed_commission_usd numeric(10, 2) not null default 0 check (committed_commission_usd >= 0),
  deferred_commission_usd numeric(10, 2) not null default 0 check (deferred_commission_usd >= 0),
  maintenance_anchor_at timestamptz,
  last_charged_period integer not null default 0,
  activity_anchor_at timestamptz,
  inactivity_warned_threshold integer,
  financial_block_active boolean not null default false,
  financial_block_since timestamptz,
  updated_at timestamptz not null default now(),
  constraint driver_finance_state_driver_fk
    foreign key (driver_id) references public.users(id) deferrable initially deferred
);

-- El ancla se crea UNA vez: `insert ... on conflict do nothing` sobre esta
-- clave primaria es el «set-if-absent» que pedía la auditoría, y dos
-- réplicas convergen sin inventarse un «ahora» distinto cada una.

-- ---------------------------------------------------------------------
-- D. Reclamo de aviso: un recordatorio, una sola vez, aunque haya réplicas.
-- ---------------------------------------------------------------------
create table if not exists public.driver_inactivity_warnings (
  id text primary key,                     -- <driverId>:<ancla>:<umbral>
  driver_id text not null,
  threshold_days integer not null,
  delivered_at timestamptz,
  claimed_at timestamptz not null default now(),
  constraint driver_inactivity_warnings_driver_fk
    foreign key (driver_id) references public.users(id) deferrable initially deferred
);

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

-- ---------------------------------------------------------------------
-- Puesta en marcha, cuando llegue el momento
-- ---------------------------------------------------------------------
-- 1. Aplicar esta migración en una base de PRUEBAS y ejecutar
--    `server/test/driverFinancePostgres.test.js` con TEST_DATABASE_URL.
-- 2. Reescribir las primitivas para que lean y escriban estas tablas en vez
--    de `users.payload`, y que la aceptación de una carrera sea UNA sola
--    transacción: comprobar elegibilidad, reservar la comisión con dueño y
--    asignar el viaje.
-- 3. Solo entonces aplicar en producción, y siempre ANTES del código que la
--    usa, como se hizo con la fundación del Transporte Seguro.
--
-- Es idempotente (`create table if not exists`) y solo añade: no toca ni una
-- fila existente, así que aplicarla no cambia por sí sola ningún saldo.
