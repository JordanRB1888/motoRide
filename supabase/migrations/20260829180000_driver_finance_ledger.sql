-- +58Express DRIVER-FINANCE-1 · libro contable del conductor
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
-- `driver_finance_state`. Es seguro aplicarla ANTES del codigo.
--
-- PRIVACIDAD: aqui hay deuda de personas concretas. Ninguna columna generada
-- ni ningun indice expone importes; se indexa por identidad y estado. El
-- acceso en ejecucion es SOLO del backend con DATABASE_URL, como el resto del
-- esquema, y se revoca a los roles anonimos igual que en las demas tablas.

-- ---------------------------------------------------------------------
-- Comprobacion previa: fallar CLARO, y ANTES de tocar nada.
-- ---------------------------------------------------------------------
-- `create table if not exists` acepta sin rechistar una tabla vieja con otra
-- forma, y a partir de ahi el codigo escribiria dinero contra un esquema que
-- no es el que espera. La cuarta auditoria demostro que mirar solo los
-- NOMBRES de las columnas no basta: recreo `threshold_days` como `text`
-- conservando todos los nombres, y la migracion lo acepto.
--
-- Ahora se comprueban nombre, TIPO, precision y escala del dinero, y las
-- claves que garantizan la unicidad. Sobre una base limpia no hace nada: solo
-- mira tablas que YA existen.
--
-- Y distingue DOS cosas que antes confundia, que es lo que impedia actualizar
-- desde un esquema anterior:
--
--   columnas DE SIEMPRE  -> tienen que existir Y ser compatibles;
--   columnas NUEVAS      -> pueden faltar (mas abajo se anaden). Solo se
--                           validan si ya estan, por si alguien las creo a
--                           mano con otra forma.
--
-- Sin esa distincion, la comprobacion exigia columnas que ella misma iba a
-- crear tres parrafos despues, y actualizar una base con el esquema anterior
-- era imposible.
do $compatibilidad$
declare
  problemas text;
