# Tablas y columnas de +58Express

> **Cómo se generó esto.** No leyendo el SQL: se aplicaron `esquema-completo.sql`
> y `esquema-driver-finance.sql` sobre una base PostgreSQL vacía y luego se le
> preguntó a la propia base qué había quedado. Lo que sigue es lo que hay.

**30 tablas · 215 columnas.** Las marcadas **·finance·** solo aparecen si aplicas
el segundo fichero, y su código todavía no está fusionado.

---

## Antes de leer la lista: el diseño no es el que esperas

Si buscas una columna por cada campo, no la vas a encontrar, y no es un olvido.

**Cada tabla guarda el documento entero en una sola columna `payload jsonb`.**
Un usuario, un viaje o una transacción viven ahí completos. Las demás columnas
son **derivadas**: `GENERATED ALWAYS AS (...) STORED`, calculadas por PostgreSQL
a partir del `payload`. Así:

```sql
create table public.users (
  id text primary key,
  payload jsonb not null,
  email_key text generated always as (nullif(lower(btrim(payload ->> 'email')), '')) stored,
  phone_key text generated always as (nullif(regexp_replace(payload ->> 'phone', '[^0-9]', '', 'g'), '')) stored,
  role  text generated always as (payload ->> 'role') stored,
  ...
);
```

Tres consecuencias prácticas, y conviene tenerlas claras antes de tocar nada:

1. **En las columnas derivadas no se escribe.** Un `insert` o un `update` que
   intente poner `email_key` falla. Se escribe en `payload` y PostgreSQL
   recalcula el resto.
2. **Están ahí para poder buscar.** `email_key` y `phone_key` existen porque
   llevan un índice único; `role` y `account_status`, porque se filtra por
   ellos. Lo que no se busca, se queda dentro del `payload`.
3. **El correo y el teléfono se normalizan en la base, no en el código.** El
   correo baja a minúsculas y se recorta; del teléfono se quitan todos los
   caracteres que no sean dígitos. Por eso dos personas no pueden registrarse
   con `Juan@X.com` y `juan@x.com`: para la base son el mismo.

Además, **todas las tablas llevan Row Level Security activo** y se les revoca
todo permiso a los roles `anon` y `authenticated` de Supabase. Es deliberado:
estas tablas **no son una API**. El único que entra es el servidor de
+58Express con su `DATABASE_URL`.

---

## `admin_actions`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `admin_id` | text | sí | — | → `users` |
| `target_user_id` | text | sí | — | → `users` |
| `application_id` | text | sí | — | → `driver_applications` |
| `transaction_id` | text | sí | — | → `transactions` |

*Índices:* `admin_actions_admin_idx`, `admin_actions_application_idx`, `admin_actions_pkey`, `admin_actions_target_user_idx`, `admin_actions_transaction_idx`

## `auth_challenges`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `channel` | text | sí | — |  |
| `purpose` | text | sí | — |  |
| `destination` | text | sí | — |  |
| `user_id` | text | sí | — | → `users` |
| `expires_at` | text | sí | — |  |

*Índices:* `auth_challenges_destination_purpose_idx`, `auth_challenges_expires_idx`, `auth_challenges_pkey`, `auth_challenges_user_idx`

## `auth_identities`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `user_id` | text | sí | — | → `users` |
| `provider` | text | sí | — |  |
| `provider_subject` | text | sí | — |  |

*Índices:* `auth_identities_pkey`, `auth_identities_provider_subject_unique`, `auth_identities_user_idx`

## `driver_applications`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `user_id` | text | sí | — | → `users` |
| `status` | text | sí | — |  |

*Índices:* `driver_applications_pkey`, `driver_applications_status_idx`, `driver_applications_user_unique`

## `driver_commission_reservations` **·finance·**

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `trip_id` | text | no | — | **PK** |
| `driver_id` | text | no | — | → `users` |
| `reserved_usd` | numeric | no | — |  |
| `applied_usd` | numeric | no | `0` |  |
| `deferred_usd` | numeric | no | `0` |  |
| `deferred_paid_usd` | numeric | no | `0` |  |
| `status` | text | no | `'RESERVED'::text` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `resolved_at` | timestamp with time zone | sí | — |  |

*Índices:* `driver_commission_reservations_deuda_idx`, `driver_commission_reservations_driver_idx`, `driver_commission_reservations_pkey`, `driver_commission_reservations_sin_resolver_idx`

## `driver_documents`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `application_id` | text | sí | — | → `driver_applications` |
| `user_id` | text | sí | — | → `users` |
| `document_type` | text | sí | — |  |

*Índices:* `driver_documents_application_type_unique`, `driver_documents_pkey`, `driver_documents_user_idx`

## `driver_finance_state` **·finance·**

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `driver_id` | text | no | — | **PK** → `users` |
| `wallet_balance_usd` | numeric | no | `0` |  |
| `deferred_commission_usd` | numeric | no | `0` |  |
| `maintenance_anchor_at` | bigint | sí | — |  |
| `last_charged_period` | integer | no | `0` |  |
| `activity_anchor_at` | bigint | sí | — |  |
| `last_qualifying_trip_at` | bigint | sí | — |  |
| `inactivity_warned_threshold` | integer | sí | — |  |
| `block_active` | boolean | no | `false` |  |
| `block_reason` | text | sí | — |  |
| `block_since` | timestamp with time zone | sí | — |  |
| `block_cleared_at` | timestamp with time zone | sí | — |  |
| `floor_exempt` | boolean | no | `false` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |

