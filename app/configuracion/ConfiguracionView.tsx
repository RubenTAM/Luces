"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";

type UserRow = { id: number; email: string; role: "admin" | "soporte"; createdAt: string | Date };
type LampRow = {
  id: number;
  position: number;
  name: string;
  tagMode: string;
  tagStatus: string;
  tagCommand: string;
};

type Tab = "dispositivos" | "visualizacion";

function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

export function ConfiguracionView({
  initialUsers,
  initialLamps,
  currentUserId,
}: {
  initialUsers: UserRow[];
  initialLamps: LampRow[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dispositivos");
  const [users, setUsers] = useState(initialUsers);
  const [lamps, setLamps] = useState(initialLamps);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="sip-shell">
      <aside className="sip-sidebar" aria-label="Navegación principal">
        <div className="sip-logo-box">
          <Image
            className="sip-logo-image"
            src="/sip-logo-cropped.png"
            alt="SIP Sistemas Inteligentes del Pacífico"
            width={320}
            height={143}
            priority
            unoptimized
          />
        </div>
        <nav className="sip-nav" aria-label="Sistema">
          <button type="button" onClick={() => router.push("/")}>Dashboard</button>
          <span className="nav-section">Sistema</span>
          <button className="active" type="button">Configuración</button>
        </nav>
        <div className="sidebar-footer">
          <button type="button" onClick={handleLogout}>Cerrar sesión</button>
          <span>Versión 1.0.0</span>
        </div>
      </aside>

      <section className="sip-main">
        <header className="config-header">
          <div>
            <h1>Configuración</h1>
            <p>Dispositivos, tags del broker y usuarios del sistema.</p>
          </div>
        </header>

        <nav className="config-tabs" aria-label="Secciones de configuración">
          <button
            type="button"
            className={`config-tab ${tab === "dispositivos" ? "active" : ""}`}
            onClick={() => setTab("dispositivos")}
          >
            Configuración de Dispositivos y Usuarios
          </button>
          <button
            type="button"
            className={`config-tab ${tab === "visualizacion" ? "active" : ""}`}
            onClick={() => setTab("visualizacion")}
          >
            Configuración de Visualización
          </button>
        </nav>

        <div className="config-body">
          {tab === "dispositivos" ? (
            <>
              <LampsSection lamps={lamps} setLamps={setLamps} />
              <UsersSection users={users} setUsers={setUsers} currentUserId={currentUserId} />
            </>
          ) : (
            <div className="config-empty">Todavía no hay nada configurable aquí.</div>
          )}
        </div>
      </section>
    </main>
  );
}

// --- Lámparas ----------------------------------------------------------------

function LampsSection({
  lamps,
  setLamps,
}: {
  lamps: LampRow[];
  setLamps: React.Dispatch<React.SetStateAction<LampRow[]>>;
}) {
  const [drafts, setDrafts] = useState<Record<number, Omit<LampRow, "id" | "position">>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLamp, setNewLamp] = useState({ position: "", name: "", tagMode: "", tagStatus: "", tagCommand: "" });
  const [creating, setCreating] = useState(false);

  function draftFor(lamp: LampRow) {
    return drafts[lamp.id] ?? { name: lamp.name, tagMode: lamp.tagMode, tagStatus: lamp.tagStatus, tagCommand: lamp.tagCommand };
  }

  function updateDraft(lamp: LampRow, field: keyof Omit<LampRow, "id" | "position">, value: string) {
    setDrafts((current) => ({ ...current, [lamp.id]: { ...draftFor(lamp), [field]: value } }));
  }

  async function saveLamp(lamp: LampRow) {
    setError(null);
    setSavingId(lamp.id);
    try {
      const response = await fetch(`/api/lamps-config/${lamp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftFor(lamp)),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo guardar la lámpara.");
        return;
      }
      setLamps((current) => current.map((item) => (item.id === lamp.id ? data.lamp : item)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[lamp.id];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  }

  async function deleteLamp(lamp: LampRow) {
    if (!confirm(`¿Quitar la lámpara ${lamp.position} (${lamp.name})? Dejará de controlarse desde el dashboard.`)) return;
    setError(null);
    setDeletingId(lamp.id);
    try {
      const response = await fetch(`/api/lamps-config/${lamp.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "No se pudo quitar la lámpara.");
        return;
      }
      setLamps((current) => current.filter((item) => item.id !== lamp.id));
    } finally {
      setDeletingId(null);
    }
  }

  async function createLamp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/lamps-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newLamp, position: Number(newLamp.position) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo agregar la lámpara.");
        return;
      }
      setLamps((current) => [...current, data.lamp].sort((a, b) => a.position - b.position));
      setNewLamp({ position: "", name: "", tagMode: "", tagStatus: "", tagCommand: "" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="config-section">
      <div className="config-section-head">
        <h2>Lámparas ({lamps.length})</h2>
      </div>
      {error && <p className="config-error">{error}</p>}
      <div style={{ overflowX: "auto" }}>
        <table className="config-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Nombre</th>
              <th>Tag modo (AUTO/MAN)</th>
              <th>Tag estado real</th>
              <th>Tag comando encender/apagar</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lamps.map((lamp) => {
              const draft = draftFor(lamp);
              const dirty =
                draft.name !== lamp.name ||
                draft.tagMode !== lamp.tagMode ||
                draft.tagStatus !== lamp.tagStatus ||
                draft.tagCommand !== lamp.tagCommand;
              return (
                <tr key={lamp.id}>
                  <td>{lamp.position}</td>
                  <td>
                    <input value={draft.name} onChange={(e) => updateDraft(lamp, "name", e.target.value)} />
                  </td>
                  <td>
                    <input value={draft.tagMode} onChange={(e) => updateDraft(lamp, "tagMode", e.target.value)} />
                  </td>
                  <td>
                    <input value={draft.tagStatus} onChange={(e) => updateDraft(lamp, "tagStatus", e.target.value)} />
                  </td>
                  <td>
                    <input value={draft.tagCommand} onChange={(e) => updateDraft(lamp, "tagCommand", e.target.value)} />
                  </td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="config-btn primary"
                      disabled={!dirty || savingId === lamp.id}
                      onClick={() => saveLamp(lamp)}
                    >
                      {savingId === lamp.id ? "Guardando..." : "Guardar"}
                    </button>
                    <button
                      type="button"
                      className="config-btn danger"
                      disabled={deletingId === lamp.id}
                      onClick={() => deleteLamp(lamp)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              );
            })}
            {lamps.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "#7c8798", textAlign: "center", padding: "24px 20px" }}>
                  Todavía no hay lámparas configuradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <form className="config-new-row" onSubmit={createLamp}>
        <label>
          <span>No.</span>
          <input
            type="number"
            min={1}
            required
            value={newLamp.position}
            onChange={(e) => setNewLamp({ ...newLamp, position: e.target.value })}
          />
        </label>
        <label>
          <span>Nombre</span>
          <input required value={newLamp.name} onChange={(e) => setNewLamp({ ...newLamp, name: e.target.value })} />
        </label>
        <label>
          <span>Tag modo</span>
          <input
            required
            placeholder="p. ej. Auto_3"
            value={newLamp.tagMode}
            onChange={(e) => setNewLamp({ ...newLamp, tagMode: e.target.value })}
          />
        </label>
        <label>
          <span>Tag estado</span>
          <input
            required
            placeholder="p. ej. FB_Lamp3"
            value={newLamp.tagStatus}
            onChange={(e) => setNewLamp({ ...newLamp, tagStatus: e.target.value })}
          />
        </label>
        <label>
          <span>Tag comando</span>
          <input
            required
            placeholder="p. ej. TurnOn_3"
            value={newLamp.tagCommand}
            onChange={(e) => setNewLamp({ ...newLamp, tagCommand: e.target.value })}
          />
        </label>
        <button type="submit" className="config-btn primary" disabled={creating}>
          {creating ? "Agregando..." : "Agregar lámpara"}
        </button>
      </form>
    </section>
  );
}

