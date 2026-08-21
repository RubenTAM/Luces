import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { getDb } from "../../db";
import { lamps } from "../../db/schema";
import { HistorialView } from "./HistorialView";

export const metadata: Metadata = { title: "Historial" };
export const dynamic = "force-dynamic";

export default async function HistorialPage() {
  // El middleware ya garantiza que solo alguien con sesión llega hasta acá
  // (a diferencia de Configuración, Historial lo puede ver tanto admin como
  // soporte). Solo se usa para llenar el filtro de "Lámpara" — los eventos
  // en sí se piden desde el cliente a /api/historial con los filtros que
  // elija cada quien.
  const db = getDb();
  const lampList = await db
    .select({ id: lamps.id, name: lamps.name, position: lamps.position })
    .from(lamps)
    .orderBy(asc(lamps.position));

  return <HistorialView initialLamps={lampList} />;
}
