import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { getSession } from "../../../../lib/auth";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  }

  // Que un admin no se pueda eliminar a sí mismo evita que alguien se quede
  // sin poder entrar a Configuración por accidente.
  if (userId === session.userId) {
    return NextResponse.json({ error: "No puedes eliminar tu propio usuario." }, { status: 400 });
  }

  const db = getDb();
  await db.delete(users).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
