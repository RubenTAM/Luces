import { NextResponse } from "next/server";
import { getLampsState, releaseLampForce, setLampPower, setLampSchedule } from "../../mqtt-client";

// Nunca cachear: siempre queremos el último estado reportado por el broker.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getLampsState());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const lampId = Number(body?.lampId);

  if (!body || !Number.isInteger(lampId) || lampId < 1) {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  // Forzar encendido/apagado manual (tag de comando). Saca la lámpara del
  // control del horario hasta que se libere.
  if (body.power === 0 || body.power === 1) {
    await setLampPower(lampId, body.power === 1);
    return NextResponse.json({ ok: true });
  }

  // Liberar el forzado manual y devolver el control al horario automático.
  if (body.release === true) {
    await releaseLampForce(lampId);
    return NextResponse.json({ ok: true });
  }

  // Cambiar hora de encendido/apagado. Ya no se le manda al LOGO: se guarda
  // en este servidor, que compara contra $logotime y publica el comando solo.
  if ((body.which === "on" || body.which === "off") && typeof body.time === "string") {
    if (!/^\d{2}:\d{2}$/.test(body.time)) {
      return NextResponse.json({ error: "Formato de hora inválido, se espera HH:MM" }, { status: 400 });
    }
    // "scope" distingue si se está editando el horario de lunes a viernes
    // (default, para no romper llamadas viejas que no lo mandan) o el de
    // sábado y domingo, capturado desde el ícono de lápiz de la tarjeta.
    const scope = body.scope === "weekend" ? "weekend" : "weekday";
    await setLampSchedule(lampId, body.which, body.time, scope);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
}
