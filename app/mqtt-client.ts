import { connect, type MqttClient } from "mqtt";

// Broker real de HiveMQ Cloud donde está conectado el LOGO de Siemens (planta1).
const BROKER_URL = "mqtts://c56dc92e5c454d4a808083fe2db4874d.s1.eu.hivemq.cloud:8883";
const BROKER_USERNAME = "prueba";
const BROKER_PASSWORD = "123456789";

const CMD_TOPIC = "logo/planta1/cmd";
const STATUS_TOPIC = "logo/planta1/status";

// Total de lámparas que el LOGO puede reportar. Cada una tiene sus propias
// tags: Auto_N (modo), FB_LampN (encendido real) y TurnOn_N (forzar
// encendido/apagado). El horario (onTime/offTime) YA NO se le manda al LOGO:
// vive aquí y este servidor decide cuándo publicar TurnOn_N según la hora.
const LAMP_COUNT = 15;

export type LampState = {
  onTime: string;
  offTime: string;
  isOn: boolean | null;
  mode: "AUTO" | "MAN" | null;
};

type ReportedLampState = {
  isOn: boolean | null;
  mode: "AUTO" | "MAN" | null;
};

type ScheduleEntry = {
  onTime: string;
  offTime: string;
};

type InternalState = {
  reported: Record<number, ReportedLampState>;
  schedule: Record<number, ScheduleEntry>;
  // Último TurnOn_N que mandamos por horario, para no repetir el mismo
  // comando en cada mensaje de estado. null = todavía no sincronizado
  // (recién arrancó el servidor o la lámpara acaba de pasar a Automático).
  commandedOn: Record<number, boolean | null>;
  updatedAt: number | null;
  connected: boolean;
  // "$logotime" que manda el LOGO: segundos desde 1970-01-01 (Unix timestamp),
  // sin ajuste de zona horaria — así es como ya se muestra en la cabecera.
  logoTime: number | null;
};

const state: InternalState = {
  reported: Object.fromEntries(Array.from({ length: LAMP_COUNT }, (_, i) => [i + 1, { isOn: null, mode: null }])),
  // Horario por defecto hasta que se edite desde el dashboard: encendida de
  // noche, apagada de día. Vive solo en memoria de este servidor (ver nota
  // de persistencia pendiente).
  schedule: Object.fromEntries(Array.from({ length: LAMP_COUNT }, (_, i) => [i + 1, { onTime: "18:00", offTime: "06:00" }])),
  commandedOn: Object.fromEntries(Array.from({ length: LAMP_COUNT }, (_, i) => [i + 1, null])),
  updatedAt: null,
  connected: false,
  logoTime: null,
};

