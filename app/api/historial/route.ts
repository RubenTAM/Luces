import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { lampEvents } from "../../../db/schema";
import { getSession } from "../../../lib/auth";

// Nunca cachear: siempre queremos la bitácora más reciente.
export const dynamic = "force-dynamic";

// Tope de renglones por consulta: la pantalla de Historial ya filtra por
// rango de fechas, pero si alguien pide un rango enorme no queremos mandar
// la tabla completa de una sola vez.
const MAX_ROWS = 500;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const lampIdParam = searchParams.get("lampId");

  const conditions = [];

  if (desde) {
    const date = new Date(desde);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "Fecha de inicio inválida." }, { status: 400 });
    }
    conditions.push(gte(lampEvents.createdAt, date));
  }

  if (hasta) {
    const date = new Date(hasta);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "Fecha de fin inválida." }, { status: 400 });
    }
    conditions.push(lte(lampEvents.createdAt, date));
  }

  if (lampIdParam) {
    const lampId = Number(lampIdParam);
    if (!Number.isInteger(lampId)) {
      return NextResponse.json({ error: "Lámpara inválida." }, { status: 400 });
    }
    conditions.push(eq(lampEvents.lampId, lampId));
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(lampEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(lampEvents.createdAt))
    .limit(MAX_ROWS);

  return NextResponse.json({ events: rows, truncated: rows.length === MAX_ROWS });
}

// Borra TODA la bitácora de eventos — nomás esa tabla (lamp_events), no
// toca lámparas, PLCs, usuarios ni nada más. Es para que Ruben pueda
// vaciarla de vez en cuando y no se vaya saturando. Solo un admin puede
// hacerlo (soporte puede ver el Historial pero no borrarlo) — el botón en
// la pantalla ya se esconde para soporte, pero esto lo exige también aquí
// por si acaso.
export async function DELETE() {
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Solo un admin puede hacer esto." }, { status: 403 });
  }

  const db = getDb();
  await db.delete(lampEvents);
  return NextResponse.json({ ok: true });
}
