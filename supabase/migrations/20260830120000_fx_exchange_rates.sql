-- +58Express FX-BCV-1
-- Tasas de cambio oficiales publicadas por el Banco Central de Venezuela.
--
-- POR QUÉ ESTA TABLA NO ES DOCUMENTAL
--
-- El resto del esquema guarda documentos (`payload jsonb` más columnas
-- generadas), y aquí se hace distinto A PROPÓSITO:
--
--   · una tasa no es un documento que evoluciona, es un hecho publicado en una
--     fecha: cuatro campos, inmutables, sin estructura anidada;
--   · JSONB obligaría a que el valor viajara como texto para no perder
--     precisión, y bastaría con que alguien lo escribiera como número JSON en
--     JavaScript para que 794.99170000 dejara de ser exacto. Con `numeric` esa
--     puerta no existe.
--
-- Con esto se cobra dinero, así que la precisión la garantiza el motor y no la
-- disciplina de quien escriba el próximo `INSERT`.

create table if not exists public.exchange_rates (
  -- Identidad determinista y legible: `USD-VES-BCV-2026-08-31`. Que la clave
  -- primaria SEA la identidad de negocio es lo que hace la escritura
  -- idempotente: reejecutar la tarea del día no puede duplicar nada.
  id text primary key,

  base_currency text not null,
  quote_currency text not null,

  -- 10 dígitos enteros y 8 decimales: los 8 que publica el BCV, con margen de
  -- sobra para el entero. NUNCA `float` ni `double precision`.
  rate numeric(18, 8) not null,

  -- La fecha para la que RIGE la tasa, según el propio BCV. No es el día en que
  -- la descargamos: el BCV publica por la tarde la tasa del día siguiente, y
  -- confundir las dos es cobrar con la tasa equivocada.
  value_date date not null,

  source text not null,

  -- Cuándo la obtuvimos nosotros. Sirve para diagnosticar, no para calcular.
  fetched_at timestamptz not null default now(),

  -- Cuántas veces el BCV corrigió la tasa de esta misma fecha valor. Empieza en
  -- 1. Que quede rastro importa: una corrección silenciosa sobre un valor con
  -- el que ya se cobró es exactamente lo que no debe pasar inadvertido.
  revision integer not null default 1,

  constraint exchange_rates_rate_positive check (rate > 0),
  constraint exchange_rates_revision_positive check (revision >= 1),

  -- El dólar es la base del sistema y el BCV publica en bolívares. Se declara
  -- en el esquema para que una tercera moneda exija una migración pensada, en
  -- lugar de aparecer por accidente.
  constraint exchange_rates_base_is_usd check (base_currency = 'USD'),
  constraint exchange_rates_quote_is_ves check (quote_currency = 'VES'),

  -- La ÚNICA fuente admitida. Ni Binance, ni mercado paralelo, ni APIs que
  -- republican al BCV: la restricción existe para que meterlas requiera cambiar
  -- el esquema a la vista de todos.
  constraint exchange_rates_source_is_bcv check (source = 'BCV'),

  -- La clave primaria tiene que coincidir con los campos que la componen. Sin
  -- esto, un identificador mal construido crearía una fila duplicada que el
  -- índice único no vería, y habría dos tasas para el mismo día.
  constraint exchange_rates_id_matches check (
    id = base_currency || '-' || quote_currency || '-' || source || '-' || to_char(value_date, 'YYYY-MM-DD')
  )
);

-- La identidad de negocio, declarada también sobre las columnas reales. Es
-- redundante con la clave primaria y esa redundancia es el punto: si algún día
-- cambia la forma del identificador, esto sigue impidiendo dos tasas para la
-- misma fecha, moneda y fuente.
create unique index if not exists exchange_rates_identity
  on public.exchange_rates (base_currency, quote_currency, source, value_date);

-- La consulta caliente: «la tasa vigente», que es la de fecha valor más
-- reciente. Descendente porque siempre se lee por el extremo nuevo.
create index if not exists exchange_rates_latest_idx
  on public.exchange_rates (base_currency, quote_currency, source, value_date desc);
