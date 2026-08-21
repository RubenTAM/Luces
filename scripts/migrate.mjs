// Aplica a mano los archivos .sql que ya generó "npm run db:generate" en
// ./drizzle — en vez de depender del comando "drizzle-kit migrate", que se
// está quedando mudo sin crear las tablas ni marcar error.
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

for (const file of files) {
  console.log(`Aplicando ${file}...`);
  const content = readFileSync(path.join(drizzleDir, file), "utf8");
  await sql.unsafe(content);
}

console.log(`Listo: ${files.length} migración(es) aplicada(s). Tablas creadas.`);
await sql.end();
