-- +58Express DATABASE-1
-- Supabase is used only as managed PostgreSQL. The application connects with
-- DATABASE_URL; no Supabase Auth, Realtime, Storage or Data API is required.

create table public.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table public.users (
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

create unique index users_email_key_unique on public.users (email_key) where email_key is not null;
create unique index users_phone_key_unique on public.users (phone_key) where phone_key is not null;
create index users_role_idx on public.users (role);

create table public.trips (
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

create index trips_passenger_idx on public.trips (passenger_id);
create index trips_driver_idx on public.trips (driver_id);
create index trips_status_idx on public.trips (status);
create index trips_status_unassigned_idx on public.trips (status, assigned_driver_id)
  where status in ('SEARCHING', 'SCHEDULED');

create table public.notifications (
  id text primary key,
  payload jsonb not null,
  user_id text generated always as (payload ->> 'userId') stored,
  target_role text generated always as (payload ->> 'targetRole') stored,
  constraint notifications_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint notifications_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint notifications_user_fk foreign key (user_id) references public.users(id) deferrable initially deferred
);
create index notifications_user_idx on public.notifications (user_id);
create index notifications_target_role_idx on public.notifications (target_role);

create table public.messages (
  id text primary key,
  payload jsonb not null,
  trip_id text generated always as (payload ->> 'tripId') stored,
  sender_id text generated always as (payload ->> 'senderId') stored,
  constraint messages_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint messages_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint messages_trip_fk foreign key (trip_id) references public.trips(id) deferrable initially deferred,
  constraint messages_sender_fk foreign key (sender_id) references public.users(id) deferrable initially deferred
);
create index messages_trip_idx on public.messages (trip_id);

create table public.support_messages (
  id text primary key,
  payload jsonb not null,
  conversation_user_id text generated always as (payload ->> 'conversationUserId') stored,
  sender_id text generated always as (payload ->> 'senderId') stored,
  constraint support_messages_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint support_messages_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint support_messages_conversation_user_fk foreign key (conversation_user_id) references public.users(id) deferrable initially deferred,
  constraint support_messages_sender_fk foreign key (sender_id) references public.users(id) deferrable initially deferred
);
create index support_messages_conversation_idx on public.support_messages (conversation_user_id);

create table public.settings (
  id text primary key,
  payload jsonb not null,
  constraint settings_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint settings_payload_id_matches check ((payload ->> 'id') is not distinct from id)
);

create table public.transactions (
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
create index transactions_user_idx on public.transactions (user_id);
create index transactions_trip_idx on public.transactions (trip_id);
create unique index transactions_active_topup_reference_unique
  on public.transactions (reference_key)
  where transaction_type = 'TOP_UP' and transaction_status <> 'REJECTED' and reference_key is not null;
create unique index transactions_one_pending_payout_per_user
  on public.transactions (user_id)
  where transaction_type = 'PAYOUT' and transaction_status = 'PENDING';

create table public.driver_applications (
  id text primary key,
  payload jsonb not null,
  user_id text generated always as (payload ->> 'userId') stored,
  status text generated always as (payload ->> 'status') stored,
  constraint driver_applications_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint driver_applications_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint driver_applications_user_fk foreign key (user_id) references public.users(id) deferrable initially deferred
);
create unique index driver_applications_user_unique on public.driver_applications (user_id);
create index driver_applications_status_idx on public.driver_applications (status);

create table public.driver_documents (
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
create unique index driver_documents_application_type_unique on public.driver_documents (application_id, document_type);
create index driver_documents_user_idx on public.driver_documents (user_id);

create table public.admin_actions (
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
create index admin_actions_admin_idx on public.admin_actions (admin_id);
create index admin_actions_target_user_idx on public.admin_actions (target_user_id);

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
