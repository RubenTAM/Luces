import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { lampEvents } from "../../../db/schema";

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
