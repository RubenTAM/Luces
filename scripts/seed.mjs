// Siembra las dos lámparas que ya están conectadas de verdad al LOGO, con
// sus tags reales. Se puede correr las veces que sea: si ya existen, no
// duplica nada (ON CONFLICT DO NOTHING sobre "position").
//
// Uso:  node --env-file=.env.local scripts/seed.mjs
import { connectWithRetry } from "./lib/connect-with-retry.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta la variable de entorno DATABASE_URL.");
  process.exit(1);
}

const sql = await connectWithRetry(url);

await sql`
  INSERT INTO lamps (position, name, tag_mode, tag_status, tag_command) VALUES
    (1, 'Lámpara 1', 'Auto_1', 'FB_Lamp1', 'TurnOn_1'),
    (2, 'Lámpara 2', 'Auto_2', 'FB_Lamp2', 'TurnOn_2')
  ON CONFLICT (position) DO NOTHING
`;

console.log("Listo: lámpara 1 y 2 sembradas (o ya existían).");
await sql.end();
