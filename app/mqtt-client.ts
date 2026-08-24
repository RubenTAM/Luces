import { connect, type MqttClient } from "mqtt";
import { getDb } from "../db";
import { lamps as lampsTable, plcs as plcsTable, lampEvents } from "../db/schema";

// Broker real de HiveMQ Cloud donde están conectados los LOGO de Siemens.
const BROKER_URL = "mqtts://c56dc92e5c454d4a808083fe2db4874d.s1.eu.hivemq.cloud:8883";
const BROKER_USERNAME = "prueba";
const BROKER_PASSWORD = "123456789";

// Topic propio del dashboard (no lo usa ningún LOGO) donde guardamos el
// horario como mensaje "retained" — así HiveMQ nos lo entrega solo al
// reconectar, y el horario sobrevive a un redeploy o reinicio del servidor
// sin depender de un disco propio (que en DigitalOcean App Platform no es
// persistente).
const SCHEDULE_TOPIC = "sip/dashboard/schedule";

// Ya no hay un tópico ni un LAMP_COUNT fijos en el código: cada PLC (LOGO)
// tiene sus propios tópicos de status/comando, y cada lámpara vive en
// Configuración con su propio No., sus 3 tags y a cuál PLC pertenece. Todo
// eso se lee de la base de datos y se refresca cada cierto tiempo (o de
// inmediato cuando Configuración avisa que algo cambió, ver
// invalidateMqttConfigCache más abajo).

export type LampState = {
  onTime: string;
  offTime: string;
  isOn: boolean | null;
  mode: "AUTO" | "MAN" | null;
  // true = alguien forzó el encendido/apagado desde el dashboard: el horario
  // deja de tocar esta lámpara hasta que se libere el forzado.
  forced: boolean;
};

type ReportedLampState = {
  isOn: boolean | null;
  mode: "AUTO" | "MAN" | null;
};

type ScheduleEntry = {
  onTime: string;
  offTime: string;
};

type LampConfig = {
  id: number; // = position ("No. Lámpara")
  name: string;
  plcId: number | null;
  tagMode: string;
  tagStatus: string;
  tagCommand: string;
};

type PlcConfig = {
  id: number;
  name: string;
  statusTopic: string;
  cmdTopic: string;
};

type ConfigSnapshot = {
  lamps: LampConfig[];
  plcs: PlcConfig[];
  loadedAt: number;
};

type InternalState = {
  reported: Record<number, ReportedLampState>;
  schedule: Record<number, ScheduleEntry>;
  // Último comando que mandamos por horario, para no repetir el mismo en
  // cada mensaje de estado. null = todavía no sincronizado (recién arrancó
  // el servidor o la lámpara acaba de pasar a Automático).
  commandedOn: Record<number, boolean | null>;
  // Lámparas puestas en forzado manual (botón de emergencia): mientras estén
  // en true, evaluateSchedule las ignora por completo.
  forced: Record<number, boolean>;
  updatedAt: number | null;
  connected: boolean;
  // "$logotime" que manda el LOGO: segundos desde 1970-01-01 (Unix timestamp),
  // sin ajuste de zona horaria. Este es SOLO para mostrar un reloj en la
  // cabecera del Dashboard — con más de un PLC, se queda con el valor del
  // último mensaje que llegue de cualquiera de los dos, así que si sus
  // relojes internos no coinciden exactamente, este valor va a "saltar"
  // entre uno y otro. NO se debe usar para decidir horarios de encendido —
  // para eso está plcLogoTime, abajo.
  logoTime: number | null;
  // La hora de CADA PLC por separado (clave = id del PLC), porque cada LOGO
  // tiene su propio reloj interno y no necesariamente están sincronizados
  // entre sí. evaluateSchedule() SIEMPRE debe comparar el horario de una
  // lámpara contra la hora de SU PROPIO PLC, nunca contra un reloj
  // compartido — antes de que existiera este campo, usaba state.logoTime
  // (uno solo, global) y esa fue la causa de que, en cuanto había dos PLCs
  // conectados a la vez, los comandos de encendido/apagado empezaran a
  // mandarse en 1/0/1/0 sin parar (ver la nota larga en evaluateSchedule).
  plcLogoTime: Record<number, number>;
  // Última vez (ms epoch de este servidor, no del LOGO) que llegó un
  // mensaje de status de CADA PLC por separado — para poder decir "PLC 1
  // conectado y escuchando" / "PLC 2 desconectado" de forma independiente,
  // en vez de un solo estado de conexión global para los dos.
  plcUpdatedAt: Record<number, number>;
};