*Índices:* `driver_finance_state_pkey`

## `driver_inactivity_warnings` **·finance·**

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `driver_id` | text | no | — | **PK** → `users` |
| `anchor_at` | bigint | no | — | **PK** |
| `threshold_days` | integer | no | — | **PK** |
| `claimed_at` | timestamp with time zone | no | `now()` |  |
| `delivered_at` | timestamp with time zone | sí | — |  |

*Índices:* `driver_inactivity_warnings_driver_idx`, `driver_inactivity_warnings_pk`

## `driver_maintenance_obligations` **·finance·**

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `driver_id` | text | no | — | → `users` |
| `period` | integer | no | — |  |
| `amount_usd` | numeric | no | — |  |
| `status` | text | no | `'DUE'::text` |  |
| `transaction_id` | text | sí | — | → `transactions` |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `paid_at` | timestamp with time zone | sí | — |  |

*Índices:* `driver_maintenance_obligations_pendientes_idx`, `driver_maintenance_obligations_pkey`, `driver_maintenance_obligations_unico`

## `driver_money_operations` **·finance·**

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `operation_id` | text | no | — | **PK** |
| `driver_id` | text | no | — | → `users` |
| `kind` | text | no | — |  |
| `amount_usd` | numeric | no | — |  |
| `balance_after_usd` | numeric | no | — |  |
| `source_type` | text | no | — |  |
| `source_id` | text | no | — |  |
| `applied_at` | timestamp with time zone | no | `now()` |  |

*Índices:* `driver_money_operations_driver_idx`, `driver_money_operations_origen_unico`, `driver_money_operations_pkey`

## `exchange_rate_observations`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `base_currency` | text | no | — |  |
| `quote_currency` | text | no | — |  |
| `rate` | numeric | no | — |  |
| `value_date` | date | no | — |  |
| `source` | text | no | — |  |
| `fetched_at` | timestamp with time zone | no | — |  |
| `recorded_at` | timestamp with time zone | no | `now()` |  |
| `revision` | integer | no | — |  |

*Índices:* `exchange_rate_observations_historia_idx`, `exchange_rate_observations_identity`, `exchange_rate_observations_pkey`

## `exchange_rates`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `base_currency` | text | no | — |  |
| `quote_currency` | text | no | — |  |
| `rate` | numeric | no | — |  |
| `value_date` | date | no | — |  |
| `source` | text | no | — |  |
| `fetched_at` | timestamp with time zone | no | `now()` |  |
| `revision` | integer | no | `1` |  |

*Índices:* `exchange_rates_identity`, `exchange_rates_latest_idx`, `exchange_rates_pkey`

## `messages`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `trip_id` | text | sí | — | → `trips` |
| `sender_id` | text | sí | — | → `users` |

*Índices:* `messages_pkey`, `messages_sender_idx`, `messages_trip_idx`

## `notifications`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `user_id` | text | sí | — | → `users` |
| `target_role` | text | sí | — |  |

*Índices:* `notifications_pkey`, `notifications_target_role_idx`, `notifications_user_idx`

## `payment_methods`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `user_id` | text | no | — | → `users` |
| `method_type` | text | no | — |  |
| `status` | text | no | `'ACTIVE'::text` |  |
| `bank_code` | text | no | — |  |
| `bank_name` | text | no | — |  |
| `account_type` | text | sí | — |  |
| `account_number` | text | sí | — |  |
| `phone` | text | sí | — |  |
| `holder_name` | text | no | — |  |
| `holder_document_type` | text | no | — |  |
| `holder_document_number` | text | no | — |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |

*Índices:* `payment_methods_pkey`, `payment_methods_user_idx`

## `push_deliveries`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `sent_at` | bigint | sí | — |  |

*Índices:* `push_deliveries_pkey`, `push_deliveries_sent_at_idx`

## `push_subscriptions`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `user_id` | text | sí | — | → `users` |
| `endpoint_key` | text | sí | — |  |
| `disabled_at` | text | sí | — |  |

*Índices:* `push_subscriptions_active_idx`, `push_subscriptions_endpoint_key`, `push_subscriptions_pkey`, `push_subscriptions_user_idx`

## `scheduled_rides`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `subscription_id` | text | sí | — | → `transport_subscriptions` |
| `passenger_id` | text | sí | — | → `users` |
| `occurrence_key` | text | sí | — |  |
| `scheduled_pickup_at` | text | sí | — |  |
| `assignment_status` | text | sí | — |  |
| `service_status` | text | sí | — |  |

*Índices:* `scheduled_rides_assignment_idx`, `scheduled_rides_occurrence_key`, `scheduled_rides_pickup_at_idx`, `scheduled_rides_pkey`, `scheduled_rides_subscription_idx`

