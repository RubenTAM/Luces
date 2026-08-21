import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { plcs } from "../../../db/schema";
import { getSession } from "../../../lib/auth";
import { invalidateMqttConfigCache } from "../../mqtt-client";

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Solo un admin puede ver esto." }, { status: 403 });
  }
  const db = getDb();
  const list = await db.select().from(plcs).orderBy(asc(plcs.id));
  return NextResponse.json({ plcs: list });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }

  let body: { name?: string; statusTopic?: string; cmdTopic?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const name = body.name?.trim();
  const statusTopic = body.statusTopic?.trim();
  const cmdTopic = body.cmdTopic?.trim();

  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (!statusTopic) {
    return NextResponse.json({ error: "El tópico de status es obligatorio." }, { status: 400 });
  }
  if (!cmdTopic) {
    return NextResponse.json({ error: "El tópico de comando es obligatorio." }, { status: 400 });
  }

  const db = getDb();
  const [created] = await db.insert(plcs).values({ name, statusTopic, cmdTopic }).returning();
  invalidateMqttConfigCache();
  return NextResponse.json({ plc: created }, { status: 201 });
}