// --- Usuarios ------------------------------------------------------------

function UsersSection({
  users,
  setUsers,
  currentUserId,
}: {
  users: UserRow[];
  setUsers: React.Dispatch<React.SetStateAction<UserRow[]>>;
  currentUserId: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState<{ email: string; password: string; role: "admin" | "soporte" }>({
    email: "",
    password: "",
    role: "soporte",
  });

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo crear el usuario.");
        return;
      }
      setUsers((current) => [...current, data.user]);
      setNewUser({ email: "", password: "", role: "soporte" });
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(user: UserRow) {
    if (!confirm(`¿Eliminar a ${user.email}? Ya no va a poder entrar al sistema.`)) return;
    setError(null);
    setDeletingId(user.id);
    try {
      const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "No se pudo eliminar el usuario.");
        return;
      }
      setUsers((current) => current.filter((item) => item.id !== user.id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="config-section">
      <div className="config-section-head">
        <h2>Usuarios ({users.length})</h2>
      </div>
      {error && <p className="config-error">{error}</p>}
      <div style={{ overflowX: "auto" }}>
        <table className="config-table">
          <thead>
            <tr>
              <th>Correo</th>
              <th>Rol</th>
              <th>Desde</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>
                  <span className={`config-role-pill ${user.role}`}>{user.role === "admin" ? "Admin" : "Soporte"}</span>
                </td>
                <td>{formatDate(user.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="config-btn danger"
                    disabled={user.id === currentUserId || deletingId === user.id}
                    onClick={() => deleteUser(user)}
                    title={user.id === currentUserId ? "No puedes eliminar tu propio usuario" : undefined}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="config-new-row" onSubmit={createUser}>
        <label>
          <span>Correo</span>
          <input
            type="email"
            required
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
          />
        </label>
        <label>
          <span>Contraseña</span>
          <input
            type="password"
            required
            minLength={8}
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
          />
        </label>
        <label>
          <span>Rol</span>
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value as "admin" | "soporte" })}
            style={{ padding: "7px 9px", borderRadius: 7, border: "1px solid var(--line)", background: "#f6f9fd" }}
          >
            <option value="soporte">Soporte</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" className="config-btn primary" disabled={creating}>
          {creating ? "Creando..." : "Crear usuario"}
        </button>
      </form>
    </section>
  );
}
