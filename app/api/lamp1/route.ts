import { NextResponse } from "next/server";
import { getLamp1State, setLamp1Power, setLamp1Time } from "../../mqtt-client";

// Nunca cachear: siempre queremos el último estado reportado por el broker.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getLamp1State());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  // Forzar encendido/apagado manual (tag TurnOn_1).
  if (body.power === 0 || body.power === 1) {
    setLamp1Power(body.power === 1);
    return NextResponse.json({ ok: true });
  }

  if ((body.which === "on" || body.which === "off") && typeof body.time === "string") {
    if (!/^\d{2}:\d{2}$/.test(body.time)) {
      return NextResponse.json({ error: "Formato de hora inválido, se espera HH:MM" }, { status: 400 });
    }
    setLamp1Time(body.which, body.time);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
}