begin
  select string_agg(detalle, '; ' order by detalle) into problemas from (
    -- 1) Columnas ausentes o con el tipo equivocado.
    select requerida.tabla || '.' || requerida.columna || ' ('
             || coalesce(
                  (select 'es ' || c.data_type
                         || case when requerida.tipo = 'numeric'
                                 then coalesce('(' || c.numeric_precision || ',' || c.numeric_scale || ')', '')
                                 else '' end
                     from information_schema.columns c
                    where c.table_schema = 'public'
                      and c.table_name = requerida.tabla
                      and c.column_name = requerida.columna),
                  'ausente')
             || ', se espera ' || requerida.tipo
             || coalesce('(' || requerida.precision || ',' || requerida.escala || ')', '') || ')' as detalle
      from (values
        -- tabla                           columna                        tipo                       prec  esc   nueva
        ('driver_finance_state',           'driver_id',                   'text',                    null::int, null::int, false),
        ('driver_finance_state',           'wallet_balance_usd',          'numeric',                 12,   2,    false),
        ('driver_finance_state',           'deferred_commission_usd',     'numeric',                 12,   2,    false),
        ('driver_finance_state',           'maintenance_anchor_at',       'bigint',                  null, null, false),
        ('driver_finance_state',           'last_charged_period',         'integer',                 null, null, false),
        ('driver_finance_state',           'activity_anchor_at',          'bigint',                  null, null, false),
        ('driver_finance_state',           'last_qualifying_trip_at',     'bigint',                  null, null, false),
        ('driver_finance_state',           'inactivity_warned_threshold', 'integer',                 null, null, false),
        ('driver_finance_state',           'block_active',                'boolean',                 null, null, false),
        ('driver_finance_state',           'block_reason',                'text',                    null, null, false),
        ('driver_finance_state',           'block_since',                 'timestamp with time zone',null, null, false),
        ('driver_finance_state',           'block_cleared_at',            'timestamp with time zone',null, null, false),
        -- NUEVA: puede faltar; se anade mas abajo.
        ('driver_finance_state',           'floor_exempt',                'boolean',                 null, null, true),
        ('driver_commission_reservations', 'trip_id',                     'text',                    null, null, false),
        ('driver_commission_reservations', 'driver_id',                   'text',                    null, null, false),
        ('driver_commission_reservations', 'reserved_usd',                'numeric',                 10,   2,    false),
        ('driver_commission_reservations', 'applied_usd',                 'numeric',                 10,   2,    false),
        ('driver_commission_reservations', 'deferred_usd',                'numeric',                 10,   2,    false),
        -- NUEVA: puede faltar; se anade mas abajo.
        ('driver_commission_reservations', 'deferred_paid_usd',           'numeric',                 10,   2,    true),
        ('driver_commission_reservations', 'status',                      'text',                    null, null, false),
        ('driver_commission_reservations', 'resolved_at',                 'timestamp with time zone',null, null, false),
        ('driver_maintenance_obligations', 'id',                          'text',                    null, null, false),
        ('driver_maintenance_obligations', 'driver_id',                   'text',                    null, null, false),
        ('driver_maintenance_obligations', 'period',                      'integer',                 null, null, false),
        ('driver_maintenance_obligations', 'amount_usd',                  'numeric',                 10,   2,    false),
        ('driver_maintenance_obligations', 'status',                      'text',                    null, null, false),
        ('driver_maintenance_obligations', 'transaction_id',              'text',                    null, null, false),
        ('driver_maintenance_obligations', 'paid_at',                     'timestamp with time zone',null, null, false),
        ('driver_inactivity_warnings',     'driver_id',                   'text',                    null, null, false),
        ('driver_inactivity_warnings',     'anchor_at',                   'bigint',                  null, null, false),
        ('driver_inactivity_warnings',     'threshold_days',              'integer',                 null, null, false),
        ('driver_inactivity_warnings',     'delivered_at',                'timestamp with time zone',null, null, false),
        -- Tabla entera nueva: si no existe, la comprobacion ni la mira; si
        -- existe, tiene que tener exactamente esta forma.
        ('driver_money_operations',        'operation_id',                'text',                    null, null, false),
        ('driver_money_operations',        'driver_id',                   'text',                    null, null, false),
        ('driver_money_operations',        'kind',                        'text',                    null, null, false),
        ('driver_money_operations',        'amount_usd',                  'numeric',                 12,   2,    false),
        ('driver_money_operations',        'balance_after_usd',           'numeric',                 12,   2,    false),
        -- NUEVAS en esta ronda: pueden faltar y se anaden mas abajo.
        ('driver_money_operations',        'source_type',                 'text',                    null, null, true),
        ('driver_money_operations',        'source_id',                   'text',                    null, null, true)
      ) as requerida(tabla, columna, tipo, precision, escala, es_nueva)
     where to_regclass('public.' || requerida.tabla) is not null
       -- Una columna NUEVA que todavia no existe no es un problema: se anade
       -- mas abajo. Lo que si es un problema es que exista con otra forma.
       and (not requerida.es_nueva or exists (
             select 1 from information_schema.columns c
              where c.table_schema = 'public'
                and c.table_name = requerida.tabla
                and c.column_name = requerida.columna))
       and not exists (
         select 1 from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = requerida.tabla
            and c.column_name = requerida.columna
            and c.data_type = requerida.tipo
            -- La precision y la escala solo se exigen al DINERO. `bigint` e
            -- `integer` declaran las suyas (64,0 y 32,0) y compararlas con
            -- nulo rechazaria un esquema perfectamente correcto.
            and (requerida.tipo <> 'numeric'
                 or (c.numeric_precision is not distinct from requerida.precision
                     and c.numeric_scale is not distinct from requerida.escala))
       )

    union all

    -- 2) Las claves que sostienen la unicidad del dinero, validadas por sus
    --    COLUMNAS y no por su nombre.
    --
    --    La sexta auditoria demostro por que importa: creo una tabla de
    --    operaciones con una clave primaria llamada
    --    `driver_money_operations_pkey` —el nombre exacto que se esperaba—
    --    pero declarada sobre `driver_id`. Con esa forma, dos recargas
    --    distintas del mismo conductor chocarian entre si y una identidad
    --    repetida pasaria desapercibida. La comprobacion la acepto porque
    --    solo miraba el nombre.
    --
    --    Aqui el nombre da igual: lo que se exige es que exista una clave del
    --    tipo pedido sobre EXACTAMENTE esas columnas y en ese orden.
    select 'la clave ' || clave.tipo_legible || ' de ' || clave.tabla
             || ' deberia estar sobre (' || clave.columnas || ') y '
             || coalesce(
                  (select 'esta sobre (' || string_agg(a.attname, ',' order by u.ord) || ')'
                     from pg_constraint k
                     cross join lateral unnest(k.conkey) with ordinality as u(attnum, ord)
                     join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum
                    where k.conrelid = to_regclass('public.' || clave.tabla)
                      and k.contype = clave.tipo
                    group by k.oid
                    limit 1),
                  'no existe') as detalle
      from (values
        ('driver_finance_state',           'p', 'primaria', 'driver_id'),
        ('driver_commission_reservations', 'p', 'primaria', 'trip_id'),
        ('driver_maintenance_obligations', 'p', 'primaria', 'id'),
        ('driver_maintenance_obligations', 'u', 'unica',    'driver_id,period'),
        ('driver_inactivity_warnings',     'p', 'primaria', 'driver_id,anchor_at,threshold_days'),
        ('driver_money_operations',        'p', 'primaria', 'operation_id')
      ) as clave(tabla, tipo, tipo_legible, columnas)
     where to_regclass('public.' || clave.tabla) is not null
       and not exists (
         select 1 from pg_constraint k
          where k.conrelid = to_regclass('public.' || clave.tabla)
            and k.contype = clave.tipo
            and (select string_agg(a.attname, ',' order by u.ord)
                   from unnest(k.conkey) with ordinality as u(attnum, ord)
                   join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum)
                = clave.columnas
       )

    union all

    -- 3) Las claves foraneas, por sus COLUMNAS REALES.
    --
    --    La septima auditoria demostro que buscar texto en la definicion no
    --    prueba nada: creo la tabla de operaciones con una clave foranea
    --    `source_id -> users(id)`, cuya definicion contiene «REFERENCES
    --    users» y por tanto pasaba el patron — mientras `driver_id`, que es
    --    la columna que dice de QUIEN es el dinero, quedaba sin restringir.
    --
    --    Aqui se exige la terna completa: columna local, tabla referenciada y
    --    columna referenciada. Una clave sobre otra columna ya no cuenta.
    select 'la clave foranea ' || fk.tabla || '(' || fk.columna || ') deberia apuntar a '
             || fk.tabla_ref || '(' || fk.columna_ref || ') y '
             || coalesce(
                  (select 'la unica que hay sale de (' || a.attname || ')'
                     from pg_constraint k
                     join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
                    where k.conrelid = to_regclass('public.' || fk.tabla)
                      and k.contype = 'f'
                    limit 1),
                  'no hay ninguna') as detalle
      from (values
        ('driver_money_operations',        'driver_id', 'users', 'id'),
        ('driver_finance_state',           'driver_id', 'users', 'id'),
        ('driver_commission_reservations', 'driver_id', 'users', 'id'),
        ('driver_maintenance_obligations', 'driver_id', 'users', 'id'),
        ('driver_inactivity_warnings',     'driver_id', 'users', 'id')
      ) as fk(tabla, columna, tabla_ref, columna_ref)
     where to_regclass('public.' || fk.tabla) is not null
       and to_regclass('public.' || fk.tabla_ref) is not null
       and not exists (
         select 1 from pg_constraint k
          where k.conrelid = to_regclass('public.' || fk.tabla)
            and k.contype = 'f'
            and k.confrelid = to_regclass('public.' || fk.tabla_ref)
            and array_length(k.conkey, 1) = 1
            and array_length(k.confkey, 1) = 1
            and (select a.attname from pg_attribute a
                  where a.attrelid = k.conrelid and a.attnum = k.conkey[1]) = fk.columna
            and (select a.attname from pg_attribute a
                  where a.attrelid = k.confrelid and a.attnum = k.confkey[1]) = fk.columna_ref
       )

    union all

    -- 4) La NULABILIDAD de lo que no puede faltar nunca.
    --
    --    Tambien la encontro la septima auditoria: una identidad de operacion,
    --    un importe, un conductor o un estado que admitan NULL rompen el libro
    --    en silencio — se podria anotar dinero sin dueno, o una reserva sin
    --    estado. Solo se exige a las columnas DE SIEMPRE: las que esta misma
    --    migracion anade se declaran NOT NULL mas abajo, y si algun dato lo
    --    impidiera ese `alter` fallaria por si solo, en voz alta.
    select obligatoria.tabla || '.' || obligatoria.columna
             || ' admite NULL y no puede' as detalle
      from (values
        ('driver_money_operations',        'operation_id'),
        ('driver_money_operations',        'driver_id'),
        ('driver_money_operations',        'kind'),
        ('driver_money_operations',        'amount_usd'),
        ('driver_money_operations',        'balance_after_usd'),
        ('driver_finance_state',           'driver_id'),
        ('driver_finance_state',           'wallet_balance_usd'),
        ('driver_finance_state',           'deferred_commission_usd'),
        ('driver_finance_state',           'last_charged_period'),
        ('driver_finance_state',           'block_active'),
        ('driver_commission_reservations', 'trip_id'),
        ('driver_commission_reservations', 'driver_id'),
        ('driver_commission_reservations', 'reserved_usd'),
        ('driver_commission_reservations', 'applied_usd'),
        ('driver_commission_reservations', 'deferred_usd'),
        ('driver_commission_reservations', 'status'),
        ('driver_maintenance_obligations', 'id'),
        ('driver_maintenance_obligations', 'driver_id'),
        ('driver_maintenance_obligations', 'period'),
        ('driver_maintenance_obligations', 'amount_usd'),
        ('driver_maintenance_obligations', 'status'),
        ('driver_inactivity_warnings',     'driver_id'),
        ('driver_inactivity_warnings',     'anchor_at'),
        ('driver_inactivity_warnings',     'threshold_days'),
        ('driver_inactivity_warnings',     'claimed_at')
      ) as obligatoria(tabla, columna)
     where to_regclass('public.' || obligatoria.tabla) is not null
       and exists (
         select 1 from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = obligatoria.tabla
            and c.column_name = obligatoria.columna and c.is_nullable = 'YES'
       )

  ) as hallazgos;

  if problemas is not null then
    raise exception 'DRIVER_FINANCE_SCHEMA_INCOMPATIBLE: %', problemas;
  end if;