## `schema_migrations`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `applied_at` | timestamp with time zone | no | `now()` |  |

*Índices:* `schema_migrations_pkey`

## `settings`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |

*Índices:* `settings_pkey`

## `support_messages`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `conversation_user_id` | text | sí | — | → `users` |
| `sender_id` | text | sí | — | → `users` |

*Índices:* `support_messages_conversation_idx`, `support_messages_pkey`, `support_messages_sender_idx`

## `transactions`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `user_id` | text | sí | — | → `users` |
| `trip_id` | text | sí | — | → `trips` |
| `transaction_type` | text | sí | — |  |
| `transaction_status` | text | sí | — |  |
| `reference_key` | text | sí | — |  |

*Índices:* `transactions_active_topup_reference_unique`, `transactions_one_pending_payout_per_user`, `transactions_pkey`, `transactions_trip_idx`, `transactions_user_idx`

## `transport_subscriptions`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `passenger_id` | text | sí | — | → `users` |
| `status` | text | sí | — |  |

*Índices:* `transport_subscriptions_passenger_idx`, `transport_subscriptions_pkey`, `transport_subscriptions_status_idx`

## `trips`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `passenger_id` | text | sí | — | → `users` |
| `driver_id` | text | sí | — | → `users` |
| `assigned_driver_id` | text | sí | — | → `users` |
| `status` | text | sí | — |  |

*Índices:* `trips_assigned_driver_idx`, `trips_driver_idx`, `trips_passenger_idx`, `trips_passenger_status_idx`, `trips_pkey`, `trips_status_idx`, `trips_status_unassigned_idx`

## `users`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `email_key` | text | sí | — |  |
| `phone_key` | text | sí | — |  |
| `role` | text | sí | — |  |
| `account_status` | text | sí | — |  |

*Índices:* `users_email_key_unique`, `users_phone_key_unique`, `users_pkey`, `users_role_idx`

## `verified_contacts`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `payload` | jsonb | no | — |  |
| `user_id` | text | sí | — | → `users` |
| `contact_type` | text | sí | — |  |
| `value_normalized` | text | sí | — |  |
| `verified_at` | text | sí | — |  |

*Índices:* `verified_contacts_pkey`, `verified_contacts_user_type_value_unique`, `verified_contacts_verified_owner_unique`

## `wallet_ledger_entries`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `wallet_id` | text | no | — | → `wallets` |
| `user_id` | text | no | — | → `users` |
| `amount_usd` | numeric | no | — |  |
| `currency` | text | no | `'USD'::text` |  |
| `direction` | text | no | — |  |
| `entry_type` | text | no | — |  |
| `fund_class` | text | no | — |  |
| `reference_type` | text | sí | — |  |
| `reference_id` | text | sí | — |  |
| `idempotency_key` | text | no | — |  |
| `available_after_usd` | numeric | no | — |  |
| `reserved_after_usd` | numeric | no | — |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `metadata` | jsonb | no | `'{}'::jsonb` |  |

*Índices:* `wallet_ledger_entries_pkey`, `wallet_ledger_idempotencia`, `wallet_ledger_referencia_idx`, `wallet_ledger_wallet_idx`

## `wallets`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `user_id` | text | no | — | → `users` |
| `currency` | text | no | `'USD'::text` |  |
| `available_usd` | numeric | no | `0` |  |
| `reserved_usd` | numeric | no | `0` |  |
| `withdrawable_available_usd` | numeric | no | `0` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |

*Índices:* `wallets_pkey`, `wallets_user_unico`

## `withdrawal_audit_events`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `withdrawal_id` | text | no | — | → `withdrawal_requests` |
| `actor_user_id` | text | no | — |  |
| `actor_role` | text | no | — |  |
| `action` | text | no | — |  |
| `from_status` | text | sí | — |  |
| `to_status` | text | sí | — |  |
| `reason` | text | sí | — |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `metadata` | jsonb | no | `'{}'::jsonb` |  |

*Índices:* `withdrawal_audit_events_pkey`, `withdrawal_audit_retiro_idx`

## `withdrawal_requests`

| Columna | Tipo | Nulo | Por omisión | Notas |
|---|---|---|---|---|
| `id` | text | no | — | **PK** |
| `user_id` | text | no | — | → `users` |
| `wallet_id` | text | no | — | → `wallets` |
| `amount_usd` | numeric | no | — |  |
| `currency` | text | no | `'USD'::text` |  |
| `status` | text | no | `'REQUESTED'::text` |  |
| `payment_method_id` | text | no | — | → `payment_methods` |
| `method_type` | text | no | — |  |
| `method_snapshot` | jsonb | no | — |  |
| `fx_rate` | numeric | sí | — |  |
| `fx_effective_date` | date | sí | — |  |
| `fx_fetched_at` | timestamp with time zone | sí | — |  |
| `fx_source` | text | sí | — |  |
| `amount_ves` | numeric | sí | — |  |
| `payment_reference` | text | sí | — |  |
| `idempotency_key` | text | no | — |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |

*Índices:* `withdrawal_requests_pkey`, `withdrawals_estado_idx`, `withdrawals_idempotencia`, `withdrawals_user_idx`
