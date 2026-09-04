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
type ScheduleScope = "weekday" | "saturday" | "sunday";

type Lamp = {
  id: number;
  name: string;
  plcId: number | null;
  mode: Mode | null;
  onTime: string;
  offTime: string;
  // Qué horario es "hoy" para esta lámpara (según el reloj de su PLC).
  scope: ScheduleScope;
  // Horario de sábado tal cual está guardado (no cambia según el día) —
  // lo usa el modal del ícono de lápiz.
  saturdayOnTime: string;
  saturdayOffTime: string;
  // Horario de domingo tal cual está guardado, y si domingo está
  // habilitado. Domingo empieza deshabilitado: sin horario, la lámpara no
  // enciende sola ese día.
  sundayOnTime: string;
  sundayOffTime: string;
  sundayEnabled: boolean;
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

type EditState = { lampId: number; which: "on" | "off"; scope: ScheduleScope; hour: string; minute: string };

// El modal del ícono de lápiz edita sábado y domingo juntos (no uno por
// uno como el de arriba), porque lo que se quiere ver de un jalón es "cuál
// es el horario completo del fin de semana" — pero cada uno con sus
// propias horas, y domingo además con su propio interruptor de
// habilitado/deshabilitado.
type WeekendEditState = {
  lampId: number;
  satOnHour: string; satOnMinute: string; satOffHour: string; satOffMinute: string;
  sunEnabled: boolean;
  sunOnHour: string; sunOnMinute: string; sunOffHour: string; sunOffMinute: string;
};

export function LampDashboard() {
  const [lamps, setLamps] = useState<Lamp[]>([]);
  const [plcs, setPlcs] = useState<PlcMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [logoTime, setLogoTime] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [weekendEditState, setWeekendEditState] = useState<WeekendEditState | null>(null);

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
              scope: reported?.scope ?? "weekday",
              saturdayOnTime: reported?.saturdayOnTime ?? "18:00",
              saturdayOffTime: reported?.saturdayOffTime ?? "06:00",
              sundayOnTime: reported?.sundayOnTime ?? "18:00",
              sundayOffTime: reported?.sundayOffTime ?? "06:00",
              sundayEnabled: reported?.sundayEnabled ?? false,
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

  // El botón de Encendido/Apagado de la tarjeta edita SIEMPRE el horario
  // que se está mostrando ahí mismo: entre semana es el de lunes a viernes,
  // sábado es el de sábado y domingo es el de domingo (lamp.scope ya lo
  // dice) — así nunca se edita un horario distinto al que se ve en pantalla.
  const openEdit = (lamp: Lamp, which: "on" | "off") => {
    const [hour, minute] = (which === "on" ? lamp.onTime : lamp.offTime).split(":");
    setEditState({ lampId: lamp.id, which, scope: lamp.scope, hour, minute });
  };

  // El ícono de lápiz siempre abre el horario de sábado y domingo juntos,
  // sin importar qué día sea hoy — para poder dejarlo listo desde entre
  // semana.
  const openWeekendEdit = (lamp: Lamp) => {
    const [satOnHour, satOnMinute] = lamp.saturdayOnTime.split(":");
    const [satOffHour, satOffMinute] = lamp.saturdayOffTime.split(":");
    const [sunOnHour, sunOnMinute] = lamp.sundayOnTime.split(":");
    const [sunOffHour, sunOffMinute] = lamp.sundayOffTime.split(":");
    setWeekendEditState({
      lampId: lamp.id,
      satOnHour, satOnMinute, satOffHour, satOffMinute,
      sunEnabled: lamp.sundayEnabled,
      sunOnHour, sunOnMinute, sunOffHour, sunOffMinute,
    });
  };

  const applyEdit = () => {
    if (!editState) return;
    const hour = clamp(parseInt(editState.hour || "0", 10) || 0, 0, 23);
    const minute = clamp(parseInt(editState.minute || "0", 10) || 0, 0, 59);
    const time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    const { lampId, which, scope } = editState;

    // Actualizamos la tarjeta al instante (no esperamos al próximo poll de
    // 3s) para que no se vea la hora vieja unos segundos antes de refrescar.
    // Si se editó sábado o domingo, también se actualiza
    // saturdayOnTime/saturdayOffTime o sundayOnTime/sundayOffTime (lo usa
    // el modal del lápiz) además de onTime/offTime, que es lo que se ve en
    // la tarjeta mientras hoy sea justo ese día.
    setLamps((current) => current.map((lamp) => {
      if (lamp.id !== lampId) return lamp;
      if (scope !== "weekday") {
        const rawKey = scope === "saturday"
          ? (which === "on" ? "saturdayOnTime" : "saturdayOffTime")
          : (which === "on" ? "sundayOnTime" : "sundayOffTime");
        const next = { ...lamp, [rawKey]: time };
        return lamp.scope === scope ? { ...next, [which === "on" ? "onTime" : "offTime"]: time } : next;
      }
      return which === "on" ? { ...lamp, onTime: time } : { ...lamp, offTime: time };
    }));

    // El horario ya no se le manda al LOGO: se guarda en el servidor, que
    // compara contra la hora del LOGO y publica TurnOn_N solo cuando toque
    // encender/apagar. El encendido/apagado real de la tarjeta se sigue
    // actualizando solo vía FB_LampN.
    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId, which, time, scope }),
    }).catch(() => {});

    setEditState(null);
  };

  // Aplica sábado y domingo juntos (los cuatro campos del modal del
  // lápiz, más el interruptor de habilitar domingo) con varios POST — uno
  // por cada valor — para que el servidor los guarde cada quien en lo
  // suyo (saturdayOnTime/saturdayOffTime, sundayOnTime/sundayOffTime,
  // sundayEnabled) sin tocar el horario de lunes a viernes.
  const applyWeekendEdit = () => {
    if (!weekendEditState) return;
    const satOnHour = clamp(parseInt(weekendEditState.satOnHour || "0", 10) || 0, 0, 23);
    const satOnMinute = clamp(parseInt(weekendEditState.satOnMinute || "0", 10) || 0, 0, 59);
    const satOffHour = clamp(parseInt(weekendEditState.satOffHour || "0", 10) || 0, 0, 23);
    const satOffMinute = clamp(parseInt(weekendEditState.satOffMinute || "0", 10) || 0, 0, 59);
    const sunOnHour = clamp(parseInt(weekendEditState.sunOnHour || "0", 10) || 0, 0, 23);
    const sunOnMinute = clamp(parseInt(weekendEditState.sunOnMinute || "0", 10) || 0, 0, 59);
    const sunOffHour = clamp(parseInt(weekendEditState.sunOffHour || "0", 10) || 0, 0, 23);
    const sunOffMinute = clamp(parseInt(weekendEditState.sunOffMinute || "0", 10) || 0, 0, 59);

    const saturdayOnTime = `${satOnHour.toString().padStart(2, "0")}:${satOnMinute.toString().padStart(2, "0")}`;
    const saturdayOffTime = `${satOffHour.toString().padStart(2, "0")}:${satOffMinute.toString().padStart(2, "0")}`;
    const sundayOnTime = `${sunOnHour.toString().padStart(2, "0")}:${sunOnMinute.toString().padStart(2, "0")}`;
    const sundayOffTime = `${sunOffHour.toString().padStart(2, "0")}:${sunOffMinute.toString().padStart(2, "0")}`;
    const sundayEnabled = weekendEditState.sunEnabled;
    const { lampId } = weekendEditState;

    setLamps((current) => current.map((lamp) => {
      if (lamp.id !== lampId) return lamp;
      const next = { ...lamp, saturdayOnTime, saturdayOffTime, sundayOnTime, sundayOffTime, sundayEnabled };
      // Si hoy es justo el día que se acaba de editar, la tarjeta está
      // mostrando este mismo horario ahorita mismo: se refleja también en
      // onTime/offTime para no dejar la hora vieja unos segundos en
      // pantalla.
      if (lamp.scope === "saturday") return { ...next, onTime: saturdayOnTime, offTime: saturdayOffTime };
      if (lamp.scope === "sunday" && sundayEnabled) return { ...next, onTime: sundayOnTime, offTime: sundayOffTime };
      return next;
    }));

    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId, which: "on", time: saturdayOnTime, scope: "saturday" }),
    }).catch(() => {});
    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId, which: "off", time: saturdayOffTime, scope: "saturday" }),
    }).catch(() => {});
    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId, which: "on", time: sundayOnTime, scope: "sunday" }),
    }).catch(() => {});
    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId, which: "off", time: sundayOffTime, scope: "sunday" }),
    }).catch(() => {});
    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId, sundayEnabled }),
    }).catch(() => {});

    setWeekendEditState(null);
  };

  const forcePower = (lamp: Lamp) => {
    // El botón de forzado es de UN SOLO SENTIDO: únicamente sirve para
    // forzar el ENCENDIDO de emergencia. No existe "forzar apagado" — el
    // mismo botón, cuando la lámpara ya está forzada, simplemente SUELTA el
    // forzado (regresa el control al horario/modo automático) en vez de
    // mandar un apagado forzado. Así la tarjeta nunca muestra "Apagada
    // Forzada": al soltar, vuelve a verse como cualquier lámpara en
    // automático (gris si está apagada, verde si está encendida), tal como
    // se pidió. Antes este botón mandaba "power: apagar" cuando la lámpara
    // ya estaba encendida (forzada o no), así que un segundo click terminaba
    // forzando el apagado — ese era el comportamiento que había que quitar.
    if (lamp.forced) {
      fetch("/api/lamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lampId: lamp.id, release: true }),
      }).catch(() => {});
      return;
    }

    // Forzado de emergencia: publica TurnOn_N y saca la lámpara del control
    // del horario hasta que se libere del lado del servidor. Siempre es
    // "encender" — nunca "apagar" — porque forzar el apagado ya no es una
    // acción que exista. El ícono y la tarjeta se pondrán en verde solos
    // cuando el LOGO confirme el cambio real vía FB_LampN.
    fetch("/api/lamps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lampId: lamp.id, power: 1 }),
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
                    // El aro naranja y el texto "Forzada" SOLO se muestran
                    // mientras la lámpara está forzada Y encendida de
                    // verdad. Si lamp.forced sigue en true pero isOn ya lee
                    // apagado (un instante de por medio mientras se suelta
                    // el forzado, o cualquier otro desfase con la señal
                    // real del LOGO), la tarjeta ya no debe decir "Señal
                    // Apagada Forzada" ni ponerse naranja — eso es justo lo
                    // que se pidió quitar. Se ve plano, gris, como
                    // cualquier lámpara apagada en automático. El backend
                    // (forcePower) sigue usando lamp.forced tal cual para
                    // decidir si el click suelta el forzado o lo activa —
                    // esto de aquí es solo lo que se MUESTRA en pantalla.
                    const showForced = hasData && lamp.forced && lamp.isOn === true;
                    return <article className={`sip-card ${hasData ? "" : "disabled"}`} key={lamp.id}>
                      <div className="card-head">
                        <h3>{lamp.name}</h3>
                        <button
                          type="button"
                          className={`power-toggle ${hasData && lamp.isOn ? "on" : ""} ${showForced ? "forced" : ""}`}
                          disabled={!hasData}
                          onClick={() => forcePower(lamp)}
                          aria-label={lamp.forced ? `Quitar forzado de ${lamp.name}, regresar a automático` : `Forzar encendido de ${lamp.name}`}
                          title={lamp.forced ? "Quitar forzado (regresa a automático)" : "Forzar encendido"}
                        >
                          <Icon name="power" size={15}/>
                        </button>
                      </div>
                      <button className={`lamp-status ${hasData && lamp.isOn ? "on" : ""} ${showForced ? "forced" : ""}`} disabled type="button">
                        <span className="status-icon"><Icon name="lamp" size={22}/></span>
                        <span className="status-text">
                          <b>{hasData ? (showForced ? "Señal Encendida Forzada" : (lamp.isOn ? "Encendida" : "Apagada")) : PLACEHOLDER}</b>
                          <small className="readonly">{hasData ? `Modo: ${lamp.mode === "AUTO" ? "Automático" : "Manual"}` : `Modo: ${PLACEHOLDER}`}</small>
                        </span>
                      </button>
                      {(() => {
                        const sundayOff = lamp.scope === "sunday" && !lamp.sundayEnabled;
                        const scopeLabel = lamp.scope === "saturday"
                          ? "Horario de sábado"
                          : lamp.scope === "sunday"
                            ? (sundayOff ? "Domingo sin horario (apagada)" : "Horario de domingo")
                            : "Horario de lunes a viernes";
                        return <>
                          <div className="schedule-scope">{hasData ? scopeLabel : PLACEHOLDER}</div>
                          <div className="schedule-row">
                            <button type="button" className="schedule-col" disabled={!hasData || sundayOff} onClick={() => openEdit(lamp, "on")} aria-label={`Cambiar hora de encendido de ${lamp.name}`}><span className="label">Encendido</span><span className="value">{hasData && !sundayOff ? formatTime(lamp.onTime) : PLACEHOLDER}</span></button>
                            <button
                              type="button"
                              className="schedule-edit-weekend"
                              disabled={!hasData}
                              onClick={() => openWeekendEdit(lamp)}
                              aria-label={`Configurar horario de sábado y domingo de ${lamp.name}`}
                              title="Horario de sábado y domingo"
                            >
                              <Icon name="pencil" size={13}/>
                            </button>
                            <button type="button" className="schedule-col" disabled={!hasData || sundayOff} onClick={() => openEdit(lamp, "off")} aria-label={`Cambiar hora de apagado de ${lamp.name}`}><span className="label">Apagado</span><span className="value">{hasData && !sundayOff ? formatTime(lamp.offTime) : PLACEHOLDER}</span></button>
                          </div>
                        </>;
                      })()}
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
                      <Icon name={tone === "offline" ? "close" : tone === "pending" ? "clock" : "check"} size={20}/>
                    </div>
                    <div className="status-plc-info">
                      <strong className="status-plc-name">Estado sistema {plc.name}</strong>
                      <span className="status-plc-meta">
                        <span className="status-plc-ordinal">Sistema {index + 1}</span>
                        <span className="status-plc-dot">•</span>
                        <span className="status-plc-state">{label}</span>
                      </span>
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

    {weekendEditState && (
      <div className="modal-backdrop" onClick={() => setWeekendEditState(null)}>
        <div className="modal-box" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <h3>Horario de sábado y domingo — {lamps.find((lamp) => lamp.id === weekendEditState.lampId)?.name ?? `Lámpara ${weekendEditState.lampId}`}</h3>
            <button type="button" className="modal-close" onClick={() => setWeekendEditState(null)} aria-label="Cerrar"><Icon name="close" size={15}/></button>
          </div>
          <div className="modal-section">
            <h4 className="modal-section-title">Sábado</h4>
            <div className="modal-weekend-row">
              <span className="modal-weekend-label">Encendido</span>
              <div className="modal-body">
                <label className="modal-field">
                  <span>Horas</span>
                  <input type="number" inputMode="numeric" min={0} max={23} value={weekendEditState.satOnHour} onChange={(event) => setWeekendEditState({ ...weekendEditState, satOnHour: event.target.value })}/>
                </label>
                <span className="modal-colon">:</span>
                <label className="modal-field">
                  <span>Minutos</span>
                  <input type="number" inputMode="numeric" min={0} max={59} value={weekendEditState.satOnMinute} onChange={(event) => setWeekendEditState({ ...weekendEditState, satOnMinute: event.target.value })}/>
                </label>
              </div>
            </div>
            <div className="modal-weekend-row">
              <span className="modal-weekend-label">Apagado</span>
              <div className="modal-body">
                <label className="modal-field">
                  <span>Horas</span>
                  <input type="number" inputMode="numeric" min={0} max={23} value={weekendEditState.satOffHour} onChange={(event) => setWeekendEditState({ ...weekendEditState, satOffHour: event.target.value })}/>
                </label>
                <span className="modal-colon">:</span>
                <label className="modal-field">
                  <span>Minutos</span>
                  <input type="number" inputMode="numeric" min={0} max={59} value={weekendEditState.satOffMinute} onChange={(event) => setWeekendEditState({ ...weekendEditState, satOffMinute: event.target.value })}/>
                </label>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-head">
              <h4 className="modal-section-title">Domingo</h4>
              <label className="modal-sunday-toggle">
                <input
                  type="checkbox"
                  checked={weekendEditState.sunEnabled}
                  onChange={(event) => setWeekendEditState({ ...weekendEditState, sunEnabled: event.target.checked })}
                />
                <span>Habilitar domingo</span>
              </label>
            </div>
            {weekendEditState.sunEnabled && <>
              <div className="modal-weekend-row">
                <span className="modal-weekend-label">Encendido</span>
                <div className="modal-body">
                  <label className="modal-field">
                    <span>Horas</span>
                    <input type="number" inputMode="numeric" min={0} max={23} value={weekendEditState.sunOnHour} onChange={(event) => setWeekendEditState({ ...weekendEditState, sunOnHour: event.target.value })}/>
                  </label>
                  <span className="modal-colon">:</span>
                  <label className="modal-field">
                    <span>Minutos</span>
                    <input type="number" inputMode="numeric" min={0} max={59} value={weekendEditState.sunOnMinute} onChange={(event) => setWeekendEditState({ ...weekendEditState, sunOnMinute: event.target.value })}/>
                  </label>
                </div>
              </div>
              <div className="modal-weekend-row">
                <span className="modal-weekend-label">Apagado</span>
                <div className="modal-body">
                  <label className="modal-field">
                    <span>Horas</span>
                    <input type="number" inputMode="numeric" min={0} max={23} value={weekendEditState.sunOffHour} onChange={(event) => setWeekendEditState({ ...weekendEditState, sunOffHour: event.target.value })}/>
                  </label>
                  <span className="modal-colon">:</span>
                  <label className="modal-field">
                    <span>Minutos</span>
                    <input type="number" inputMode="numeric" min={0} max={59} value={weekendEditState.sunOffMinute} onChange={(event) => setWeekendEditState({ ...weekendEditState, sunOffMinute: event.target.value })}/>
                  </label>
                </div>
              </div>
            </>}
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-cancel" onClick={() => setWeekendEditState(null)}>Cancelar</button>
            <button type="button" className="modal-apply" onClick={applyWeekendEdit}>Aplicar</button>
          </div>
        </div>
      </div>
    )}

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
