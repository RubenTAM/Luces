import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { getDb } from "../../db";
import { users, lamps } from "../../db/schema";
import { getSession } from "../../lib/auth";
import { ConfiguracionView } from "./ConfiguracionView";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  // El middleware ya garantiza que solo un admin llega hasta aquí.
  const session = await getSession();
  const db = getDb();

  const [userList, lampList] = await Promise.all([
    db
      .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
      .from(users)
      .orderBy(asc(users.id)),
    db.select().from(lamps).orderBy(asc(lamps.position)),
  ]);

  return (
    <ConfiguracionView
      initialUsers={userList}
      initialLamps={lampList}
      currentUserId={session!.userId}
    />
  );
}