declare global {
  // eslint-disable-next-line no-var
  var __sipMqttClient: MqttClient | undefined;
  // eslint-disable-next-line no-var
  var __sipState: InternalState | undefined;
  // eslint-disable-next-line no-var
  var __sipConfigSnapshot: ConfigSnapshot | undefined;
  // eslint-disable-next-line no-var
  var __sipConfigLoading: Promise<ConfigSnapshot> | undefined;
  // eslint-disable-next-line no-var
  var __sipSubscribedTopics: Set<string> | undefined;
}

// Se guarda en globalThis (igual que el cliente MQTT) para que sobreviva a
// que Next.js vuelva a evaluar este módulo en desarrollo (Fast Refresh) —
// si no, "forced"/"schedule" se reiniciaban solos y la UI parecía parpadear.
const state: InternalState = globalThis.__sipState ?? {
  reported: {},
  schedule: {},
  commandedOn: {},
  forced: {},
  updatedAt: null,
  connected: false,
  logoTime: null,
  plcLogoTime: {},
  plcUpdatedAt: {},
};
globalThis.__sipState = state;

const subscribedTopics: Set<string> = globalThis.__sipSubscribedTopics ?? new Set();
globalThis.__sipSubscribedTopics = subscribedTopics;

// Si el LOGO deja de mandar datos por más de este tiempo, lo consideramos
// desconectado aunque el socket con el broker siga técnicamente abierto:
// "conectado" significa que al menos un LOGO está vivo y escribiendo, no
// solo que nuestro servidor tiene sesión con HiveMQ.
const STALE_AFTER_MS = 60_000;

// Cuánto tiempo se reusa la lista de lámparas/PLCs antes de volver a leerla
// de la base — Configuración llama invalidateMqttConfigCache() para que un
// cambio se refleje de inmediato sin esperar este plazo.
const CONFIG_TTL_MS = 15_000;

function ensureLampDefaults(id: number) {
  if (!state.reported[id]) state.reported[id] = { isOn: null, mode: null };
  if (!state.schedule[id]) state.schedule[id] = { onTime: "18:00", offTime: "06:00" };
  if (!(id in state.commandedOn)) state.commandedOn[id] = null;
  if (!(id in state.forced)) state.forced[id] = false;
}

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

function buildPowerPayload(tagCommand: string, on: boolean): string {
  return JSON.stringify({ state: { [tagCommand]: { value: [on ? 1 : 0] } } });
}

// Guarda un renglón en la bitácora que alimenta la pantalla de Historial.
// Es "best effort" a propósito: si la base de datos falla un instante no
// se debe caer el servidor de MQTT por eso — nomás se registra el error en
// consola y se sigue. "lampName" se guarda tal cual está en este momento,
// como una copia (no una referencia), para que un cambio de nombre después
// en Configuración no reescriba el historial ya guardado.
function recordEvent(lampId: number | null, lampName: string, message: string) {
  const db = getDb();
  Promise.resolve(db.insert(lampEvents).values({ lampId, lampName, message })).catch((err) => {
    console.error("[historial] no se pudo guardar el evento:", err);
  });
}

// Publica el horario completo como mensaje retained en SCHEDULE_TOPIC, para
// que quede guardado en el broker y se recupere solo al reconectar.
function persistSchedule(client: MqttClient) {
  client.publish(SCHEDULE_TOPIC, JSON.stringify(state.schedule), { qos: 1, retain: true });
}

const TIME_RE = /^\d{2}:\d{2}$/;

// Reconstruye state.schedule a partir del mensaje retained guardado en el
// broker. Valida cada entrada por si el formato cambiara en el futuro. Ya no
// depende de un LAMP_COUNT fijo: acepta cualquier No. de lámpara que venga
// en el mensaje guardado.
function loadPersistedSchedule(payload: Buffer) {
  try {
    const data = JSON.parse(payload.toString());
    if (!data || typeof data !== "object") return;
    for (const key of Object.keys(data)) {
      const id = Number(key);
      if (!Number.isInteger(id)) continue;
      const entry = data[key];
      if (entry && TIME_RE.test(entry.onTime) && TIME_RE.test(entry.offTime)) {
        ensureLampDefaults(id);
        state.schedule[id] = { onTime: entry.onTime, offTime: entry.offTime };
      }
    }
  } catch (err) {
    console.error("[mqtt] horario guardado inválido:", err);
  }
}