end
$compatibilidad$;

-- ---------------------------------------------------------------------
-- Comprobacion previa II: que la restriccion EXISTA no prueba que SIRVA.
-- ---------------------------------------------------------------------
-- La septima auditoria construyo una tabla de operaciones con
-- `check (kind = 'CREDIT')` y `check (amount_usd >= -999999)`: dos
-- restricciones con los nombres y las palabras correctas que, en realidad,
-- prohiben una operacion valida y permiten dinero negativo. El catalogo no
-- distingue eso; la base, si.
--
-- Aqui se le pregunta a la base directamente, con inserciones de sonda que
-- SIEMPRE se deshacen: cada una vive dentro de su propio bloque con manejador,
-- que es una subtransaccion, y termina cancelandose a proposito. No queda ni
-- una fila. Y solo se ejecuta si la tabla YA existe: en una base limpia no hay
-- nada que sondear.
do $sondas$
declare
  hay_origen boolean;
  columnas text;
  extra text;
  conductor text;
  sonda record;
  acepta boolean;
  problemas text := null;
begin
  if to_regclass('public.driver_money_operations') is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'driver_money_operations'
       and column_name = 'source_type'
  ) into hay_origen;

  columnas := 'operation_id, driver_id, kind, amount_usd, balance_after_usd'
           || case when hay_origen then ', source_type, source_id' else '' end;
  extra := case when hay_origen then ', ''TOPUP'', ''sonda-de-esquema''' else '' end;

  -- Cada sonda tiene que medir UNA cosa. Las tres primeras miden las
  -- comprobaciones, asi que se les da un conductor que existe de verdad: de lo
  -- contrario un rechazo de la clave foranea se confundiria con un rechazo de
  -- la comprobacion, y la sonda acusaria a la inocente. La cuarta —esa si mide
  -- la clave foranea— usa un conductor inexistente a proposito.
  select u.id into conductor from public.users u limit 1;
  conductor := coalesce(conductor, 'sonda_conductor_inexistente');

  for sonda in
    select * from (values
      ('DEBIT',  '0.00',  true,
       'la comprobacion de direccion RECHAZA un DEBIT, que es una operacion valida'),
      ('SONDA',  '0.00',  false,
       'la comprobacion de direccion ACEPTA un valor que no es CREDIT ni DEBIT'),
      ('CREDIT', '-1.00', false,
       'la comprobacion de importe ACEPTA dinero negativo')
    ) as s(kind, importe, debe_aceptar, queja)
  loop
    acepta := false;
    begin
      execute format(
        'insert into public.driver_money_operations (%s) values (%L, %L, %L, %s, 0%s)',
        columnas, 'sonda_esquema_driver_finance', conductor,
        sonda.kind, sonda.importe, extra);
      acepta := true;
      -- La fila entro: se cancela la subtransaccion para no dejar rastro.
      raise exception using errcode = 'DF001';
    exception
      when sqlstate 'DF001' then null;   -- la cancelacion es nuestra
      when others then null;             -- la base la rechazo: era lo esperado
    end;
    if acepta <> sonda.debe_aceptar then
      problemas := coalesce(problemas || '; ', '') || sonda.queja;
    end if;
  end loop;

  -- Y la cuarta sonda: ¿el conductor tiene que existir de verdad? Se exige la
  -- comprobacion INMEDIATA solo para preguntarlo, y se devuelve el diferimiento
  -- declarado justo despues.
  set constraints all immediate;
  acepta := false;
  begin
    execute format(
      'insert into public.driver_money_operations (%s) values (%L, %L, %L, %s, 0%s)',
      columnas, 'sonda_esquema_driver_finance', 'sonda_conductor_inexistente',
      'CREDIT', '1.00', extra);
    acepta := true;
    raise exception using errcode = 'DF001';
  exception
    when sqlstate 'DF001' then null;
    when others then null;
  end;
  -- Se deja en modo INMEDIATO a proposito: lo que quede pendiente de una
  -- transaccion ajena se comprueba AHORA y no cuando esta migracion intente
  -- declarar sus columnas NOT NULL, que es cuando ya no se podria.
  if acepta then
    problemas := coalesce(problemas || '; ', '')
      || 'se puede anotar dinero de un conductor que no existe: falta la clave foranea a users(id)';
  end if;

  if problemas is not null then
    raise exception 'DRIVER_FINANCE_SCHEMA_INEFFECTIVE: %', problemas;
  end if;

  -- Y antes de declarar la unicidad del ORIGEN: ¿ya hay dos operaciones
  -- validas que compartan el mismo origen de negocio? Si las hay, la migracion
  -- se para aqui. NO se borra ni se fusiona ningun testigo de dinero: eso lo
  -- mira una persona.
  --
  -- Produccion nunca activo esta funcionalidad y su tabla esta vacia, pero eso
  -- se COMPRUEBA, no se supone.
  if hay_origen then
    execute $duplicados$
      select string_agg(d.source_type || '/' || d.source_id || ' (x' || d.n || ')', ', ')
        from (select source_type, source_id, count(*)::text as n
                from public.driver_money_operations
               where source_type is not null and source_id is not null
                 and source_type <> 'LEGACY_UNKNOWN'
               group by source_type, source_id
              having count(*) > 1) as d
    $duplicados$ into problemas;
    if problemas is not null then
      raise exception 'DRIVER_FINANCE_DUPLICATE_SOURCE: % ya movieron dinero mas de una vez '
                      'bajo el mismo origen; la unicidad no se puede declarar sin revisarlos', problemas;
    end if;

    -- Y antes de declarar que el origen no puede estar en blanco: ¿ya hay
    -- alguna fila que lo tenga? Si la hay, la migracion se para.
    --
    -- NO se recorta ni se repara ningun testigo de dinero. Una operacion sin
    -- procedencia es un hecho financiero sin identificar, y arreglarlo a
    -- ciegas seria inventarle una. Lo mira una persona.
    execute $enblanco$
      select count(*)::text from public.driver_money_operations
       where coalesce(source_type, '') !~ '\S'
          or coalesce(source_id, '') !~ '\S'
    $enblanco$ into problemas;
    if problemas is not null and problemas <> '0' then
      raise exception 'DRIVER_FINANCE_BLANK_SOURCE: % operaciones tienen un origen vacio o de solo '
                      'espacios; no se puede declarar la restriccion sin revisarlas, y NO se reparan solas',
                      problemas;
    end if;
  end if;
