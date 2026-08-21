import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { plcs } from "../../../../db/schema";
import { getSession } from "../../../../lib/auth";
import { invalidateMqttConfigCache } from "../../../mqtt-client";

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }

  const { id } = await params;
  const plcId = Number(id);
  if (!Number.isInteger(plcId)) {
    return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  }

  let body: { name?: string; statusTopic?: string; cmdTopic?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const updates: Partial<typeof plcs.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.statusTopic !== undefined) updates.statusTopic = body.statusTopic.trim();
  if (body.cmdTopic !== undefined) updates.cmdTopic = body.cmdTopic.trim();

  if (Object.values(updates).some((value) => value === "")) {
    return NextResponse.json({ error: "Ningún campo puede quedar vacío." }, { status: 400 });
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No mandaste ningún cambio." }, { status: 400 });
  }

  const db = getDb();
  const [updated] = await db.update(plcs).set(updates).where(eq(plcs.id, plcId)).returning();
  if (!updated) {
    return NextResponse.json({ error: "No encontré ese PLC." }, { status: 404 });
  }
  invalidateMqttConfigCache();
  return NextResponse.json({ plc: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }

  const { id } = await params;
  const plcId = Number(id);
  if (!Number.isInteger(plcId)) {
    return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  }

  const db = getDb();
  try {
    await db.delete(plcs).where(eq(plcs.id, plcId));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("foreign key") || message.includes("violates")) {
      return NextResponse.json(
        { error: "No puedes quitar este PLC mientras tenga lámparas asignadas. Cámbialas de PLC o elimínalas primero." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "No se pudo quitar el PLC." }, { status: 500 });
  }
  invalidateMqttConfigCache();
  return NextResponse.json({ ok: true });
}