// Compara la hora actual contra el horario guardado de una lámpara y, si
// hace falta, publica el comando de encendido/apagado en el tópico del PLC
// al que pertenece. Solo actúa si la lámpara está en modo Automático y no
// está en forzado manual — en Manual, o forzada, el horario no la toca.
function evaluateSchedule(client: MqttClient, lamp: LampConfig, plc: PlcConfig | undefined) {
  const id = lamp.id;
  ensureLampDefaults(id);
  const reported = state.reported[id];
  const entry = state.schedule[id];

  if (reported.mode !== "AUTO") {
    // Se resetea para que, al volver a Automático, se resincronice de una
    // vez y se libere cualquier forzado que hubiera quedado pendiente.
    state.commandedOn[id] = null;
    state.forced[id] = false;
    return;
  }

  if (state.forced[id]) return; // forzado manual activo: el horario no manda aquí
  if (!plc) return; // la lámpara quedó sin PLC asignado (no debería pasar, pero por si acaso)

  // La hora se compara contra el reloj de SU PROPIO PLC (plcLogoTime[plc.id]),
  // nunca contra un reloj global compartido entre PLCs. Cada LOGO manda su
  // propio "$logotime" y los dos relojes internos no necesariamente
  // coinciden exactamente entre sí. Antes esto comparaba contra
  // state.logoTime, una sola variable que se sobrescribía con el mensaje
  // más reciente de CUALQUIER PLC — en cuanto había dos PLCs conectados y
  // publicando cada uno cada pocos segundos, cada mensaje de uno pisaba la
  // hora que había dejado el otro, así que el horario se evaluaba a cada
  // rato con el reloj equivocado. Si los dos relojes no coincidían al
  // segundo (lo normal, cada LOGO lleva su propio RTC), eso hacía que
  // desiredOn cambiara de true a false y de vuelta a true en cada mensaje,
  // y el comando de encendido/apagado se mandara en 1/0/1/0 sin parar cada
  // ~5s — exactamente el problema reportado.
  const plcTime = state.plcLogoTime[plc.id];
  if (plcTime === undefined) return; // todavía no tenemos la hora de ESTE PLC

  const desiredOn = isWithinSchedule(plcTime, entry);
  if (state.commandedOn[id] === desiredOn) return;

  state.commandedOn[id] = desiredOn;
  client.publish(plc.cmdTopic, buildPowerPayload(lamp.tagCommand, desiredOn), { qos: 0 });
}

async function loadConfigFromDb(): Promise<ConfigSnapshot> {
  const db = getDb();
  const [lampRows, plcRows] = await Promise.all([db.select().from(lampsTable), db.select().from(plcsTable)]);

  const lamps: LampConfig[] = lampRows.map((l) => ({
    id: l.position,
    name: l.name,
    plcId: l.plcId,
    tagMode: l.tagMode,
    tagStatus: l.tagStatus,
    tagCommand: l.tagCommand,
  }));
  const plcs: PlcConfig[] = plcRows.map((p) => ({
    id: p.id,
    name: p.name,
    statusTopic: p.statusTopic,
    cmdTopic: p.cmdTopic,
  }));

  for (const lamp of lamps) ensureLampDefaults(lamp.id);

  return { lamps, plcs, loadedAt: Date.now() };
}

// Llamar esto desde las rutas de API de Configuración cuando se agrega,
// edita o quita una lámpara o un PLC, para que el servidor de MQTT se
// entere de inmediato en vez de esperar el refresco periódico de 15s.
export function invalidateMqttConfigCache() {
  globalThis.__sipConfigSnapshot = undefined;
}

async function getConfig(): Promise<ConfigSnapshot> {
  const cached = globalThis.__sipConfigSnapshot;
  if (cached && Date.now() - cached.loadedAt < CONFIG_TTL_MS) return cached;

  if (!globalThis.__sipConfigLoading) {
    globalThis.__sipConfigLoading = loadConfigFromDb().finally(() => {
      globalThis.__sipConfigLoading = undefined;
    });
  }
  const snapshot = await globalThis.__sipConfigLoading;
  globalThis.__sipConfigSnapshot = snapshot;
  ensureSubscriptions(snapshot);
  return snapshot;
}

function ensureSubscriptions(cfg: ConfigSnapshot) {
  if (!globalThis.__sipMqttClient) return; // se suscribe también justo después de "connect"
  const client = globalThis.__sipMqttClient;
  const wanted = new Set(cfg.plcs.map((p) => p.statusTopic));
  wanted.add(SCHEDULE_TOPIC);
  for (const topic of wanted) {
    if (subscribedTopics.has(topic)) continue;
    client.subscribe(topic, (err) => {
      if (err) console.error("[mqtt] no se pudo suscribir a", topic, err);
      else subscribedTopics.add(topic);
    });
  }
}

function findLampByPosition(cfg: ConfigSnapshot, id: number): LampConfig | undefined {
  return cfg.lamps.find((l) => l.id === id);
}

