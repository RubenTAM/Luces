import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { lamps } from "../../../../db/schema";
import { getSession } from "../../../../lib/auth";

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }

  const { id } = await params;
  const lampId = Number(id);
  if (!Number.isInteger(lampId)) {
    return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  }

  let body: { name?: string; tagMode?: string; tagStatus?: string; tagCommand?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const updates: Partial<typeof lamps.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.tagMode !== undefined) updates.tagMode = body.tagMode.trim();
  if (body.tagStatus !== undefined) updates.tagStatus = body.tagStatus.trim();
  if (body.tagCommand !== undefined) updates.tagCommand = body.tagCommand.trim();

  if (Object.values(updates).some((value) => value === "")) {
    return NextResponse.json({ error: "Ningún campo puede quedar vacío." }, { status: 400 });
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No mandaste ningún cambio." }, { status: 400 });
  }

  const db = getDb();
  const [updated] = await db.update(lamps).set(updates).where(eq(lamps.id, lampId)).returning();
  if (!updated) {
    return NextResponse.json({ error: "No encontré esa lámpara." }, { status: 404 });
  }
  return NextResponse.json({ lamp: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }

  const { id } = await params;
  const lampId = Number(id);
  if (!Number.isInteger(lampId)) {
    return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  }

  const db = getDb();
  await db.delete(lamps).where(eq(lamps.id, lampId));
  return NextResponse.json({ ok: true });
}
