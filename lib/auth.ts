import { cookies } from "next/headers";
import {
  type Role,
  type SessionPayload,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  encodeSession,
  decodeSession,
} from "./session";

export { hashPassword, verifyPassword, decodeSession, encodeSession, SESSION_COOKIE } from "./session";
export type { Role, SessionPayload } from "./session";

export async function createSessionCookie(user: { id: number; email: string; role: Role }) {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// Para usar en Server Components / Route Handlers (API). En middleware.ts se
// lee la cookie directo del request con lib/session.ts en vez de con
// next/headers (next/headers no está pensado para usarse en middleware).
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return decodeSession(token);
}