function findPlc(cfg: ConfigSnapshot, plcId: number | null): PlcConfig | undefined {
  if (plcId === null) return undefined;
  return cfg.plcs.find((p) => p.id === plcId);
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
      subscribedTopics.clear();
      client.subscribe(SCHEDULE_TOPIC, (err) => {
        if (err) console.error("[mqtt] no se pudo suscribir a", SCHEDULE_TOPIC, err);
        else subscribedTopics.add(SCHEDULE_TOPIC);
      });
      globalThis.__sipMqttClient = client;
      // Al reconectar, además de a SCHEDULE_TOPIC, hay que volver a
      // suscribirse a los tópicos de status de cada PLC — se fuerza a que
      // getConfig() vuelva a leer y a re-suscribir.
      globalThis.__sipConfigSnapshot = undefined;
      getConfig().catch((err2) => console.error("[mqtt] no se pudo cargar configuración de lámparas:", err2));
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
      if (topic === SCHEDULE_TOPIC) {
        loadPersistedSchedule(payload);
        return;
      }

      const cfg = globalThis.__sipConfigSnapshot;
      if (!cfg) return; // todavía no hemos cargado la configuración, se ignora este mensaje

      const plc = cfg.plcs.find((p) => p.statusTopic === topic);
      if (!plc) return; // tópico que no reconocemos

      const lampsOnThisPlc = cfg.lamps.filter((l) => l.plcId === plc.id);
      if (lampsOnThisPlc.length === 0) return;

      try {
        const data = JSON.parse(payload.toString());
        const reported = data?.state?.reported;
        if (!reported) return;

        for (const lamp of lampsOnThisPlc) {
          ensureLampDefaults(lamp.id);
          const prevMode = state.reported[lamp.id].mode;
          const prevIsOn = state.reported[lamp.id].isOn;
          const autoValue = reported[lamp.tagMode]?.value?.[0];
          const fbValue = reported[lamp.tagStatus]?.value?.[0];
          const newMode: "AUTO" | "MAN" | null =
            typeof autoValue === "number" ? (autoValue === 1 ? "AUTO" : "MAN") : prevMode;
          const newIsOn: boolean | null = typeof fbValue === "number" ? fbValue === 1 : prevIsOn;

          // Solo se registra en el Historial un cambio REAL de estado, no el
          // primer dato que llega al arrancar el servidor (cuando el valor
          // anterior todavía es null) — si no, cada reinicio del servidor
          // generaría un evento falso de "encendida"/"cambió de modo".
          if (newMode !== prevMode && prevMode !== null) {
            recordEvent(lamp.id, lamp.name, `Cambió a modo ${newMode === "AUTO" ? "Automático" : "Manual"}`);
          }
          if (newIsOn !== prevIsOn && prevIsOn !== null) {
            const forcedNote = state.forced[lamp.id] ? " (forzado manual)" : "";
            recordEvent(lamp.id, lamp.name, `${newIsOn ? "Encendida" : "Apagada"}${forcedNote}`);
          }

          state.reported[lamp.id].mode = newMode;
          state.reported[lamp.id].isOn = newIsOn;
        }

        const logoTimeValue = reported["$logotime"];
        if (typeof logoTimeValue === "number") {
          state.logoTime = logoTimeValue; // reloj que se muestra en la cabecera (solo display)
          state.plcLogoTime[plc.id] = logoTimeValue; // hora de ESTE PLC, para evaluar SU horario
        }

        state.updatedAt = Date.now();
        state.plcUpdatedAt[plc.id] = Date.now();

        // Con la hora y los modos ya actualizados, revisamos si alguna
        // lámpara de ESTE PLC en Automático necesita encender/apagar según
        // su horario.
        for (const lamp of lampsOnThisPlc) {
          evaluateSchedule(client, lamp, plc);
        }
      } catch (err) {
        console.error("[mqtt] payload inválido en", topic, err);
      }
    });

    globalThis.__sipMqttClient = client;
  }
  return globalThis.__sipMqttClient;
}

