import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Una instancia = una empresa. No hay tabla de "companies": el aislamiento
// entre empresas es que cada una tiene su propio servicio y su propia base
// de datos en DigitalOcean, no una columna compartida.

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // "admin" ve y edita Configuración (usuarios y lámparas). "soporte" opera
  // el dashboard igual que admin, pero no entra a Configuración.
  role: text("role", { enum: ["admin", "soporte"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lamps = pgTable("lamps", {
  id: serial("id").primaryKey(),
  // "No. Lámpara" que ve el admin en Configuración — único, define el
  // orden y es el número que ya se usa en las cards del dashboard.
  position: integer("position").notNull().unique(),
  name: text("name").notNull(),
  // Tag que reporta el modo (AUTO/MAN). Se escucha del broker.
  tagMode: text("tag_mode").notNull(),
  // Tag que reporta si está encendida de verdad. Se escucha del broker.
  tagStatus: text("tag_status").notNull(),
  // Tag para forzar encendido/apagado. Se escribe al broker.
  tagCommand: text("tag_command").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Lamp = typeof lamps.$inferSelect;
export type NewLamp = typeof lamps.$inferInsert;
