import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { lamps, type Lamp } from "../../../../db/schema";
import { getSession } from "../../../../lib/auth";
import { invalidateMqttConfigCache } from "../../../mqtt-client";

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

// Misma regla que en /api/lamps-config (POST): dos lámparas del mismo PLC no
// pueden compartir una tag, porque el LOGO solo tiene una variable con ese
// nombre y ambas lámparas terminarían escribiéndole encima a la otra sin
// ningún error visible. Se repite aquí porque editar una lámpara (cambiarle
// una tag, o cambiarla de PLC) puede crear la misma colisión que crearla de
// cero.
function findTagCollision(
  siblings: Lamp[],
  candidate: { tagMode: string; tagStatus: string; tagCommand: string },
  excludeLampId?: number
): string | null {
  const candidateTags = [candidate.tagMode, candidate.tagStatus, candidate.tagCommand];
  for (const sibling of siblings) {
    if (excludeLampId !== undefined && sibling.id === excludeLampId) continue;
    const siblingTags = [sibling.tagMode, sibling.tagStatus, sibling.tagCommand];
    for (const tag of candidateTags) {
      if (siblingTags.includes(tag)) {
        return `La tag "${tag}" ya la está usando la lámpara No. ${sibling.position} (${sibling.name}) en este mismo PLC. Dos lámparas del mismo PLC no pueden compartir una tag — revisa que las 3 tags de cada una sean distintas.`;
      }
    }
  }
  return null;
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

  let body: { name?: string; plcId?: number; tagMode?: string; tagStatus?: string; tagCommand?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const updates: Partial<typeof lamps.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.plcId !== undefined) {
    const plcId = Number(body.plcId);
    if (!Number.isInteger(plcId)) {
      return NextResponse.json({ error: "PLC inválido." }, { status: 400 });
    }
    updates.plcId = plcId;
  }
  if (body.tagMode !== undefined) updates.tagMode = body.tagMode.trim();
  if (body.tagStatus !== undefined) updates.tagStatus = body.tagStatus.trim();
  if (body.tagCommand !== undefined) updates.tagCommand = body.tagCommand.trim();

  if (Object.entries(updates).some(([key, value]) => key !== "plcId" && value === "")) {
    return NextResponse.json({ error: "Ningún campo puede quedar vacío." }, { status: 400 });
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No mandaste ningún cambio." }, { status: 400 });
  }

  const db = getDb();
  let updated;
  try {
    const [existing] = await db.select().from(lamps).where(eq(lamps.id, lampId));
    if (!existing) {
      return NextResponse.json({ error: "No encontré esa lámpara." }, { status: 404 });
    }

    // Se arma el estado "final" combinando lo que ya tenía la lámpara con lo
    // que se está cambiando ahorita, porque updates solo trae los campos que
    // el admin realmente tocó — si por ejemplo solo cambia el nombre, hay
    // que seguir revisando la colisión contra sus tags actuales, no contra
    // campos vacíos.
    const finalPlcId = updates.plcId ?? existing.plcId;
    const finalTagMode = updates.tagMode ?? existing.tagMode;
    const finalTagStatus = updates.tagStatus ?? existing.tagStatus;
    const finalTagCommand = updates.tagCommand ?? existing.tagCommand;

    if (finalPlcId !== null) {
      const siblings = await db.select().from(lamps).where(eq(lamps.plcId, finalPlcId));
      const collision = findTagCollision(
        siblings,
        { tagMode: finalTagMode, tagStatus: finalTagStatus, tagCommand: finalTagCommand },
        lampId
      );
      if (collision) {
        return NextResponse.json({ error: collision }, { status: 409 });
      }
    }

    [updated] = await db.update(lamps).set(updates).where(eq(lamps.id, lampId)).returning();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("foreign key") || message.includes("violates")) {
      return NextResponse.json({ error: "Ese PLC no existe." }, { status: 400 });
    }
    throw err;
  }
  if (!updated) {
    return NextResponse.json({ error: "No encontré esa lámpara." }, { status: 404 });
  }
  invalidateMqttConfigCache();
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
  invalidateMqttConfigCache();
  return NextResponse.json({ ok: true });
}
