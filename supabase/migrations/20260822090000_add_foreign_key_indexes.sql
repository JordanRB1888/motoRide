-- Cover every foreign key used by PostgreSQL to validate parent updates/deletes.
create index trips_assigned_driver_idx on public.trips (assigned_driver_id);
create index messages_sender_idx on public.messages (sender_id);
create index support_messages_sender_idx on public.support_messages (sender_id);
create index admin_actions_application_idx on public.admin_actions (application_id);
create index admin_actions_transaction_idx on public.admin_actions (transaction_id);
