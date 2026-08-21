import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// La app corre en DigitalOcean App Platform (Node normal vía `next start`),
// no en Cloudflare Workers — así que aquí ya no hay bindings, solo una
// conexión Postgres normal por DATABASE_URL. Se reusa la misma conexión
// entre requests (guardada en globalThis) para no abrir una nueva por
// cada llamada, igual que ya se hace con el cliente MQTT.
declare global {
  // eslint-disable-next-line no-var
  var __lucesSql: ReturnType<typeof postgres> | undefined;
}

function getConnection() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta la variable de entorno DATABASE_URL. Defínela en .env.local (desarrollo) o en las variables de entorno de la app en DigitalOcean (producción)."
    );
  }
  if (!globalThis.__lucesSql) {
    globalThis.__lucesSql = postgres(url, { max: 5 });
  }
  return globalThis.__lucesSql;
}

export function getDb() {
  return drizzle(getConnection(), { schema });
}
