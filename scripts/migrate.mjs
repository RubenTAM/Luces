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
await sql.end();