export async function getLampsState(): Promise<{
  lamps: Record<number, LampState>;
  devices: Array<{ id: number; name: string; plcId: number | null }>;
  plcs: Array<{ id: number; name: string; connected: boolean; lastSeenAt: number | null; logoTime: number | null }>;
  updatedAt: number | null;
  connected: boolean;
  logoTime: number | null;
}> {
  getClient();
  const cfg = await getConfig();
  const dataIsFresh = state.updatedAt !== null && Date.now() - state.updatedAt < STALE_AFTER_MS;

  const lamps: Record<number, LampState> = {};
  for (const lamp of cfg.lamps) {
    ensureLampDefaults(lamp.id);
    const reported = state.reported[lamp.id];
    const schedule = state.schedule[lamp.id];
    lamps[lamp.id] = {
      onTime: schedule.onTime,
      offTime: schedule.offTime,
      isOn: reported.isOn,
      mode: reported.mode,
      forced: state.forced[lamp.id] ?? false,
    };
  }

  // "devices" y "plcs" le dicen al Dashboard qué lámparas existen (con su
  // nombre y a cuál PLC pertenecen) y cómo se llama cada PLC — así el
  // Dashboard ya no trae una lista fija de 15 lámparas escrita en el
  // frontend: agregar/renombrar/quitar algo en Configuración se refleja
  // solo aquí, agrupado bajo el nombre de PLC que se le puso ahí.
  const devices = cfg.lamps
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((lamp) => ({ id: lamp.id, name: lamp.name, plcId: lamp.plcId }));

  // Cada PLC ahora manda también SU PROPIO estado de conexión (no uno solo
  // compartido entre los dos): "conectado" para un PLC = tenemos sesión con
  // el broker Y ese PLC en particular nos ha escrito en el último minuto.
  // "logoTime" es la hora que reportó ESE PLC la última vez (ver
  // plcLogoTime más arriba) — para mostrarla junto a su nombre en el
  // Dashboard, ahora que cada PLC lleva su propio reloj por separado.
  const plcs = cfg.plcs.map((plc) => {
    const lastSeenAt = state.plcUpdatedAt[plc.id] ?? null;
    const plcFresh = lastSeenAt !== null && Date.now() - lastSeenAt < STALE_AFTER_MS;
    return {
      id: plc.id,
      name: plc.name,
      connected: state.connected && plcFresh,
      lastSeenAt,
      logoTime: state.plcLogoTime[plc.id] ?? null,
    };
  });

  return {
    lamps,
    devices,
    plcs,
    updatedAt: state.updatedAt,
    // "Conectado" = tenemos sesión con el broker Y al menos un LOGO nos ha
    // escrito datos en el último minuto. Si dejan de mandar, se marca
    // desconectado aunque el socket siga abierto.
    connected: state.connected && dataIsFresh,
    logoTime: state.logoTime,
  };
}

// Guarda el horario de encendido/apagado de una lámpara EN ESTE SERVIDOR
// (ya no se le manda al LOGO) y re-evalúa de inmediato por si ya toca
// encender/apagar con el nuevo horario.
export async function setLampSchedule(id: number, which: "on" | "off", time: string): Promise<void> {
  ensureLampDefaults(id);
  state.schedule[id][which === "on" ? "onTime" : "offTime"] = time;

  const client = getClient();
  persistSchedule(client);

  const cfg = await getConfig();
  const lamp = findLampByPosition(cfg, id);
  if (lamp) evaluateSchedule(client, lamp, findPlc(cfg, lamp.plcId));
}

// Fuerza el encendido/apagado manual de una lámpara (botón de emergencia de
// la card). Esto saca a la lámpara del control del horario por completo
// (state.forced=true) hasta que se libere con releaseLampForce — así el
// horario ya no la "corrige" de vuelta unos segundos después. El LOGO
// confirma el cambio real a través de su tag de estado en el tópico de
// status del PLC al que pertenece.
export async function setLampPower(id: number, on: boolean): Promise<void> {
  const client = getClient();
  const cfg = await getConfig();
  const lamp = findLampByPosition(cfg, id);
  if (!lamp) return; // lámpara que ya no existe en Configuración
  const plc = findPlc(cfg, lamp.plcId);
  if (!plc) return; // sin PLC asignado — no hay a dónde publicar

  ensureLampDefaults(id);
  state.forced[id] = true;
  state.commandedOn[id] = on;
  client.publish(plc.cmdTopic, buildPowerPayload(lamp.tagCommand, on), { qos: 0 });
  recordEvent(id, lamp.name, `Forzado manual: ${on ? "encender" : "apagar"}`);
}

// Libera el forzado manual y regresa el control de esa lámpara al horario.
// Re-evalúa de inmediato para que, si ya toca otro estado, se aplique ya.
export async function releaseLampForce(id: number): Promise<void> {
  ensureLampDefaults(id);
  state.forced[id] = false;
  state.commandedOn[id] = null;
  const client = getClient();
  const cfg = await getConfig();
  const lamp = findLampByPosition(cfg, id);
  if (lamp) {
    evaluateSchedule(client, lamp, findPlc(cfg, lamp.plcId));
    recordEvent(id, lamp.name, "Se liberó el forzado manual, vuelve a control por horario");
  }
}
