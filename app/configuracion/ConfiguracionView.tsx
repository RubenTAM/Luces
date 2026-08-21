"use client";

import { useState } from "react";
import { Sidebar } from "../Sidebar";

type UserRow = { id: number; email: string; name: string | null; role: "admin" | "soporte"; createdAt: string | Date };
type PlcRow = { id: number; name: string; statusTopic: string; cmdTopic: string };
type LampRow = {
  id: number;
  position: number;
  name: string;
  plcId: number | null;
  tagMode: string;
  tagStatus: string;
  tagCommand: string;
};

type Tab = "dispositivos" | "usuarios" | "visualizacion";

const PAGE_SIZE = 6;

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
  initialPlcs,
  currentUserId,
}: {
  initialUsers: UserRow[];
  initialLamps: LampRow[];
  initialPlcs: PlcRow[];
  currentUserId: number;
}) {
  const [tab, setTab] = useState<Tab>("dispositivos");
  const [users, setUsers] = useState(initialUsers);
  const [lamps, setLamps] = useState(initialLamps);
  const [plcs, setPlcs] = useState(initialPlcs);

  return (
    <main className="sip-shell">
      <Sidebar active="configuracion" />

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
          {tab === "dispositivos" && (
            <>
              <PlcsSection plcs={plcs} setPlcs={setPlcs} />
              <LampsSection lamps={lamps} setLamps={setLamps} plcs={plcs} />
            </>
          )}
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

// --- PLCs (LOGO) ---------------------------------------------------------

function PlcsSection({
  plcs,
  setPlcs,
}: {
  plcs: PlcRow[];
  setPlcs: React.Dispatch<React.SetStateAction<PlcRow[]>>;
}) {
  const [drafts, setDrafts] = useState<Record<number, Omit<PlcRow, "id">>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newPlc, setNewPlc] = useState({ name: "", statusTopic: "", cmdTopic: "" });
  const [creating, setCreating] = useState(false);

  function draftFor(plc: PlcRow) {
    return drafts[plc.id] ?? { name: plc.name, statusTopic: plc.statusTopic, cmdTopic: plc.cmdTopic };
  }

  function updateDraft(plc: PlcRow, field: keyof Omit<PlcRow, "id">, value: string) {
    setDrafts((current) => ({ ...current, [plc.id]: { ...draftFor(plc), [field]: value } }));
  }

  async function savePlc(plc: PlcRow) {
    setError(null);
    setSavingId(plc.id);
    try {
      const response = await fetch(`/api/plcs/${plc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftFor(plc)),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo guardar el PLC.");
        return;
      }
      setPlcs((current) => current.map((item) => (item.id === plc.id ? data.plc : item)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[plc.id];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  }

  async function deletePlc(plc: PlcRow) {
    if (!confirm(`¿Quitar el PLC "${plc.name}"? Solo se puede si ninguna lámpara lo tiene asignado.`)) return;
    setError(null);
    setDeletingId(plc.id);
    try {
      const response = await fetch(`/api/plcs/${plc.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "No se pudo quitar el PLC.");
        return;
      }
      setPlcs((current) => current.filter((item) => item.id !== plc.id));
    } finally {
      setDeletingId(null);
    }
  }

  async function createPlc(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/plcs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPlc),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo agregar el PLC.");
        return;
      }
      setPlcs((current) => [...current, data.plc]);
      setNewPlc({ name: "", statusTopic: "", cmdTopic: "" });
      setShowAdd(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="config-section">
      <div className="section-toolbar">
        <div>
          <h2>PLCs (LOGO)</h2>
          <p className="section-sub">Cada PLC tiene su propio tópico de status y de comando en el broker.</p>
        </div>
        <button type="button" className="btn-add" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancelar" : "+ Agregar PLC"}
        </button>
      </div>
      {error && <p className="config-error">{error}</p>}

      {showAdd && (
        <form className="config-new-row" onSubmit={createPlc}>
          <label>
            <span>Nombre</span>
            <input
              required
              placeholder="p. ej. LOGO Planta 2"
              value={newPlc.name}
              onChange={(e) => setNewPlc({ ...newPlc, name: e.target.value })}
            />
          </label>
          <label>
            <span>Tópico de status</span>
            <input
              required
              placeholder="p. ej. logo/planta2/status"
              value={newPlc.statusTopic}
              onChange={(e) => setNewPlc({ ...newPlc, statusTopic: e.target.value })}
            />
          </label>
          <label>
            <span>Tópico de comando</span>
            <input
              required
              placeholder="p. ej. logo/planta2/cmd"
              value={newPlc.cmdTopic}
              onChange={(e) => setNewPlc({ ...newPlc, cmdTopic: e.target.value })}
            />
          </label>
          <button type="submit" className="config-btn primary" disabled={creating}>
            {creating ? "Agregando..." : "Agregar PLC"}
          </button>
        </form>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="config-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tópico de status</th>
              <th>Tópico de comando</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plcs.map((plc) => {
              const draft = draftFor(plc);
              const dirty =
                draft.name !== plc.name || draft.statusTopic !== plc.statusTopic || draft.cmdTopic !== plc.cmdTopic;
              return (
                <tr key={plc.id}>
                  <td>
                    <input value={draft.name} onChange={(e) => updateDraft(plc, "name", e.target.value)} />
                  </td>
                  <td>
                    <input value={draft.statusTopic} onChange={(e) => updateDraft(plc, "statusTopic", e.target.value)} />
                  </td>
                  <td>
                    <input value={draft.cmdTopic} onChange={(e) => updateDraft(plc, "cmdTopic", e.target.value)} />
                  </td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="config-btn primary"
                      disabled={!dirty || savingId === plc.id}
                      onClick={() => savePlc(plc)}
                    >
                      {savingId === plc.id ? "Guardando..." : "Guardar"}
                    </button>
                    <button
                      type="button"
                      className="config-btn danger"
                      disabled={deletingId === plc.id}
                      onClick={() => deletePlc(plc)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              );
            })}
            {plcs.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "#7c8798", textAlign: "center", padding: "24px 20px" }}>
                  Todavía no hay PLCs configurados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- Lámparas ----------------------------------------------------------------

function LampsSection({
  lamps,
  setLamps,
  plcs,
}: {
  lamps: LampRow[];
  setLamps: React.Dispatch<React.SetStateAction<LampRow[]>>;
  plcs: PlcRow[];
}) {
  const [drafts, setDrafts] = useState<Record<number, Omit<LampRow, "id" | "position">>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newLamp, setNewLamp] = useState({ position: "", name: "", plcId: "", tagMode: "", tagStatus: "", tagCommand: "" });
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);

  function draftFor(lamp: LampRow) {
    return (
      drafts[lamp.id] ?? {
        name: lamp.name,
        plcId: lamp.plcId,
        tagMode: lamp.tagMode,
        tagStatus: lamp.tagStatus,
        tagCommand: lamp.tagCommand,
      }
    );
  }

  function updateDraft(lamp: LampRow, field: keyof Omit<LampRow, "id" | "position">, value: string | number | null) {
    setDrafts((current) => ({
      ...current,
      [lamp.id]: { ...draftFor(lamp), [field]: value } as Omit<LampRow, "id" | "position">,
    }));
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
        body: JSON.stringify({ ...newLamp, position: Number(newLamp.position), plcId: Number(newLamp.plcId) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo agregar la lámpara.");
        return;
      }
      setLamps((current) => [...current, data.lamp].sort((a, b) => a.position - b.position));
      setNewLamp({ position: "", name: "", plcId: "", tagMode: "", tagStatus: "", tagCommand: "" });
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
              <label>PLC</label>
              <select
                required
                value={newLamp.plcId}
                onChange={(e) => setNewLamp({ ...newLamp, plcId: e.target.value })}
              >
                <option value="" disabled>
                  Elige un PLC...
                </option>
                {plcs.map((plc) => (
                  <option key={plc.id} value={plc.id}>
                    {plc.name}
                  </option>
                ))}
              </select>
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
              <button type="submit" className="config-btn primary" disabled={creating || plcs.length === 0}>
                {creating ? "Agregando..." : "Agregar"}
              </button>
            </div>
            {plcs.length === 0 && (
              <p className="config-error" style={{ margin: 0 }}>
                Primero da de alta un PLC arriba.
              </p>
            )}
          </form>
        )}

        {paged.map((lamp) => {
          const draft = draftFor(lamp);
          const dirty =
            draft.name !== lamp.name ||
            draft.plcId !== lamp.plcId ||
            draft.tagMode !== lamp.tagMode ||
            draft.tagStatus !== lamp.tagStatus ||
            draft.tagCommand !== lamp.tagCommand;
          const plcName = plcs.find((p) => p.id === draft.plcId)?.name;
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
                <label>PLC</label>
                <select
                  value={draft.plcId ?? ""}
                  onChange={(e) => updateDraft(lamp, "plcId", e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="" disabled>
                    Elige un PLC...
                  </option>
                  {plcs.map((plc) => (
                    <option key={plc.id} value={plc.id}>
                      {plc.name}
                    </option>
                  ))}
                </select>
                {!plcName && <span style={{ color: "#c0263f", fontSize: 11 }}>Sin PLC asignado</span>}
              </div>
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