end
$sondas$;

-- ---------------------------------------------------------------------
-- Comprobacion previa III: el indice del ORIGEN, por su FORMA.
-- ---------------------------------------------------------------------
-- `create unique index if not exists` mira el NOMBRE y nada mas. La octava
-- auditoria creo un indice con el nombre exacto que se esperaba
-- —`driver_money_operations_origen_unico`— pero sobre `(operation_id,
-- source_id)`. El `if not exists` no hizo nada, la migracion paso, y la
-- unicidad del origen —lo unico que impide que el mismo hecho de negocio
-- mueva dinero dos veces— simplemente no existia.
--
-- Aqui se exige todo lo que define ese indice: que sea UNICO, sobre esta
-- tabla, sobre EXACTAMENTE esas columnas y en ese orden, con EXACTAMENTE ese
-- predicado, y en estado utilizable. Si algo no cuadra, la migracion se para:
-- no se reemplaza un indice de dinero por las buenas.
do $indice_origen$
declare
  problema text := null;
  columnas text;
  predicado text;
  fila record;
begin
  if to_regclass('public.driver_money_operations') is null then
    return;
  end if;

  select i.indisunique, i.indisvalid, i.indisready, i.indislive,
         i.indnatts, i.indnkeyatts,
         pg_get_expr(i.indpred, i.indrelid) as predicado
    into fila
    from pg_class c
    join pg_index i on i.indexrelid = c.oid
   where c.relname = 'driver_money_operations_origen_unico'
     and c.relnamespace = 'public'::regnamespace
     and i.indrelid = to_regclass('public.driver_money_operations');

  if not found then
    -- No existe todavia: mas abajo se crea con la forma correcta. Pero si
    -- existe un objeto con ESE nombre que no es un indice de esta tabla, hay
    -- que decirlo, porque el `if not exists` tampoco lo tocara.
    if to_regclass('public.driver_money_operations_origen_unico') is not null then
      raise exception 'DRIVER_FINANCE_SOURCE_INDEX_INVALID: ya existe algo llamado '
                      'driver_money_operations_origen_unico que no es el indice de origen de esta tabla';
    end if;
    return;
  end if;

  select string_agg(a.attname, ',' order by u.ord)
    into columnas
    from pg_index i
    cross join lateral unnest(i.indkey) with ordinality as u(attnum, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = u.attnum
   where i.indexrelid = 'public.driver_money_operations_origen_unico'::regclass
     and u.ord <= i.indnkeyatts;

  predicado := coalesce(regexp_replace(fila.predicado, '\s+', ' ', 'g'), '');

  if not fila.indisunique then
    problema := 'no es UNICO';
  elsif columnas is distinct from 'source_type,source_id' then
    problema := 'esta sobre (' || coalesce(columnas, 'nada') || ') y debe estar sobre (source_type,source_id)';
  elsif fila.indnkeyatts <> 2 or fila.indnatts <> 2 then
    problema := 'tiene columnas de mas: el indice del origen son dos y solo dos';
  elsif predicado <> '(source_type <> ''LEGACY_UNKNOWN''::text)' then
    problema := 'su predicado es «' || predicado || '» y debe excluir EXACTAMENTE los testigos legados';
  elsif not (fila.indisvalid and fila.indisready and fila.indislive) then
    problema := 'existe pero no esta en uso (invalido, no listo o marcado para borrar)';
  end if;

  if problema is not null then
    raise exception 'DRIVER_FINANCE_SOURCE_INDEX_INVALID: el indice de unicidad del origen %. '
                    'No se sustituye por las buenas: un indice de dinero lo revisa una persona', problema;
  end if;
end
$indice_origen$;

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
  status text not null default 'RESERVED',
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
-- CONDUCTOR: no hay contencion global. Y es SIEMPRE el primer cerrojo que se
-- toma, lo que fija un orden global y evita interbloqueos.
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
  -- Un conductor que YA venia por debajo del suelo cuando se sembro su fila
  -- queda exento hasta que vuelva a subir: el suelo protege de hundirse mas,
  -- no sirve para rechazar una deuda que la plataforma ya habia permitido.
  floor_exempt boolean not null default false,
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
-- E. La operacion de dinero, con IDENTIDAD durable.
-- ---------------------------------------------------------------------
-- Esta tabla existe por un fallo concreto: un credito o un debito cuyo COMMIT
-- entro pero cuya confirmacion se perdio se reintentaba y movia el dinero DOS
-- veces. La reserva de comision ya tenia su testigo -el viaje-, y el
-- mantenimiento el suyo -el periodo-, pero una recarga o un retiro no tenian
-- ninguno: eran anonimos.
--
-- Ahora cada operacion externa trae su identidad estable, y esta clave
-- primaria es la que decide. Reintentar la MISMA operacion no puede mover
-- dinero otra vez: el segundo intento no inserta nada y se retira leyendo lo
-- que ya paso.
--
-- La identidad es una cadena con prefijo, a proposito generica:
--   topup:<idDeLaTransaccion>       recarga aprobada
--   payout:<idDeLaTransaccion>      liquidacion pagada
--   withdrawal:<idDeLaSolicitud>    retiros (fase futura)
--   admin-adjustment:<id>           ajuste administrativo
-- Nada aqui sabe de metodos de pago ni de tasas de cambio: es infraestructura
-- de libro contable y tiene que seguir siendolo.
create table if not exists public.driver_money_operations (
  operation_id text primary key,
  driver_id text not null,
  kind text not null check (kind in ('CREDIT', 'DEBIT')),
  amount_usd numeric(12, 2) not null check (amount_usd >= 0),
  balance_after_usd numeric(12, 2) not null,
  -- DE DONDE viene la operacion, de forma inmutable. No basta con el prefijo
  -- del identificador: la sexta auditoria demostro que reconocer un duplicado
  -- solo por su identidad permitia reutilizar la misma cadena con otro
  -- conductor, otro importe u otra direccion y recibir un «ya aplicado».
  source_type text not null,
  source_id text not null,
  applied_at timestamptz not null default now(),
  constraint driver_money_operations_driver_fk
    foreign key (driver_id) references public.users(id)
    on delete no action deferrable initially deferred
);

create index if not exists driver_money_operations_driver_idx
  on public.driver_money_operations (driver_id, applied_at);

-- ---------------------------------------------------------------------
-- Columnas anadidas despues de la primera version del esquema.
-- ---------------------------------------------------------------------
alter table public.driver_commission_reservations
  add column if not exists deferred_paid_usd numeric(10, 2) not null default 0;
alter table public.driver_finance_state
  add column if not exists floor_exempt boolean not null default false;

-- El origen de las operaciones que ya existan. NO se inventa: lo que no se
-- sabe se marca como tal, y el codigo trata un testigo asi como IMPOSIBLE DE
-- VERIFICAR — ante un duplicado con ese origen falla cerrado en vez de dar por
-- buena una identidad que no puede comprobar. En produccion esto no ocurre:
-- la funcionalidad nunca se activo y la tabla nace vacia.
alter table public.driver_money_operations
  add column if not exists source_type text;
alter table public.driver_money_operations
  add column if not exists source_id text;
update public.driver_money_operations
   set source_type = coalesce(source_type, 'LEGACY_UNKNOWN'),
       source_id = coalesce(source_id, operation_id)
 where source_type is null or source_id is null;
alter table public.driver_money_operations
  alter column source_type set not null;
alter table public.driver_money_operations
  alter column source_id set not null;

-- ---------------------------------------------------------------------
-- El ORIGEN DE NEGOCIO es tambien una identidad, y la base la hace unica.
-- ---------------------------------------------------------------------
-- La septima auditoria movio el mismo dinero dos veces sin romper ninguna
-- regla: `operation_id` era unico, si — pero le puso DOS identidades distintas
-- al MISMO origen (`TOPUP` / `request-123`) y la recarga entro dos veces.
-- Saldo 1.00 -> 3.00 -> 5.00.
--
-- La proteccion no puede vivir solo en la aplicacion: dos procesos pueden
-- hacer su comprobacion previa a la vez y los dos encontrarla limpia. La
-- declara la base.
--
-- `LEGACY_UNKNOWN` queda FUERA del indice, y a proposito: los testigos
-- migrados no tienen origen real que pueda ser unico, y exigirselo obligaria a
-- inventarles uno o a borrarlos. Ninguna de las dos cosas es aceptable con
-- dinero de por medio.
create unique index if not exists driver_money_operations_origen_unico
  on public.driver_money_operations (source_type, source_id)
  where source_type <> 'LEGACY_UNKNOWN';

-- Que exista con la forma correcta es necesario; que MUERDA es lo que importa.
-- Se le pregunta a la base con filas de sonda que siempre se deshacen.
do $muerde$
declare
  conductor text;
  acepta boolean;
begin
  select u.id into conductor from public.users u limit 1;
  if conductor is null then
    return;   -- una base sin usuarios no puede sondear la clave foranea
  end if;

  -- 1) Dos operaciones con el MISMO origen valido: la segunda tiene que fallar.
  acepta := false;
  begin
    insert into public.driver_money_operations
      (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
    values ('sonda_origen_1', conductor, 'CREDIT', 1, 1, 'TOPUP', 'sonda-origen-unico'),
           ('sonda_origen_2', conductor, 'CREDIT', 1, 2, 'TOPUP', 'sonda-origen-unico');
    acepta := true;
    raise exception using errcode = 'DF002';
  exception
    when sqlstate 'DF002' then null;
    when others then null;
  end;
  if acepta then
    raise exception 'DRIVER_FINANCE_SOURCE_INDEX_INEFFECTIVE: el indice existe pero no impide que el '
                    'mismo origen de negocio mueva dinero dos veces';
  end if;

  -- 2) Y dos testigos LEGADOS con el mismo origen SI tienen que caber: no
  --    tienen procedencia real que pueda ser unica, y exigirsela obligaria a
  --    inventarles una o a borrarlos. Nacen validos y se marcan despues, que
  --    es exactamente lo que hace el relleno de mas arriba.
  acepta := false;
  begin
    insert into public.driver_money_operations
      (operation_id, driver_id, kind, amount_usd, balance_after_usd, source_type, source_id)
    values ('sonda_legado_1', conductor, 'CREDIT', 1, 1, 'TOPUP', 'sonda-legado-a'),
           ('sonda_legado_2', conductor, 'CREDIT', 1, 2, 'TOPUP', 'sonda-legado-b');
    update public.driver_money_operations
       set source_type = 'LEGACY_UNKNOWN', source_id = 'sonda-legado-comun'
     where operation_id in ('sonda_legado_1', 'sonda_legado_2');
    acepta := true;
    raise exception using errcode = 'DF002';
  exception
    when sqlstate 'DF002' then null;
    when others then null;
  end;
  if not acepta then
    raise exception 'DRIVER_FINANCE_SOURCE_INDEX_INEFFECTIVE: el indice alcanza a los testigos legados, '
                    'que no tienen procedencia real y no pueden ser unicos entre si';
  end if;
