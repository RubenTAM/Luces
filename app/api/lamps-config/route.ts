import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { lamps } from "../../../db/schema";
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
  const list = await db.select().from(lamps).orderBy(asc(lamps.position));
  return NextResponse.json({ lamps: list });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }

  let body: {
    position?: number;
    name?: string;
    plcId?: number;
    tagMode?: string;
    tagStatus?: string;
    tagCommand?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const position = Number(body.position);
  const name = body.name?.trim();
  const plcId = Number(body.plcId);
  const tagMode = body.tagMode?.trim();
  const tagStatus = body.tagStatus?.trim();
  const tagCommand = body.tagCommand?.trim();

  if (!Number.isInteger(position) || position < 1) {
    return NextResponse.json({ error: "El No. de lámpara debe ser un entero positivo." }, { status: 400 });
  }
  if (!Number.isInteger(plcId)) {
    return NextResponse.json({ error: "Falta elegir a cuál PLC pertenece la lámpara." }, { status: 400 });
  }
  if (!name || !tagMode || !tagStatus || !tagCommand) {
    return NextResponse.json({ error: "Faltan campos: nombre y las tres tags son obligatorios." }, { status: 400 });
  }

  const db = getDb();
  try {
    const [created] = await db
      .insert(lamps)
      .values({ position, name, plcId, tagMode, tagStatus, tagCommand })
      .returning();
    invalidateMqttConfigCache();
    return NextResponse.json({ lamp: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json({ error: `Ya existe una lámpara con el No. ${position}.` }, { status: 409 });
    }
    if (message.includes("foreign key") || message.includes("violates")) {
      return NextResponse.json({ error: "Ese PLC no existe." }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo crear la lámpara." }, { status: 500 });
  }
}
