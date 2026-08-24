"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "../Sidebar";
import { Icon } from "../icons";

type LampOption = { id: number; name: string; position: number };

type EventRow = {
  id: number;
  lampId: number | null;
  lampName: string;
  message: string;
  createdAt: string;
};

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeInputValue(date: Date) {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Fecha y hora local de quien está viendo la pantalla — a diferencia del
// reloj del LOGO que se muestra en el Dashboard (ese sí viene en UTC tal
// cual lo manda el PLC), esto es la hora real en la que se guardó cada
// evento, así que se muestra en la zona horaria del navegador.
function formatEventDate(value: string) {
  const date = new Date(value);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  const hours24 = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const suffix = hours24 >= 12 ? "p.m." : "a.m.";
  const hours12 = (hours24 % 12 || 12).toString().padStart(2, "0");
  return `${day}/${month}/${year}, ${hours12}:${minutes}:${seconds} ${suffix}`;
}

function eventTone(message: string): "on" | "off" | "mode" | "force" {
  if (message.includes("Encendida")) return "on";
  if (message.includes("Apagada")) return "off";
  if (message.toLowerCase().includes("forzad") || message.toLowerCase().includes("liberó")) return "force";
  return "mode";
}

export function HistorialView({ initialLamps, isAdmin }: { initialLamps: LampOption[]; isAdmin: boolean }) {
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateInputValue(d);
  });
  const [horaInicio, setHoraInicio] = useState("00:00");
  const [fechaFin, setFechaFin] = useState(() => toDateInputValue(new Date()));
  const [horaFin, setHoraFin] = useState(() => toTimeInputValue(new Date()));
  const [lampId, setLampId] = useState("");

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const desde = new Date(`${fechaInicio}T${horaInicio}:00`);
      const hasta = new Date(`${fechaFin}T${horaFin}:59`);
      if (!Number.isNaN(desde.getTime())) params.set("desde", desde.toISOString());
      if (!Number.isNaN(hasta.getTime())) params.set("hasta", hasta.toISOString());
      if (lampId) params.set("lampId", lampId);

      const response = await fetch(`/api/historial?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo cargar el historial.");
        setEvents([]);
        return;
      }
      setEvents(data.events);
      setTruncated(Boolean(data.truncated));
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carga inicial con el rango por defecto (últimas 24 horas). Búsquedas
  // posteriores las dispara el botón "Buscar" del formulario, no cada tecla.
  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    fetchEvents();
  }

  // Borra TODA la tabla de eventos (no nomás lo que se está viendo con los
  // filtros de arriba) — es para vaciar la bitácora de vez en cuando y que
  // no se vaya saturando la base de datos, no una forma de "limpiar la
  // vista". Por eso el mensaje de confirmación es bien explícito.
  async function handleDeleteAll() {
    if (
      !confirm(
        "¿Borrar TODO el historial de eventos? Esto elimina permanentemente todos los renglones guardados (de cualquier fecha, no nomás los que ves filtrados ahorita). No se puede deshacer."
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/historial", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "No se pudo borrar el historial.");
        return;
      }
      setEvents([]);
      setTruncated(false);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="sip-shell">
      <Sidebar active="historial" />

      <section className="sip-main">
        <header className="config-header">
          <div>
            <h1>Historial</h1>
            <p>Registro de encendidos, apagados y cambios de modo de cada lámpara.</p>
          </div>
        </header>

        <div className="config-body">
          <section className="config-section">
            <div className="section-toolbar">
              <div>
                <h2>Eventos registrados</h2>
                <p className="section-sub">Cambios de estado guardados con fecha y hora.</p>
              </div>
              <div className="section-toolbar-actions">
                {isAdmin && (
                  <button
                    type="button"
                    className="config-btn danger"
                    onClick={handleDeleteAll}
                    disabled={deleting}
                  >
                    {deleting ? "Borrando..." : "Borrar historial"}
                  </button>
                )}
                <button type="button" className="btn-icon" onClick={() => fetchEvents()} aria-label="Actualizar">
                  <Icon name="refresh" size={16} />
                </button>
              </div>
            </div>

            <form className="historial-filters" onSubmit={handleSearch}>
              <label>
                <span>Fecha inicio</span>
                <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </label>
              <label>
                <span>Hora inicio</span>
                <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
              </label>
              <label>
                <span>Fecha fin</span>
                <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              </label>
              <label>
                <span>Hora fin</span>
                <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
              </label>
              <label>
                <span>Lámpara</span>
                <select value={lampId} onChange={(e) => setLampId(e.target.value)}>
                  <option value="">Todas</option>
                  {initialLamps.map((lamp) => (
                    <option key={lamp.id} value={lamp.id}>
                      {lamp.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="config-btn primary historial-search-btn" disabled={loading}>
                <Icon name="search" size={14} />
                {loading ? "Buscando..." : "Buscar"}
              </button>
            </form>

            {error && <p className="config-error">{error}</p>}

            <div style={{ overflowX: "auto" }}>
              <table className="config-table historial-table">
                <thead>
                  <tr>
                    <th>Lámpara</th>
                    <th>Mensaje</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={3} style={{ color: "#7c8798", textAlign: "center", padding: "24px 20px" }}>
                        Cargando…
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    events.map((event) => (
                      <tr key={event.id}>
                        <td className="historial-lamp-name">{event.lampName}</td>
                        <td>
                          <span className={`historial-tag ${eventTone(event.message)}`}>{event.message}</span>
                        </td>
                        <td className="historial-date">{formatEventDate(event.createdAt)}</td>
                      </tr>
                    ))}
                  {!loading && events.length === 0 && !error && (
                    <tr>
                      <td colSpan={3} style={{ color: "#7c8798", textAlign: "center", padding: "24px 20px" }}>
                        No hay eventos registrados en ese rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {truncated && (
              <p className="historial-note">
                Se muestran los {events.length} eventos más recientes de ese rango — acórtalo para ver todo.
              </p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
