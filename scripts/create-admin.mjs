// Crea (o actualiza la contraseña de) un usuario admin. Necesario para poder
// iniciar sesión la primera vez, ya que no hay pantalla de registro pública
// a propósito — los usuarios solo los crea un admin desde Configuración.
//
// Uso:  node --env-file=.env.local scripts/create-admin.mjs correo@ejemplo.com "una-contraseña-larga"
import { scrypt as scryptCallback, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { connectWithRetry } from "./lib/connect-with-retry.mjs";

const scrypt = promisify(scryptCallback);

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('Uso: node --env-file=.env.local scripts/create-admin.mjs correo@ejemplo.com "contraseña"');
  process.exit(1);
}
if (password.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta la variable de entorno DATABASE_URL.");
  process.exit(1);
}

async function hashPassword(plain) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(plain, salt, 64);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

const sql = await connectWithRetry(url);
const passwordHash = await hashPassword(password);
const normalizedEmail = email.trim().toLowerCase();

const [row] = await sql`
  INSERT INTO users (email, password_hash, role) VALUES (${normalizedEmail}, ${passwordHash}, 'admin')
  ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
  RETURNING id, email, role
`;

console.log(`Listo: admin "${row.email}" (id ${row.id}) puede iniciar sesión ya.`);
await sql.end();
