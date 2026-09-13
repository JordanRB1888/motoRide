/**
 * Mira qué hay REALMENTE en la base antes de escribir una sola fila.
 *
 * El encargo lo pedía en estos términos: verificar el esquema real y, si algo no
 * coincide, reportarlo en vez de alterarlo por mi cuenta. Este guion no escribe
 * nada — ni una tabla, ni una columna, ni un permiso. Sólo lee el catálogo y
 * compara contra `lib/datos/esquema.sql`.
 *
 *   node scripts/verificar-esquema.mjs
 *
 * NO IMPRIME LA CADENA DE CONEXIÓN. Del servidor sólo enseña lo que hace falta
 * para saber que se ha conectado al sitio correcto: el puerto, si el anfitrión
 * es el pooler, y el nombre de la base. Ni usuario, ni contraseña, ni el
 * identificador del proyecto.
 */
import pg from "pg";
import { cargarEnvLocal, conexion } from "./comun.mjs";

const { Pool } = pg;

cargarEnvLocal();

const URL_BASE = process.env.WEB_DATABASE_URL;
if (!URL_BASE) {
  console.error(
    "Falta WEB_DATABASE_URL.\n" +
      "Ponla en web/.env.local (ignorado por git) o en el entorno de esta terminal.",
  );
  process.exit(2);
}

/** Lo que `lib/datos/esquema.sql` declara. */
const ESPERADO = {
  lista_de_espera: [
    "id",
    "email",
    "rol",
    "zona",
    "estado",
    "token_confirmacion",
    "token_expira_en",
    "token_baja",
    "confirmado_en",
    "baja_en",
    "origen",
    "ip_hash",
    "creado_en",
    "actualizado_en",
  ],
  contactos_aliados: [
    "id",
    "nombre",
    "negocio",
    "telefono",
    "email",
    "municipio",
    "tipo_comercio",
    "mensaje",
    "consentimiento_en",
    "estado",
    "ip_hash",
    "creado_en",
  ],
  intentos_web: ["clave", "ventana", "n", "ultimo_en"],
};

