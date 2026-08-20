"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Mode = "AUTO" | "MAN";
type IconName = "home" | "settings" | "history" | "headset" | "sun" | "calendar" | "clock" | "wifi" | "lamp" | "power" | "search" | "grid" | "list" | "check" | "refresh" | "chevron" | "hand" | "arrowUp" | "arrowDown" | "more" | "close";

type Lamp = {
  id: number;
  mode: Mode;
  onTime: string;
  offTime: string;
  isOn: boolean;
  forced: boolean;
};

const schedules = [
  "06:00|18:00", "06:15|18:15", "06:30|18:30", "07:00|19:00", "07:15|19:15",
  "07:30|19:30", "08:00|20:00", "08:15|20:15", "08:30|20:30", "09:00|21:00",
  "09:15|21:15", "09:30|21:30", "10:00|22:00", "10:15|22:15", "10:30|22:30",
];

const activeLampIds = new Set([2, 4, 6, 8, 9, 12, 13, 15]);

const initialLamps: Lamp[] = schedules.map((schedule, index) => {
  const [onTime, offTime] = schedule.split("|");
  const id = index + 1;
  return { id, mode: id === 14 ? "MAN" : "AUTO", onTime, offTime, isOn: activeLampIds.has(id), forced: false };
});

// Lámparas que ya tienen sus tags reales en el LOGO (Auto_N / FB_LampN /
// TurnOn_N) y por eso se controlan de verdad. El resto se muestra
// deshabilitada con "----" hasta que se le agreguen sus tags — solo hay que
// sumar su número aquí cuando eso pase.
const ACTIVE_LAMP_IDS = new Set([1, 2]);
const PLACEHOLDER = "----";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-7h6v7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3h4v.08A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z"/></>,
    history: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2Zm16 0h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2Z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    wifi: <><path d="M5 9.5a10 10 0 0 1 14 0M8 13a6 6 0 0 1 8 0M11 16.5a2 2 0 0 1 2 0"/><circle cx="12" cy="19" r=".5" fill="currentColor"/></>,
    lamp: <><path d="M8 15h8M9 15l-1-3a4 4 0 0 1 8 0l-1 3M12 15v5M10 20h4"/></>,
    power: <><path d="M12 2v10"/><path d="M18.4 5.6a9 9 0 1 1-12.8 0"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    grid: <><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="18" r="1" fill="currentColor"/></>,
    check: <path d="m5 12 4.5 4.5L19 7"/>, refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5M18.5 9A7 7 0 0 0 6 6.5L4 9m16 6-2 2.5A7 7 0 0 1 5.5 15"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, hand: <path d="M8 11V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v5-2a1.5 1.5 0 0 1 3 0v4c0 5-3 8-8 8h-1c-2 0-3.5-1-5-3l-3-4a1.7 1.7 0 0 1 2.7-2l2.3 2"/>,
    arrowUp: <><path d="m7 11 5-5 5 5M12 6v12"/></>, arrowDown: <><path d="m7 13 5 5 5-5M12 18V6"/></>, more: <><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></>,
    close: <><path d="M6 6l12 12"/><path d="M18 6 6 18"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...common}>{paths[name]}</svg>;
}

function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "p.m." : "a.m.";
  const shownHour = hour % 12 || 12;
  return `${shownHour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatClockTime(date: Date) {
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const suffix = date.getHours() >= 12 ? "p.m." : "a.m.";
  const hour = date.getHours() % 12 || 12;
  return `${hour.toString().padStart(2, "0")}:${minutes}:${seconds} ${suffix}`;
}

const LOGO_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// El LOGO manda "$logotime" como un Unix timestamp (segundos desde 1970-01-01).
// Por ahora se muestra tal cual en UTC (sin ajustar zona horaria) — usamos
// getUTC* para que se vea igual sin importar la zona horaria de quien lo esté
// viendo. Pendiente confirmar con Ruben si hay que desplazarlo a la hora local
// de la planta (p. ej. UTC-7).
function formatLogoDateTime(epochSeconds: number) {
  const date = new Date(epochSeconds * 1000);
  const readable = `${date.getUTCDate()} ${LOGO_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  const hours24 = date.getUTCHours();
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const suffix = hours24 >= 12 ? "p.m." : "a.m.";
  const hours12 = (hours24 % 12) || 12;
  const time = `${hours12.toString().padStart(2, "0")}:${minutes} ${suffix}`;
  return { date: readable, time };
}

type EditState = { lampId: number; which: "on" | "off"; hour: string; minute: string };

