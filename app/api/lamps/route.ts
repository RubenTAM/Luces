import { NextResponse } from "next/server";
import { getLampsState, setLampPower, setLampTime } from "../../mqtt-client";

// Nunca cachear: siempre queremos el último estado reportado por el broker.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getLampsState());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const lampId = Number(body?.lampId);

  if (!body || !Number.isInteger(lampId) || lampId < 1) {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  // Forzar encendido/apagado manual (tag TurnOn_N).
  if (body.power === 0 || body.power === 1) {
    setLampPower(lampId, body.power === 1);
    return NextResponse.json({ ok: true });
  }

  // Cambiar hora de encendido/apagado (tags HoraOnN / HoraOffN).
  if ((body.which === "on" || body.which === "off") && typeof body.time === "string") {
    if (!/^\d{2}:\d{2}$/.test(body.time)) {
      return NextResponse.json({ error: "Formato de hora inválido, se espera HH:MM" }, { status: 400 });
    }
    setLampTime(lampId, body.which, body.time);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
}