function describirSinSecretos(cadena) {
  try {
    const u = new URL(cadena);
    const anfitrion = u.hostname;
    const pooler = anfitrion.endsWith("pooler.supabase.com");
    return {
      anfitrion: pooler ? "***.pooler.supabase.com" : "***" + anfitrion.slice(-12),
      puerto: u.port || "(por defecto)",
      base: u.pathname.replace(/^\//, "") || "(por defecto)",
      pooler,
      modo: u.port === "6543" ? "transacción" : u.port === "5432" ? "sesión o directa" : "?",
      sslmode: u.searchParams.get("sslmode") ?? "(sin declarar)",
    };
  } catch {
    return null;
  }
}

async function conectar() {
  /* Verificado contra la CA anclada, sin red de seguridad. Antes esto probaba
     primero verificado y caía a no verificado si fallaba; eso estaba bien para
     AVERIGUAR qué certificado presentaba el servidor, y está mal ahora que ya se
     sabe: una comprobación que se apaga sola cuando falla no comprueba nada. */
  const pool = new Pool(conexion("verificacion"));
  const { rows } = await pool.query(
    "select version() as v, current_user as u, current_database() as d",
  );
  return { pool, etiqueta: "verificado contra la CA de Supabase", info: rows[0] };
}

const destino = describirSinSecretos(URL_BASE);
console.log("== Destino ==");
if (destino) {
  console.log(`   anfitrión : ${destino.anfitrion}`);
  console.log(`   puerto    : ${destino.puerto}  → ${destino.modo}`);
  console.log(`   base      : ${destino.base}`);
  console.log(`   sslmode   : ${destino.sslmode}`);
  if (!destino.pooler) {
    console.log("   AVISO: el anfitrión no parece el pooler de Supabase.");
  }
  if (destino.puerto !== "6543") {
    console.log("   AVISO: el Transaction Pooler es el 6543. Este no lo es.");
  }
} else {
  console.log("   La cadena no tiene forma de URL; se intentará igualmente.");
}

const { pool, etiqueta, info } = await conectar();
console.log(`   TLS       : ${etiqueta}`);
console.log(`   servidor  : ${String(info.v).split(" ").slice(0, 2).join(" ")}`);
console.log(`   rol       : ${info.u}`);
console.log(`   base real : ${info.d}`);

let problemas = 0;
const aviso = (texto) => {
  problemas += 1;
  console.log(`   ❌ ${texto}`);
};

console.log("\n== Tablas en el esquema public ==");
const { rows: tablas } = await pool.query(
  `select c.relname as tabla, c.relrowsecurity as rls,
          (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas,
          (select count(*) from pg_class ci join pg_index i on i.indexrelid = ci.oid where i.indrelid = c.oid) as indices
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname`,
);
for (const t of tablas) {
  console.log(`   ${t.tabla.padEnd(22)} RLS=${t.rls ? "sí" : "NO"}  políticas=${t.politicas}  índices=${t.indices}`);
}

console.log("\n== Columnas ==");
for (const [tabla, columnasEsperadas] of Object.entries(ESPERADO)) {
  const { rows } = await pool.query(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`,
    [tabla],
  );

  if (rows.length === 0) {
    console.log(`\n   ${tabla}: NO EXISTE`);
    if (tabla === "intentos_web") {
      console.log("      (es la tabla nueva del limitador; ver lib/datos/esquema.sql)");
    } else {
      aviso(`${tabla} no existe y debería`);
    }
    continue;
  }

  console.log(`\n   ${tabla}:`);
  for (const c of rows) {
    const nulo = c.is_nullable === "YES" ? "null" : "NOT NULL";
    const pordefecto = c.column_default ? ` = ${String(c.column_default).slice(0, 40)}` : "";
    console.log(`      ${c.column_name.padEnd(20)} ${c.data_type.padEnd(28)} ${nulo}${pordefecto}`);
  }

  const reales = rows.map((c) => c.column_name);
  const faltan = columnasEsperadas.filter((c) => !reales.includes(c));
  const sobran = reales.filter((c) => !columnasEsperadas.includes(c));
  if (faltan.length) aviso(`${tabla}: FALTAN columnas → ${faltan.join(", ")}`);
  if (sobran.length) console.log(`      (columnas de más, no molestan: ${sobran.join(", ")})`);
}

console.log("\n== Restricciones e índices ==");
const { rows: indices } = await pool.query(
  `select t.relname as tabla, i.relname as indice, ix.indisunique as unico,
          pg_get_indexdef(i.oid) as definicion
     from pg_index ix
     join pg_class i on i.oid = ix.indexrelid
     join pg_class t on t.oid = ix.indrelid
     join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = any($1)
    order by t.relname, i.relname`,
  [Object.keys(ESPERADO)],
);
for (const i of indices) {
  console.log(`   ${i.tabla}.${i.indice}${i.unico ? "  [ÚNICO]" : ""}`);
  console.log(`      ${i.definicion.replace(/^CREATE .*? ON /, "… ON ")}`);
}

/* El único índice del que depende la corrección —no el rendimiento— es este:
   sin un único sobre `email` exactamente, `ON CONFLICT (email)` ni siquiera
   compila, y el alta dejaría de ser idempotente. */
const unicoEmail = indices.some(
  (i) => i.tabla === "lista_de_espera" && i.unico && /\(email\)/.test(i.definicion),
);
if (!unicoEmail) {
  aviso("lista_de_espera: NO hay índice único sobre (email). El alta idempotente depende de él.");
} else {
  console.log("   ✅ lista_de_espera tiene único sobre (email): el alta puede ser idempotente.");
}

console.log("\n== Restricciones CHECK (qué valores admite cada estado) ==");
const { rows: checks } = await pool.query(
  `select rel.relname as tabla, con.conname as nombre, pg_get_constraintdef(con.oid) as definicion
     from pg_constraint con
     join pg_class rel on rel.oid = con.conrelid
     join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname = any($1) and con.contype = 'c'
    order by rel.relname, con.conname`,
  [Object.keys(ESPERADO)],
);
if (checks.length === 0) console.log("   (ninguna)");
for (const c of checks) console.log(`   ${c.tabla}.${c.nombre}: ${c.definicion}`);

console.log("\n== Permisos de los roles del navegador ==");
const { rows: permisos } = await pool.query(
  `select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as permisos
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = any($1)
      and grantee in ('anon', 'authenticated')
    group by table_name, grantee
    order by table_name, grantee`,
  [Object.keys(ESPERADO)],
);
if (permisos.length === 0) {
  console.log("   ✅ ni anon ni authenticated tienen permiso sobre estas tablas.");
} else {
  for (const p of permisos) aviso(`${p.table_name}: ${p.grantee} conserva ${p.permisos}`);
}

const { rows: rls } = await pool.query(
  `select c.relname as tabla, c.relrowsecurity as rls,
          (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any($1)`,
  [Object.keys(ESPERADO)],
);
for (const r of rls) {
  if (!r.rls) aviso(`${r.tabla}: RLS DESACTIVADO`);
  if (Number(r.politicas) > 0) {
    aviso(`${r.tabla}: tiene ${r.politicas} política(s). Se esperaba ninguna.`);
  }
}

console.log("\n== Filas actuales ==");
for (const tabla of Object.keys(ESPERADO)) {
  try {
    const { rows } = await pool.query(`select count(*)::int as n from public.${tabla}`);
    console.log(`   ${tabla.padEnd(22)} ${rows[0].n}`);
  } catch {
    console.log(`   ${tabla.padEnd(22)} (no existe)`);
  }
}

await pool.end();

console.log(
  problemas === 0
    ? "\n✅ El esquema real coincide con lo que espera la aplicación."
    : `\n❌ ${problemas} diferencia(s). No se ha tocado nada: hay que decidirlas una por una.`,
);
process.exit(problemas === 0 ? 0 : 1);