export function LampDashboard() {
  const [lamps, setLamps] = useState<Lamp[]>(initialLamps);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [logoTime, setLogoTime] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  // Las 15 lámparas están conectadas al LOGO de Siemens vía MQTT: el estado
  // de encendido y el modo ya no se manejan en la app, vienen del broker.
  // El mismo polling nos dice si el servidor sigue conectado y escuchando.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/lamps", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        setConnected(Boolean(data.connected));
        setLastUpdated(new Date());
        if (typeof data.logoTime === "number") setLogoTime(data.logoTime);
        setLamps((current) => current.map((lamp) => {
          const reported = data.lamps?.[lamp.id];
          if (!reported) return lamp;
          return {
            ...lamp,
            onTime: reported.onTime ?? lamp.onTime,
            offTime: reported.offTime ?? lamp.offTime,
            isOn: reported.isOn ?? lamp.isOn,
            mode: reported.mode ?? lamp.mode,
            forced: reported.forced ?? lamp.forced,
          };
        }));
      } catch {
        if (!cancelled) setConnected(false);
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const logoDateTime = logoTime !== null ? formatLogoDateTime(logoTime) : null;
  const activeLamps = lamps.filter((lamp) => ACTIVE_LAMP_IDS.has(lamp.id));
  const autoCount = activeLamps.filter((lamp) => lamp.mode === "AUTO").length;
  const onCount = activeLamps.filter((lamp) => lamp.isOn).length;
  const offCount = activeLamps.length - onCount;
  const systemStatus = connected === false ? "offline" : connected === null ? "pending" : "online";

  const openEdit = (lamp: Lamp, which: "on" | "off") => {
    const [hour, minute] = (which === "on" ? lamp.onTime : lamp.offTime).split(":");
    setEditState({ lampId: lamp.id, which, hour, minute });
  };

  const applyEdit = () => {
    if (!editState) return;
    const hour = clamp(parseInt(editState.hour || "0", 10) || 0, 0, 23);
    const minute = clamp(parseInt(editState.minute || "0", 10) || 0, 0, 59);
    const time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    const { lampId, which } = editState;

    // Actualizamos la tarjeta al instante (no esperamos al próximo poll de
    // 3s) para que no se vea la hora vieja unos segundos antes de refrescar.
    setLamps((current) => current.map((lamp) => {
      if (lamp.id !== lampId) return lamp;
      return which === "on" ? { ...lamp, onTime: time } : { ...lamp, offTime: time };
    }));

    // El horario ya no se le manda al LOGO: se guarda en el servidor, que
    // compara contra la hora del LOGO y publica TurnOn_N solo cuando toque
    // encender/apagar. El encendido/apagado real de la tarjeta se sigue
    // actualizando solo vía FB_LampN.
    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId, which, time }),
    }).catch(() => {});

    setEditState(null);
  };

  const forcePower = (lamp: Lamp) => {
    // Forzado de emergencia: publica TurnOn_N y saca la lámpara del control
    // del horario hasta que se libere (ver releaseForce). El ícono y la
    // tarjeta se pondrán en verde/gris solos cuando el LOGO confirme el
    // cambio real vía FB_LampN.
    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId: lamp.id, power: lamp.isOn ? 0 : 1 }),
    }).catch(() => {});
  };

  const releaseForce = (lamp: Lamp) => {
    // Devuelve la lámpara al control del horario automático.
    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId: lamp.id, release: true }),
    }).catch(() => {});
  };

  return <main className="sip-shell">
    <aside className="sip-sidebar" aria-label="Navegación principal">
      <div className="sip-logo-box"><Image className="sip-logo-image" src="/sip-logo-cropped.png" alt="SIP Sistemas Inteligentes del Pacífico" width={320} height={143} priority unoptimized/></div>
      <nav className="sip-nav" aria-label="Sistema">
        <button className="active" type="button"><Icon name="home"/>Dashboard</button>
        <span className="nav-section">Sistema</span>
        <button type="button"><Icon name="settings"/>Configuración</button>
        <button type="button"><Icon name="history"/>Historial</button>
      </nav>
      <div className="sidebar-footer"><button type="button"><Icon name="headset"/>Soporte</button><span>Versión 1.0.0</span></div>
    </aside>

    <section className="sip-main">
      <header className="sip-header">
        <div><h1>Control de Lámparas</h1><p>Resumen del sistema</p></div>
        <div className="header-facts"><span><Icon name="sun"/>23 °C</span><span><Icon name="calendar"/>{logoDateTime ? logoDateTime.date : "—"}</span><span><Icon name="clock"/>{logoDateTime ? logoDateTime.time : "—"}</span><i/><span className={connected === false ? "status-disconnected" : ""}><b className={`connected-dot ${connected === false ? "off" : connected === null ? "pending" : ""}`}/>{connected === null ? "Verificando…" : connected ? "Conectado" : "Desconectado"}</span></div>
      </header>

      <div className="dashboard-content">
        <section className="workspace">
          <div className="controls-heading">
            <h2><span/>Control individual</h2>
            <div className="view-controls"><button className="selected" type="button" aria-label="Vista de cuadrícula"><Icon name="grid"/></button><button type="button" aria-label="Vista de lista"><Icon name="list"/></button></div>
          </div>

          <section className="lamp-board" aria-label="Control de lámparas">
            {lamps.map((lamp) => {
              const active = ACTIVE_LAMP_IDS.has(lamp.id);
              return <article className={`sip-card ${active ? "" : "disabled"}`} key={lamp.id}>
                <div className="card-head">
                  <h3>LÁMPARA {lamp.id}</h3>
                  <button type="button" className={`power-toggle ${active && lamp.isOn ? "on" : ""}`} disabled={!active} onClick={() => forcePower(lamp)} aria-label={`Forzar ${lamp.isOn ? "apagado" : "encendido"} de lámpara ${lamp.id}`}>
                    <Icon name="power" size={15}/>
                  </button>
                </div>
                <button className={`lamp-status ${active && lamp.isOn ? "on" : ""} ${active && lamp.forced ? "forced" : ""}`} disabled type="button">
                  <span className="status-icon"><Icon name="lamp" size={22}/></span>
                  <span className="status-text">
                    <b>{active ? (lamp.forced ? `Señal ${lamp.isOn ? "Encendida" : "Apagada"} Forzada` : (lamp.isOn ? "Encendida" : "Apagada")) : PLACEHOLDER}</b>
                    <small className="readonly">{active ? `Modo: ${lamp.mode === "AUTO" ? "Automático" : "Manual"}` : `Modo: ${PLACEHOLDER}`}</small>
                  </span>
                </button>
                {active && lamp.forced && (
                  <button type="button" className="release-force" onClick={() => releaseForce(lamp)}>Volver a horario automático</button>
                )}
                <div className="schedule-row">
                  <button type="button" className="schedule-col" disabled={!active} onClick={() => openEdit(lamp, "on")} aria-label={`Cambiar hora de encendido de lámpara ${lamp.id}`}><span className="label">Encendido</span><span className="value">{active ? formatTime(lamp.onTime) : PLACEHOLDER}</span></button>
                  <span className="schedule-dot">•</span>
                  <button type="button" className="schedule-col" disabled={!active} onClick={() => openEdit(lamp, "off")} aria-label={`Cambiar hora de apagado de lámpara ${lamp.id}`}><span className="label">Apagado</span><span className="value">{active ? formatTime(lamp.offTime) : PLACEHOLDER}</span></button>
                </div>
              </article>;
            })}
          </section>
        </section>

        <aside className="right-rail">
          <section className={`status-card ${systemStatus !== "online" ? systemStatus : ""}`}>
            <h2>Estado del sistema</h2>
            <div className="status-ring"><Icon name={systemStatus === "offline" ? "close" : systemStatus === "pending" ? "clock" : "check"} size={45}/></div>
            <strong>{systemStatus === "offline" ? "Desconectado del broker" : systemStatus === "pending" ? "Verificando conexión…" : "Todo funcionando correctamente"}</strong>
            <div className="updated"><span>Última actualización: {lastUpdated ? formatClockTime(lastUpdated) : "—"}</span><button type="button" aria-label="Actualizar" onClick={() => window.location.reload()}><Icon name="refresh" size={17}/></button></div>
          </section>
          <section className="rail-card quick"><h2>Resumen rápido</h2><ul><li><span className="blue"><Icon name="lamp"/>Total de lámparas en automático</span><b>{autoCount}</b></li><li><span className="green-text"><Icon name="power"/>Encendidas</span><b>{onCount}</b></li><li><span className="gray-text"><Icon name="power"/>Apagadas</span><b>{offCount}</b></li></ul></section>
          <section className="rail-card activity"><h2>Actividad reciente</h2><p className="activity-empty">Aún no hay actividad registrada.</p><a href="#historial">Ver historial completo <Icon name="chevron" size={16}/></a></section>
        </aside>
      </div>
    </section>

    {editState && (
      <div className="modal-backdrop" onClick={() => setEditState(null)}>
        <div className="modal-box" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <h3>Hora de {editState.which === "on" ? "encendido" : "apagado"} — LÁMPARA {editState.lampId}</h3>
            <button type="button" className="modal-close" onClick={() => setEditState(null)} aria-label="Cerrar"><Icon name="close" size={15}/></button>
          </div>
          <div className="modal-body">
            <label className="modal-field">
              <span>Horas</span>
              <input type="number" inputMode="numeric" min={0} max={23} value={editState.hour} onChange={(event) => setEditState({ ...editState, hour: event.target.value })}/>
            </label>
            <span className="modal-colon">:</span>
            <label className="modal-field">
              <span>Minutos</span>
              <input type="number" inputMode="numeric" min={0} max={59} value={editState.minute} onChange={(event) => setEditState({ ...editState, minute: event.target.value })}/>
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-cancel" onClick={() => setEditState(null)}>Cancelar</button>
            <button type="button" className="modal-apply" onClick={applyEdit}>Aplicar</button>
          </div>
        </div>
      </div>
    )}
  </main>;
}
