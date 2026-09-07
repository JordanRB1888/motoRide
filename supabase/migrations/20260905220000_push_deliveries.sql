-- +58Express PUSH-1
-- La memoria de lo ya avisado, para que un mismo hecho no suene dos veces.
--
-- Un hecho puede llegar dos veces a este servidor por caminos que nada tienen
-- que ver entre sí: un socket que reintenta, una reconexión que reproduce lo
-- pendiente, dos oyentes sobre el mismo evento. La máquina de estados impide
-- que el VIAJE cambie dos veces, pero no que el sitio que avisa se ejecute dos
-- veces — y el usuario no percibe «una transición idempotente», percibe que el
-- teléfono sonó tres veces por lo mismo.
--
-- El `id` ES la clave del hecho: `viaje:<tripId>:<tipo>` o `mensaje:<id>`. No
-- hay un segundo campo que diga lo mismo y pueda desincronizarse.
--
-- NO GUARDA NADA DE NADIE. Ni destinatario, ni contenido, ni endpoint: solo qué
-- hecho ya se avisó y cuándo. Quién lo recibió está en `push_subscriptions`, y
-- ahí es donde tiene que estar.

create table if not exists public.push_deliveries (
  id text primary key,
  payload jsonb not null,
  sent_at bigint generated always as ((payload ->> 'at')::bigint) stored,
  constraint push_deliveries_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint push_deliveries_payload_id_matches check ((payload ->> 'id') is not distinct from id),
  constraint push_deliveries_sent_at_present check ((payload ->> 'at') is not null)
);

-- La poda por antigüedad es la única consulta que recorre la tabla. Se recuerda
-- veinticuatro horas: un intento de repetir un aviso un día después no es un
-- duplicado, es otra cosa y probablemente un error en otro sitio.
create index if not exists push_deliveries_sent_at_idx
  on public.push_deliveries (sent_at);

-- Sin clave foránea, y es deliberado: esta tabla no referencia a nadie. Atarla
-- a `users` obligaría a guardar el destinatario, que es justo lo que no hace
-- falta aquí para decidir si un aviso ya salió.

-- Defensa en profundidad, igual que el resto del esquema: estas tablas no son
-- una API. El acceso en ejecución es solo del backend con DATABASE_URL.
revoke all on public.push_deliveries from anon, authenticated;
alter table public.push_deliveries enable row level security;