end
$muerde$;

-- `LEGACY_UNKNOWN` describe el pasado, no autoriza el futuro.
--
-- Una operacion nueva anotada asi entra la primera vez y despues es
-- IRRECUPERABLE: su reintento legitimo no puede probar nada y falla cerrado
-- para siempre. La aplicacion ya lo rechaza, pero la aplicacion no es el
-- ultimo guardian de una tabla de dinero.
create or replace function public.driver_finance_origen_legado_no()
returns trigger
language plpgsql
as $legado$
begin
  if new.source_type = 'LEGACY_UNKNOWN' then
    raise exception 'DRIVER_FINANCE_LEGACY_SOURCE_NOT_ALLOWED'
      using detail = 'LEGACY_UNKNOWN solo describe testigos migrados de origen desconocido; '
                     'una operacion nueva tiene que declarar su origen real';
  end if;
  return new;
end
$legado$;

-- Solo en INSERT: el relleno de mas arriba es un UPDATE, asi que reaplicar la
-- migracion sobre una base ya migrada sigue convergiendo sin tropezar consigo
-- misma.
drop trigger if exists driver_finance_origen_legado_trg on public.driver_money_operations;
create trigger driver_finance_origen_legado_trg
  before insert on public.driver_money_operations
  for each row execute function public.driver_finance_origen_legado_no();

