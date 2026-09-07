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
