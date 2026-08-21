"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";

type UserRow = { id: number; email: string; name: string | null; role: "admin" | "soporte"; createdAt: string | Date };
type LampRow = {
  id: number;
  position: number;
  name: string;
  tagMode: string;
  tagStatus: string;
  tagCommand: string;
};

type Tab = "dispositivos" | "usuarios" | "visualizacion";

const PAGE_SIZE = 6;

// Mismos íconos que en app/LampDashboard.tsx — se duplican aquí (nada más
// los que usa el sidebar) para que el menú se vea idéntico entre Dashboard y
// Configuración sin tener que sacar un archivo compartido ahorita.
type SidebarIconName = "home" | "settings" | "history" | "headset";

function SidebarIcon({ name, size = 20 }: { name: SidebarIconName; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<SidebarIconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3h4v.08A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z" /></>,
    history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2Zm16 0h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2Z" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...common}>{paths[name]}</svg>;
}

function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

function displayName(user: UserRow) {
  return user.name?.trim() || user.email.split("@")[0];
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
          <button type="button" onClick={() => router.push("/")}>
            <SidebarIcon name="home" />Dashboard
          </button>
          <span className="nav-section">Sistema</span>
          <button className="active" type="button">
            <SidebarIcon name="settings" />Configuración
          </button>
          <button type="button">
            <SidebarIcon name="history" />Historial
          </button>
        </nav>
        <div className="sidebar-footer">
          <button type="button" onClick={handleLogout}>
            <SidebarIcon name="headset" />Cerrar sesión
          </button>
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
            Dispositivos
          </button>
          <button
            type="button"
            className={`config-tab ${tab === "usuarios" ? "active" : ""}`}
            onClick={() => setTab("usuarios")}
          >
            Usuarios
          </button>
          <button
            type="button"
            className={`config-tab ${tab === "visualizacion" ? "active" : ""}`}
            onClick={() => setTab("visualizacion")}
          >
            Visualización
          </button>
        </nav>

        <div className="config-body">
          {tab === "dispositivos" && <LampsSection lamps={lamps} setLamps={setLamps} />}
          {tab === "usuarios" && (
            <UsersSection users={users} setUsers={setUsers} currentUserId={currentUserId} />
          )}
          {tab === "visualizacion" && (
            <div className="config-empty">Todavía no hay nada configurable aquí.</div>
          )}
        </div>
      </section>
    </main>
  );
}

// --- Paginación compartida ---------------------------------------------------

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior">
        ‹
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={n === page ? "active" : ""}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Página siguiente">
        ›
      </button>
    </div>
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
  const [showAdd, setShowAdd] = useState(false);
  const [newLamp, setNewLamp] = useState({ position: "", name: "", tagMode: "", tagStatus: "", tagCommand: "" });
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);

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
      setShowAdd(false);
    } finally {
      setCreating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(lamps.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = lamps.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section className="config-section">
      <div className="section-toolbar">
        <div>
          <h2>Dispositivos (Lámparas)</h2>
          <p className="section-sub">Administra las lámparas conectadas al sistema.</p>
        </div>
        <button type="button" className="btn-add" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancelar" : "+ Agregar lámpara"}
        </button>
      </div>
      {error && <p className="config-error">{error}</p>}

      <div className="lamp-grid">
        {showAdd && (
          <form className="lamp-card lamp-card-new" onSubmit={createLamp}>
            <div className="lamp-field">
              <label>No.</label>
              <input
                type="number"
                min={1}
                required
                value={newLamp.position}
                onChange={(e) => setNewLamp({ ...newLamp, position: e.target.value })}
              />
            </div>
            <div className="lamp-field">
              <label>Nombre</label>
              <input required value={newLamp.name} onChange={(e) => setNewLamp({ ...newLamp, name: e.target.value })} />
            </div>
            <div className="lamp-field">
              <label>Tag modo (AUTO/MAN)</label>
              <input
                required
                placeholder="p. ej. Auto_3"
                value={newLamp.tagMode}
                onChange={(e) => setNewLamp({ ...newLamp, tagMode: e.target.value })}
              />
            </div>
            <div className="lamp-field">
              <label>Tag estado real</label>
              <input
                required
                placeholder="p. ej. FB_Lamp3"
                value={newLamp.tagStatus}
                onChange={(e) => setNewLamp({ ...newLamp, tagStatus: e.target.value })}
              />
            </div>
            <div className="lamp-field">
              <label>Tag comando encender/apagar</label>
              <input
                required
                placeholder="p. ej. TurnOn_3"
                value={newLamp.tagCommand}
                onChange={(e) => setNewLamp({ ...newLamp, tagCommand: e.target.value })}
              />
            </div>
            <div className="lamp-card-actions">
              <button type="submit" className="config-btn primary" disabled={creating}>
                {creating ? "Agregando..." : "Agregar"}
              </button>
            </div>
          </form>
        )}

        {paged.map((lamp) => {
          const draft = draftFor(lamp);
          const dirty =
            draft.name !== lamp.name ||
            draft.tagMode !== lamp.tagMode ||
            draft.tagStatus !== lamp.tagStatus ||
            draft.tagCommand !== lamp.tagCommand;
          return (
            <div className="lamp-card" key={lamp.id}>
              <div className="lamp-card-head">
                <span className="lamp-card-no">No. {lamp.position}</span>
              </div>
              <input
                className="lamp-card-title"
                value={draft.name}
                onChange={(e) => updateDraft(lamp, "name", e.target.value)}
              />
              <div className="lamp-field">
                <label>Tag modo (AUTO/MAN)</label>
                <input value={draft.tagMode} onChange={(e) => updateDraft(lamp, "tagMode", e.target.value)} />
              </div>
              <div className="lamp-field">
                <label>Tag estado real</label>
                <input value={draft.tagStatus} onChange={(e) => updateDraft(lamp, "tagStatus", e.target.value)} />
              </div>
              <div className="lamp-field">
                <label>Tag comando encender/apagar</label>
                <input value={draft.tagCommand} onChange={(e) => updateDraft(lamp, "tagCommand", e.target.value)} />
              </div>
              <div className="lamp-card-actions">
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
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}

        {lamps.length === 0 && !showAdd && (
          <div className="config-empty">Todavía no hay lámparas configuradas.</div>
        )}
      </div>

      <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
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
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);
  const [newUser, setNewUser] = useState<{ name: string; email: string; password: string; role: "admin" | "soporte" }>({
    name: "",
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
      setNewUser({ name: "", email: "", password: "", role: "soporte" });
      setShowAdd(false);
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

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = users.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section className="config-section">
      <div className="section-toolbar">
        <div>
          <h2>Usuarios</h2>
          <p className="section-sub">Administra los usuarios que tienen acceso al sistema.</p>
        </div>
        <button type="button" className="btn-add" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancelar" : "+ Agregar usuario"}
        </button>
      </div>
      {error && <p className="config-error">{error}</p>}

      {showAdd && (
        <form className="config-new-row" onSubmit={createUser}>
          <label>
            <span>Nombre</span>
            <input required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
          </label>
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
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="config-table user-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Desde</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((user) => {
              const name = displayName(user);
              return (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <span className="user-avatar">{name.charAt(0).toUpperCase()}</span>
                      <div>
                        <div className="user-name">{name}</div>
                        <div className="user-email">{user.email}</div>
                      </div>
                    </div>
                  </td>
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
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "#7c8798", textAlign: "center", padding: "24px 20px" }}>
                  Todavía no hay usuarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
    </section>
  );
}