// Si el LOGO deja de mandar datos por más de este tiempo, lo consideramos
// desconectado aunque el socket con el broker siga técnicamente abierto:
// "conectado" significa que el LOGO está vivo y escribiendo, no solo que
// nuestro servidor tiene sesión con HiveMQ.
const STALE_AFTER_MS = 60_000;

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Hora del día (en minutos, 0-1439) según $logotime, sin ajuste de zona horaria.
function logoMinutesOfDay(epochSeconds: number): number {
  const d = new Date(epochSeconds * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// true si "now" cae dentro de la ventana [onTime, offTime), soportando
// horarios que cruzan medianoche (ej. enciende 18:00, apaga 06:00).
function isWithinSchedule(logoTimeSeconds: number, entry: ScheduleEntry): boolean {
  const now = logoMinutesOfDay(logoTimeSeconds);
  const on = minutesOfDay(entry.onTime);
  const off = minutesOfDay(entry.offTime);
  if (on === off) return false;
  if (on < off) return now >= on && now < off;
  return now >= on || now < off;
}

function buildPowerPayload(id: number, on: boolean): string {
  return JSON.stringify({ state: { [`TurnOn_${id}`]: { value: [on ? 1 : 0] } } });
}

// Compara la hora actual contra el horario guardado de una lámpara y, si
// hace falta, publica TurnOn_N para alcanzarlo. Solo actúa si la lámpara
// está en modo Automático (Auto_N=1) — en Manual no tocamos nada.
function evaluateSchedule(client: MqttClient, id: number) {
  const lamp = state.reported[id];
  const entry = state.schedule[id];
  if (!lamp || !entry) return;

  if (lamp.mode !== "AUTO") {
    // Se resetea para que, al volver a Automático, se resincronice de una vez.
    state.commandedOn[id] = null;
    return;
  }

  if (state.logoTime === null) return; // todavía no tenemos referencia de hora

  const desiredOn = isWithinSchedule(state.logoTime, entry);
  if (state.commandedOn[id] === desiredOn) return;

  state.commandedOn[id] = desiredOn;
  client.publish(CMD_TOPIC, buildPowerPayload(id, desiredOn), { qos: 0 });
}

declare global {
  // eslint-disable-next-line no-var
  var __sipMqttClient: MqttClient | undefined;
}

function getClient(): MqttClient {
  if (!globalThis.__sipMqttClient) {
    const client = connect(BROKER_URL, {
      username: BROKER_USERNAME,
      password: BROKER_PASSWORD,
      clientId: `sip-dashboard-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 4000,
      connectTimeout: 10000,
    });

    client.on("connect", () => {
      state.connected = true;
      client.subscribe(STATUS_TOPIC, (err) => {
        if (err) console.error("[mqtt] no se pudo suscribir a", STATUS_TOPIC, err);
      });
    });

    client.on("close", () => {
      state.connected = false;
    });

    client.on("offline", () => {
      state.connected = false;
    });

    client.on("error", (err) => {
      console.error("[mqtt] error de conexión:", err.message);
    });

    client.on("message", (topic, payload) => {
      if (topic !== STATUS_TOPIC) return;
      try {
        const data = JSON.parse(payload.toString());
        const reported = data?.state?.reported;
        if (!reported) return;

        for (let id = 1; id <= LAMP_COUNT; id++) {
          const lamp = state.reported[id];
          const autoValue = reported[`Auto_${id}`]?.value?.[0];
          const fbValue = reported[`FB_Lamp${id}`]?.value?.[0];
          if (typeof autoValue === "number") lamp.mode = autoValue === 1 ? "AUTO" : "MAN";
          if (typeof fbValue === "number") lamp.isOn = fbValue === 1;
        }

        const logoTimeValue = reported["$logotime"];
        if (typeof logoTimeValue === "number") state.logoTime = logoTimeValue;

        state.updatedAt = Date.now();

        // Con la hora y los modos ya actualizados, revisamos si alguna
        // lámpara en Automático necesita encender/apagar según su horario.
        for (let id = 1; id <= LAMP_COUNT; id++) {
          evaluateSchedule(client, id);
        }
      } catch (err) {
        console.error("[mqtt] payload inválido en", topic, err);
      }
    });

    globalThis.__sipMqttClient = client;
  }
  return globalThis.__sipMqttClient;
}

export function getLampsState(): { lamps: Record<number, LampState>; updatedAt: number | null; connected: boolean; logoTime: number | null } {
  getClient();
  const dataIsFresh = state.updatedAt !== null && Date.now() - state.updatedAt < STALE_AFTER_MS;

  const lamps: Record<number, LampState> = {};
  for (let id = 1; id <= LAMP_COUNT; id++) {
    const reported = state.reported[id];
    const schedule = state.schedule[id];
    lamps[id] = {
      onTime: schedule.onTime,
      offTime: schedule.offTime,
      isOn: reported.isOn,
      mode: reported.mode,
    };
  }

  return {
    lamps,
    updatedAt: state.updatedAt,
    // "Conectado" = tenemos sesión con el broker Y el LOGO nos ha escrito
    // datos en el último minuto. Si deja de mandar, se marca desconectado
    // aunque el socket siga abierto.
    connected: state.connected && dataIsFresh,
    logoTime: state.logoTime,
  };
}

// Guarda el horario de encendido/apagado de una lámpara EN ESTE SERVIDOR
// (ya no se le manda al LOGO) y re-evalúa de inmediato por si ya toca
// encender/apagar con el nuevo horario.
export function setLampSchedule(id: number, which: "on" | "off", time: string): void {
  if (!state.schedule[id]) state.schedule[id] = { onTime: "18:00", offTime: "06:00" };
  state.schedule[id][which === "on" ? "onTime" : "offTime"] = time;

  const client = getClient();
  evaluateSchedule(client, id);
}

// Fuerza el encendido/apagado manual de una lámpara (botón de la card). El
// LOGO confirma el cambio real a través de FB_LampN en logo/planta1/status.
// También actualiza commandedOn para que el horario no lo pise de inmediato:
// solo lo corrige en la siguiente transición programada.
export function setLampPower(id: number, on: boolean): void {
  const client = getClient();
  state.commandedOn[id] = on;
  client.publish(CMD_TOPIC, buildPowerPayload(id, on), { qos: 0 });
}