-- ---------------------------------------------------------------------
-- Invariantes de estado. Se declaran de forma idempotente: se retira la
-- version anterior y se pone la vigente, para que reaplicar la migracion
-- sobre una base ya migrada converja siempre al mismo esquema.
-- ---------------------------------------------------------------------
do $invariantes$
begin
  -- El ciclo de vida de una reserva. `SETTLEMENT_PENDING` es el estado que
  -- faltaba: una carrera COMPLETADA cuya liquidacion no llego a ocurrir NO
  -- puede terminalizarse como liberada, porque entonces la comision y la
  -- ganancia del conductor quedan irrecuperables para siempre. Se queda aqui,
  -- visible y reintentable, hasta que se liquide de verdad.
  alter table public.driver_commission_reservations
    drop constraint if exists driver_commission_reservations_status_check;
  alter table public.driver_commission_reservations
    add constraint driver_commission_reservations_status_check
    check (status in ('RESERVED', 'SETTLEMENT_PENDING', 'SETTLED', 'RELEASED'));

  -- Una reserva liquidada reparte EXACTAMENTE lo que reservo.
  alter table public.driver_commission_reservations
    drop constraint if exists driver_commission_reservations_settled_cuadra;
  alter table public.driver_commission_reservations
    add constraint driver_commission_reservations_settled_cuadra
    check (status <> 'SETTLED' or round(applied_usd + deferred_usd, 2) = round(reserved_usd, 2));

  -- Una liberada no reparte nada: la carrera no llego a existir.
  alter table public.driver_commission_reservations
    drop constraint if exists driver_commission_reservations_released_en_cero;
  alter table public.driver_commission_reservations
    add constraint driver_commission_reservations_released_en_cero
    check (status <> 'RELEASED' or (applied_usd = 0 and deferred_usd = 0 and deferred_paid_usd = 0));

  -- Sin resolver si y solo si sigue viva o pendiente de liquidar: el estado y
  -- la fecha no pueden mentirse.
  alter table public.driver_commission_reservations
    drop constraint if exists driver_commission_reservations_resuelta_coherente;
  alter table public.driver_commission_reservations
    add constraint driver_commission_reservations_resuelta_coherente
    check ((status in ('RESERVED', 'SETTLEMENT_PENDING')) = (resolved_at is null));

  -- No se puede cobrar mas deuda de la que se difirio.
  alter table public.driver_commission_reservations
    drop constraint if exists driver_commission_reservations_cobrado_acotado;
  alter table public.driver_commission_reservations
    add constraint driver_commission_reservations_cobrado_acotado
    check (deferred_paid_usd <= deferred_usd);

  -- Pagada exige constancia: cuando, y con que apunte del libro.
  alter table public.driver_maintenance_obligations
    drop constraint if exists driver_maintenance_obligations_pagada_con_prueba;
  alter table public.driver_maintenance_obligations
    add constraint driver_maintenance_obligations_pagada_con_prueba
    check ((status = 'PAID') = (paid_at is not null and transaction_id is not null));

  -- Y ese apunte tiene que EXISTIR de verdad en el libro.
  if not exists (select 1 from pg_constraint where conname = 'driver_maintenance_obligations_transaction_fk') then
    alter table public.driver_maintenance_obligations
      add constraint driver_maintenance_obligations_transaction_fk
      foreign key (transaction_id) references public.transactions(id)
      on delete no action deferrable initially deferred;
  end if;

  -- EL SUELO DE DEUDA, declarado por la base y no solo por el codigo. Es
  -- defensa en profundidad: aunque un camino nuevo se olvidara de aplicarlo,
  -- la escritura seria rechazada en vez de hundir a alguien.
  --
  -- Antes de declararlo hay que reconocer a quien YA venia por debajo: en una
  -- base que se actualiza desde el esquema anterior puede haber conductores
  -- con mas deuda de la que el suelo permite. Marcarlos exentos no les cambia
  -- ni un centimo -no se toca ningun saldo- y evita que la actualizacion
  -- fracase por una deuda que la plataforma ya les habia permitido.
  update public.driver_finance_state
     set floor_exempt = true
   where floor_exempt = false and wallet_balance_usd < -5.00;

  alter table public.driver_finance_state
    drop constraint if exists driver_finance_state_suelo;
  alter table public.driver_finance_state
    add constraint driver_finance_state_suelo
    check (floor_exempt or wallet_balance_usd >= -5.00);

  -- El origen de una operacion es de un juego cerrado. `LEGACY_UNKNOWN` esta
  -- ahi para lo que ya existiera antes de esta ronda, y el codigo lo trata
  -- como no verificable: nunca autoriza un duplicado.
  alter table public.driver_money_operations
    drop constraint if exists driver_money_operations_origen;
  alter table public.driver_money_operations
    add constraint driver_money_operations_origen
    check (source_type in ('TOPUP', 'PAYOUT', 'WITHDRAWAL', 'ADMIN_ADJUSTMENT', 'LEGACY_UNKNOWN'));

  -- Y el IDENTIFICADOR del origen tiene que decir algo.
  --
  -- La octava auditoria acredito la misma recarga dos veces usando dos cadenas
  -- de espacios distintas —`' '` y `'   '`—: las dos pasaban `not null`, las
  -- dos eran claves DISTINTAS del indice unico, y ninguna identificaba nada.
  -- Saldo 1.00 -> 3.00 -> 5.00.
  --
  -- `not null` no basta: una cadena vacia o de solo espacios es la AUSENCIA de
  -- una identidad disfrazada de identidad. Los testigos migrados no se ven
  -- afectados: su `source_id` es su propio `operation_id`, que nunca esta en
  -- blanco.
  --
  -- Se exige que haya al menos un caracter que NO sea espacio en blanco, y se
  -- comprueba con `\S` a proposito: `btrim` sin argumentos solo recorta
  -- espacios, asi que un `source_id` de un tabulador o un salto de linea lo
  -- habria pasado tranquilamente. `\S` cubre todo el blanco, igual que el
  -- `trim` de la aplicacion.
  alter table public.driver_money_operations
    drop constraint if exists driver_money_operations_origen_no_vacio;
  alter table public.driver_money_operations
    add constraint driver_money_operations_origen_no_vacio
    check (source_type ~ '\S' and source_id ~ '\S');

  -- Un aviso entregado no puede serlo antes de reclamarse.
  alter table public.driver_inactivity_warnings
    drop constraint if exists driver_inactivity_warnings_entrega_posterior;
  alter table public.driver_inactivity_warnings
    add constraint driver_inactivity_warnings_entrega_posterior
    check (delivered_at is null or delivered_at >= claimed_at);
