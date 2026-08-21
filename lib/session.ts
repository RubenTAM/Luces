// Sin imports de Next.js aquí a propósito: este archivo lo usa tanto
// middleware.ts (que corre en un runtime más restringido) como lib/auth.ts
// (que sí puede usar next/headers). Mantenerlo puro evita que algo de
// next/headers se cuele en el bundle del middleware.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export type Role = "admin" | "soporte";

export type SessionPayload = {
  userId: number;
  email: string;
  role: Role;
  // Epoch en segundos. Sesión de 30 días.
  exp: number;
};

export const SESSION_COOKIE = "luces_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Agrégala a .env.local (desarrollo) o a las variables de entorno de la app en DigitalOcean (producción).`
    );
  }
  return value;
}

// --- Contraseñas -----------------------------------------------------------
// scrypt (nativo de Node, sin dependencias nuevas) con una sal aleatoria por
// contraseña. Formato guardado en password_hash: "sal_hex:hash_hex".

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// --- Sesión (cookie firmada) -------------------------------------------------
// Nada de librerías de sesiones: un JWT casero pero simple — payload en
// base64url + firma HMAC-SHA256 con SESSION_SECRET. Sin tabla de sesiones en
// la base: cerrar sesión en todos lados a la vez requeriría rotar
// SESSION_SECRET, pero para el tamaño de esta app no hace falta más.

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function sign(payloadB64: string): string {
  const secret = requiredEnv("SESSION_SECRET");
  return base64url(createHmac("sha256", secret).update(payloadB64).digest());
}

export function encodeSession(payload: SessionPayload): string {
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function decodeSession(token: string): SessionPayload | null {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const expectedSignature = sign(payloadB64);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
