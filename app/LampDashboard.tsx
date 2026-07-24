"use client";

import Image from "next/image";
import { useState } from "react";

type Mode = "AUTO" | "MAN";

type Lamp = {
  id: number;
  mode: Mode;
  onTime: string;
  offTime: string;
};

const initialLamps: Lamp[] = [
  "06:00|18:00",
  "06:15|18:15",
  "06:30|18:30",
  "07:00|19:00",
  "07:15|19:15",
  "07:30|19:30",
  "08:00|20:00",
  "08:15|20:15",
  "08:30|20:30",
  "09:00|21:00",
  "09:15|21:15",
  "09:30|21:30",
  "10:00|22:00",
  "10:15|22:15",
  "10:30|22:30",
].map((schedule, index) => {
  const [onTime, offTime] = schedule.split("|");
  const id = index + 1;

  return {
    id,
    mode: id === 4 ? "MAN" : "AUTO",
    onTime,
    offTime,
  };
});

export function LampDashboard() {
  const [lamps, setLamps] = useState<Lamp[]>(initialLamps);

  const updateLamp = (id: number, updater: (lamp: Lamp) => Lamp) => {
    setLamps((current) =>
      current.map((lamp) => (lamp.id === id ? updater(lamp) : lamp)),
    );
  };

  const setMode = (id: number, mode: Mode) => {
    updateLamp(id, (lamp) => ({ ...lamp, mode }));
  };

  const setSchedule = (id: number, key: "onTime" | "offTime", value: string) => {
    updateLamp(id, (lamp) => ({ ...lamp, [key]: value }));
  };

  return (
    <main className="sip-shell">
      <aside className="sip-sidebar" aria-label="Navegacion principal">
        <div className="sip-logo-box">
          <Image
            className="sip-logo-image"
            src="/sip-logo-cropped.png"
            alt="SIP Sistemas Inteligentes del Pacifico"
            width={320}
            height={143}
            priority
            unoptimized
          />
        </div>

        <nav className="sip-nav" aria-label="Sistema">
          <button className="active" type="button">
            <span className="icon grid" aria-hidden="true" />
            Dashboard
          </button>
          <span className="nav-section">Sistema</span>
          <button type="button">
            <span className="icon gear" aria-hidden="true" />
            Configuraci&oacute;n
          </button>
          <button type="button">
            <span className="icon clock" aria-hidden="true" />
            Historial
          </button>
        </nav>
      </aside>

      <section className="sip-main">
        <header className="sip-header">
          <div>
            <h1>Control de L&aacute;mparas</h1>
            <p>Resumen del sistema</p>
          </div>

          <div className="header-status">
            <span className="connected-dot" aria-hidden="true" />
            <span>Conectado</span>
          </div>
        </header>

        <section className="lamp-board" aria-label="Control de lamparas">
          {lamps.map((lamp) => (
            <article className="sip-card" key={lamp.id}>
              <h2>L&Aacute;MPARA {lamp.id}</h2>

              <div className="mode-toggle" role="group" aria-label={`Modo de lampara ${lamp.id}`}>
                <button
                  className={lamp.mode === "AUTO" ? "active" : ""}
                  onClick={() => setMode(lamp.id, "AUTO")}
                  type="button"
                >
                  AUTO
                </button>
                <button
                  className={lamp.mode === "MAN" ? "active" : ""}
                  onClick={() => setMode(lamp.id, "MAN")}
                  type="button"
                >
                  MAN
                </button>
              </div>

              <div className="schedule-box">
                <label className="time-field">
                  <span>Hora de Encendido</span>
                  <input
                    aria-label={`Hora de encendido de lampara ${lamp.id}`}
                    type="time"
                    value={lamp.onTime}
                    onChange={(event) => setSchedule(lamp.id, "onTime", event.target.value)}
                  />
                </label>

                <label className="time-field">
                  <span>Hora de Apagado</span>
                  <input
                    aria-label={`Hora de apagado de lampara ${lamp.id}`}
                    type="time"
                    value={lamp.offTime}
                    onChange={(event) => setSchedule(lamp.id, "offTime", event.target.value)}
                  />
                </label>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}