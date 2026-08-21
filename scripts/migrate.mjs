// Aplica a mano los archivos .sql que ya generó "npm run db:generate" en
// ./drizzle — en vez de depender del comando "drizzle-kit migrate", que se
// está quedando mudo sin crear las tablas ni marcar error.
//
// Lleva registro de qué migraciones ya se aplicaron en la tabla
// "_luces_migrations", para no volver a correr archivos viejos cada vez que
// se agrega una migración nueva (eso tronaría con "relation already exists").
// Si de todos modos algo ya existía de antes (por ejemplo la primerísima vez
// que se corrió esto, antes de que existiera esta tabla de control), lo
// detecta por el código de error de Postgres, lo marca como aplicado, y
// sigue en vez de morir.
//
// Uso:  node --env-file=.env.local scripts/migrate.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { connectWithRetry } from "./lib/connect-with-retry.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta la variable de entorno DATABASE_URL.");
  process.exit(1);
}

const drizzleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const files = readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`No encontré archivos .sql en ${drizzleDir}. ¿Ya corriste "npm run db:generate"?`);
  process.exit(1);
}

const sql = await connectWithRetry(url);

await sql`
  CREATE TABLE IF NOT EXISTS _luces_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const appliedRows = await sql`SELECT filename FROM _luces_migrations`;
const applied = new Set(appliedRows.map((r) => r.filename));

// Códigos de Postgres para "ya existe": 42P07 = relación/tabla duplicada,
// 42701 = columna duplicada. Si el archivo truena con uno de estos, es que
// ya se había aplicado antes de que existiera esta tabla de control.
const ALREADY_EXISTS_CODES = new Set(["42P07", "42701"]);

let appliedCount = 0;
let skippedCount = 0;

for (const file of files) {
  if (applied.has(file)) {
    console.log(`Ya aplicada: ${file} (se salta).`);
    skippedCount++;
    continue;
  }

  console.log(`Aplicando ${file}...`);
  const content = readFileSync(path.join(drizzleDir, file), "utf8");
  try {
    await sql.unsafe(content);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
    if (code && ALREADY_EXISTS_CODES.has(code)) {
      console.log(`  (${file} parece que ya estaba aplicado desde antes — lo marco como listo y sigo)`);
    } else {
      throw err;
    }
  }

  await sql`INSERT INTO _luces_migrations (filename) VALUES (${file}) ON CONFLICT (filename) DO NOTHING`;
  appliedCount++;
}

console.log(
  `Listo: ${appliedCount} migración(es) nueva(s) aplicada(s), ${skippedCount} ya estaban al día (de ${files.length} en total).`
);

// Si esta corrida acaba de crear la tabla "plcs" (migración de multi-PLC),
// no hay ningún PLC dado de alta todavía y las lámparas que ya existían se
// quedaron sin plc_id. Para no dejar el sistema roto (lámparas sin PLC no
// se pueden controlar), se crea un PLC por defecto con los tópicos que ya
// se usaban antes de que existiera esto ("LOGO Planta 1"), y se le asignan
// las lámparas huérfanas. Si ya hay algún PLC dado de alta, no se toca nada.
const [plcsTableExists] = await sql`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'plcs'
  ) AS exists
`;

if (plcsTableExists.exists) {
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM plcs`;
  let defaultPlcId;
  if (count === 0) {
    const [inserted] = await sql`
      INSERT INTO plcs (name, status_topic, cmd_topic)
      VALUES ('LOGO Planta 1', 'logo/planta1/status', 'logo/planta1/cmd')
      RETURNING id
    `;
    defaultPlcId = inserted.id;
    console.log(`Creé el PLC por defecto "LOGO Planta 1" (id ${defaultPlcId}).`);
  } else {
    const [first] = await sql`SELECT id FROM plcs ORDER BY id ASC LIMIT 1`;
    defaultPlcId = first.id;
  }

  const backfilled = await sql`
    UPDATE lamps SET plc_id = ${defaultPlcId} WHERE plc_id IS NULL RETURNING id
  `;
  if (backfilled.length > 0) {
    console.log(`Asigné ${backfilled.length} lámpara(s) sin PLC a "LOGO Planta 1".`);
  }
}

await sql.end();
