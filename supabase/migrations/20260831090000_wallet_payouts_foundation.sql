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