end
$invariantes$;

-- ---------------------------------------------------------------------
-- Indices de las consultas de ejecucion (ninguno sobre importes).
-- ---------------------------------------------------------------------
create index if not exists driver_commission_reservations_driver_idx
  on public.driver_commission_reservations (driver_id, status);

-- La consulta del reconciliador: solo lo que sigue sin resolver.
drop index if exists driver_commission_reservations_vivas_idx;
create index if not exists driver_commission_reservations_sin_resolver_idx
  on public.driver_commission_reservations (created_at)
  where status in ('RESERVED', 'SETTLEMENT_PENDING');

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
-- Cualquier escritura del documento de un conductor --venga de donde venga,
-- incluida una replica con una copia de hace diez minutos-- sale de aqui con
-- los campos de dinero reestampados desde las tablas autoritativas. El
-- documento conserva los campos por compatibilidad con toda la aplicacion
-- (pantallas, informes, sockets), pero como CACHE.
--
-- Permanece inerte para quien no tiene fila en `driver_finance_state`: sin
-- ella, el comportamiento historico no cambia en absoluto.
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

  -- El bloqueo se escribe SIEMPRE, en los dos sentidos. Antes solo se escribia
  -- cuando la fila decia «bloqueado» o «desbloqueado alguna vez»; una fila que
  -- nunca estuvo bloqueada dejaba pasar intacto un `financialBlock.active=true`
  -- inyectado por un documento obsoleto, y la cache mentia contra la autoridad.
  if estado.block_active then
    bloqueo = jsonb_build_object(
      'active', true,
      'reason', estado.block_reason,
      'since', to_char(estado.block_since at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  else
    bloqueo = jsonb_build_object('active', false);
    if estado.block_cleared_at is not null then
      bloqueo = bloqueo || jsonb_build_object(
        'clearedAt', to_char(estado.block_cleared_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
  end if;
  new.payload = jsonb_set(new.payload, '{financialBlock}', bloqueo, true);

  return new;
end
$proyeccion$;

drop trigger if exists driver_finance_project_trg on public.users;
create trigger driver_finance_project_trg
  before insert or update on public.users
  for each row execute function public.driver_finance_project();

-- ---------------------------------------------------------------------
-- El DUENO de una carrera liquidada ya no cambia. Lo impide la base.
-- ---------------------------------------------------------------------
-- La septima auditoria encontro la ultima grieta de la propiedad: la
-- liquidacion comprueba, con los cerrojos en la mano, que la reserva Y el
-- viaje son del conductor al que va a cobrar. Eso es cierto mientras la
-- transaccion vive — y deja de serlo un instante despues.
--
-- Su reproduccion fue exacta: una reasignacion generica del viaje esperando
-- detras del cerrojo, que entra en cuanto la liquidacion confirma. Resultado:
--
--   reserva  SETTLED  -> conductor A   (a quien se le cobro la comision)
--   viaje    asignado -> conductor B
--
-- La comision se la come A y la carrera figura de B. Ninguna comprobacion
-- dentro de la liquidacion puede evitarlo, porque el dano ocurre DESPUES.
--
-- Por eso el invariante vive aqui, donde ninguna escritura puede rodearlo: ni
-- una reasignacion futura, ni un `persistRecord` obsoleto, ni una replica con
-- una copia vieja del documento. Es la misma leccion que la proyeccion —el
-- documento no es la autoridad—, aplicada a la propiedad en vez de al saldo.
--
-- Solo se opone a lo que de verdad rompe la contabilidad: cambiar de conductor
-- una carrera cuyo dinero YA es de alguien. Reasignar antes de que exista ese
-- compromiso sigue siendo perfectamente legitimo, y el producto de hoy ni
-- siquiera lo hace.
--
-- Y son DOS estados, no uno. La octava auditoria encontro que el guardia solo
-- miraba `SETTLED`:
--
--   SETTLED             la comision ya se cobro a ese conductor
--   SETTLEMENT_PENDING  la carrera esta HECHA y su dinero se debe todavia
--
-- El segundo es igual de vinculante: es una obligacion recuperable con dueno.
-- Cambiarle la carrera de conductor dejaria al reconciliador cobrandole a A el
-- viaje que ahora es de B — o dejando esa deuda sin nadie. `RESERVED` no entra:
-- una carrera reservada y aun no hecha se puede reasignar sin que el dinero
-- haya cambiado de manos, y la reserva se libera.
do $dueno$
begin
  if to_regclass('public.trips') is null then
    return;
  end if;

  create or replace function public.driver_finance_dueno_liquidado()
  returns trigger
  language plpgsql
  as $guardia$
  declare
    dueno_nuevo text;
    dueno_viejo text;
    dueno_comprometido text;
    estado_comprometido text;
  begin
    dueno_nuevo := nullif(new.payload->>'driverId', '');
    dueno_viejo := nullif(old.payload->>'driverId', '');
    -- Que no cambie el dueno es el caso normal: ni se consulta nada.
    if dueno_nuevo is not distinct from dueno_viejo then
      return new;
    end if;
    select r.driver_id, r.status into dueno_comprometido, estado_comprometido
      from public.driver_commission_reservations r
     where r.trip_id = new.id and r.status in ('SETTLED', 'SETTLEMENT_PENDING');
    if dueno_comprometido is not null and dueno_comprometido is distinct from dueno_nuevo then
      raise exception 'DRIVER_FINANCE_TRIP_OWNER_SETTLED'
        using detail = 'el dinero de esta carrera ya es de su conductor (' || estado_comprometido
                       || '): cambiarle el dueno dejaria la comision de uno y la carrera de otro';
    end if;
    return new;
  end
  $guardia$;

  drop trigger if exists driver_finance_dueno_liquidado_trg on public.trips;
  create trigger driver_finance_dueno_liquidado_trg
    before update on public.trips
    for each row execute function public.driver_finance_dueno_liquidado();
end
$dueno$;

-- ---------------------------------------------------------------------
-- Cierre de acceso, igual que el resto del esquema.
-- ---------------------------------------------------------------------
alter table public.driver_commission_reservations enable row level security;
alter table public.driver_maintenance_obligations enable row level security;
alter table public.driver_finance_state enable row level security;
alter table public.driver_inactivity_warnings enable row level security;
alter table public.driver_money_operations enable row level security;

revoke all on public.driver_commission_reservations from anon, authenticated;
revoke all on public.driver_maintenance_obligations from anon, authenticated;
revoke all on public.driver_finance_state from anon, authenticated;
revoke all on public.driver_inactivity_warnings from anon, authenticated;
revoke all on public.driver_money_operations from anon, authenticated;
