import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../db/schema";
import { getSession, hashPassword } from "../../../lib/auth";

// El middleware ya bloquea /api/users a quien no sea admin, pero se vuelve a
// checar aquí por si algún día se llama esta función desde otro lado.
async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Solo un admin puede ver esto." }, { status: 403 });
  }
  const db = getDb();
  const list = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.id));
  return NextResponse.json({ users: list });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }

  let body: { name?: string; email?: string; password?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const role = body.role;

  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "El correo no es válido." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  }
  if (role !== "admin" && role !== "soporte") {
    return NextResponse.json({ error: "El rol debe ser admin o soporte." }, { status: 400 });
  }

  const db = getDb();
  const passwordHash = await hashPassword(password);

  try {
    const [created] = await db
      .insert(users)
      .values({ name, email, passwordHash, role })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json({ error: "Ya existe un usuario con ese correo." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo crear el usuario." }, { status: 500 });
  }
}
