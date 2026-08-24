"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { Sidebar } from "./Sidebar";

type Mode = "AUTO" | "MAN";

// Ya no hay una lista fija de 15 lámparas escrita en el código: las
// lámparas (su número, nombre y a cuál PLC pertenecen) se dan de alta en
// Configuración, y aquí se leen del servidor en cada poll — así que agregar,
// renombrar o quitar una lámpara en Configuración se refleja solo aquí,
// agrupada bajo el nombre del PLC al que pertenece.
type Lamp = {
  id: number;
  name: string;
  plcId: number | null;
  mode: Mode | null;
  onTime: string;
  offTime: string;
  isOn: boolean | null;
  forced: boolean;
};

type PlcMeta = {
  id: number;
  name: string;
  connected: boolean;
  lastSeenAt: number | null;
  logoTime: number | null;
};

const PLACEHOLDER = "----";

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
  const [lamps, setLamps] = useState<Lamp[]>([]);
  const [plcs, setPlcs] = useState<PlcMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [logoTime, setLogoTime] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  // Las lámparas están conectadas a uno o más LOGO de Siemens vía MQTT: el
  // estado de encendido y el modo ya no se manejan en la app, vienen del
  // broker. El mismo polling nos dice si el servidor sigue conectado y
  // escuchando, y de paso trae la lista de lámparas/PLCs tal como están
  // configuradas ahorita (así que un cambio en Configuración se refleja
  // aquí solo, sin tener que tocar código).
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/lamps", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        setLastUpdated(new Date());
        if (typeof data.logoTime === "number") setLogoTime(data.logoTime);

        const devices: Array<{ id: number; name: string; plcId: number | null }> = data.devices ?? [];
        setLamps(
          devices.map((device) => {
            const reported = data.lamps?.[device.id];
            return {
              id: device.id,
              name: device.name,
              plcId: device.plcId,
              onTime: reported?.onTime ?? "18:00",
              offTime: reported?.offTime ?? "06:00",
              isOn: reported?.isOn ?? null,
              mode: reported?.mode ?? null,
              forced: reported?.forced ?? false,
            };
          })
        );
        setPlcs(data.plcs ?? []);
        setLoaded(true);
      } catch {
        // No se pudo ni siquiera hablar con nuestro propio servidor (no es
        // lo mismo que el servidor esté conectado al broker) — marcamos
        // todos los PLCs como desconectados para no dejar un estado viejo
        // ("Conectado") pegado en pantalla mientras esto sigue fallando.
        if (!cancelled) setPlcs((current) => current.map((plc) => ({ ...plc, connected: false })));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const logoDateTime = logoTime !== null ? formatLogoDateTime(logoTime) : null;
  const autoCount = lamps.filter((lamp) => lamp.mode === "AUTO").length;
  const onCount = lamps.filter((lamp) => lamp.isOn).length;
  const offCount = lamps.filter((lamp) => lamp.mode !== null).length - onCount;

  // Agrupa las lámparas por PLC, en el mismo orden en que vienen los PLCs
  // del servidor, para poner un encabezado con el nombre de cada PLC (el
  // que se le puso en Configuración) arriba de sus lámparas. Una lámpara
  // que se quedó sin PLC asignado cae en un grupo aparte, por si acaso.
  const groupedByPlc = plcs
    .map((plc) => ({ plc, items: lamps.filter((lamp) => lamp.plcId === plc.id) }))
    .filter((group) => group.items.length > 0);
  const orphanLamps = lamps.filter((lamp) => !plcs.some((plc) => plc.id === lamp.plcId));
  if (orphanLamps.length > 0) {
    groupedByPlc.push({
      plc: { id: -1, name: "Sin PLC asignado", connected: false, lastSeenAt: null, logoTime: null },
      items: orphanLamps,
    });
  }

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
    // del horario hasta que se libere del lado del servidor. El ícono y la
    // tarjeta se pondrán en verde/gris solos cuando el LOGO confirme el
    // cambio real vía FB_LampN.
    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId: lamp.id, power: lamp.isOn ? 0 : 1 }),
    }).catch(() => {});
  };

  return <main className="sip-shell">
    <Sidebar active="dashboard"/>

    <section className="sip-main">
      <header className="sip-header">
        <div><h1>Control de Lámparas</h1><p>Resumen del sistema</p></div>
        <div className="header-facts"><span><Icon name="sun"/>23 °C</span><span><Icon name="calendar"/>{logoDateTime ? logoDateTime.date : "—"}</span></div>
      </header>

      <div className="dashboard-content">
        <section className="workspace">
          <div className="controls-heading">
            <h2><span/>Control individual</h2>
            <div className="view-controls"><button className="selected" type="button" aria-label="Vista de cuadrícula"><Icon name="grid"/></button><button type="button" aria-label="Vista de lista"><Icon name="list"/></button></div>
          </div>

          <section className="lamp-groups" aria-label="Control de lámparas">
            {groupedByPlc.map((group) => (
              <div className="plc-group" key={group.plc.id}>
                <h3 className="plc-group-heading">
                  <span className="plc-group-name">{group.plc.name}</span>
                  {group.plc.logoTime !== null && (
                    <span className="plc-group-time">
                      <Icon name="clock" size={13}/>{formatLogoDateTime(group.plc.logoTime).time}
                    </span>
                  )}
                </h3>
                <div className="lamp-board">
                  {group.items.map((lamp) => {
                    const hasData = lamp.mode !== null;
                    return <article className={`sip-card ${hasData ? "" : "disabled"}`} key={lamp.id}>
                      <div className="card-head">
                        <h3>{lamp.name}</h3>
                        <button type="button" className={`power-toggle ${hasData && lamp.isOn ? "on" : ""}`} disabled={!hasData} onClick={() => forcePower(lamp)} aria-label={`Forzar ${lamp.isOn ? "apagado" : "encendido"} de ${lamp.name}`}>
                          <Icon name="power" size={15}/>
                        </button>
                      </div>
                      <button className={`lamp-status ${hasData && lamp.isOn ? "on" : ""} ${hasData && lamp.forced ? "forced" : ""}`} disabled type="button">
                        <span className="status-icon"><Icon name="lamp" size={22}/></span>
                        <span className="status-text">
                          <b>{hasData ? (lamp.forced ? `Señal ${lamp.isOn ? "Encendida" : "Apagada"} Forzada` : (lamp.isOn ? "Encendida" : "Apagada")) : PLACEHOLDER}</b>
                          <small className="readonly">{hasData ? `Modo: ${lamp.mode === "AUTO" ? "Automático" : "Manual"}` : `Modo: ${PLACEHOLDER}`}</small>
                        </span>
                      </button>
                      <div className="schedule-row">
                        <button type="button" className="schedule-col" disabled={!hasData} onClick={() => openEdit(lamp, "on")} aria-label={`Cambiar hora de encendido de ${lamp.name}`}><span className="label">Encendido</span><span className="value">{hasData ? formatTime(lamp.onTime) : PLACEHOLDER}</span></button>
                        <span className="schedule-dot">•</span>
                        <button type="button" className="schedule-col" disabled={!hasData} onClick={() => openEdit(lamp, "off")} aria-label={`Cambiar hora de apagado de ${lamp.name}`}><span className="label">Apagado</span><span className="value">{hasData ? formatTime(lamp.offTime) : PLACEHOLDER}</span></button>
                      </div>
                    </article>;
                  })}
                </div>
              </div>
            ))}
            {loaded && groupedByPlc.length === 0 && (
              <p className="lamp-board-empty">No hay lámparas configuradas todavía. Agrégalas en Configuración.</p>
            )}
          </section>
        </section>

        <aside className="right-rail">
          <section className="status-card multi">
            <h2>Estado del sistema</h2>
            <div className="status-plc-grid">
              {plcs.map((plc, index) => {
                const tone = plc.connected ? "" : plc.lastSeenAt === null ? "pending" : "offline";
                const label = plc.connected ? "Conectado" : plc.lastSeenAt === null ? "Verificando…" : "Desconectado";
                return (
                  <div className={`status-plc ${tone}`} key={plc.id}>
                    <div className="status-plc-ring">
                      <Icon name={tone === "offline" ? "close" : tone === "pending" ? "clock" : "check"} size={18}/>
                    </div>
                    <div className="status-plc-info">
                      <strong>Estado sistema {plc.name} <span className="status-plc-ordinal">(Sistema {index + 1})</span></strong>
                      <span className="status-plc-state">{label}</span>
                    </div>
                  </div>
                );
              })}
              {plcs.length === 0 && <p className="status-plc-empty">No hay PLCs configurados todavía.</p>}
            </div>
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
            <h3>Hora de {editState.which === "on" ? "encendido" : "apagado"} — {lamps.find((lamp) => lamp.id === editState.lampId)?.name ?? `Lámpara ${editState.lampId}`}</h3>
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
