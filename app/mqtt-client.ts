import { connect, type MqttClient } from "mqtt";

// Broker real de HiveMQ Cloud donde está conectado el LOGO de Siemens (planta1).
const BROKER_URL = "mqtts://c56dc92e5c454d4a808083fe2db4874d.s1.eu.hivemq.cloud:8883";
const BROKER_USERNAME = "prueba";
const BROKER_PASSWORD = "123456789";

const CMD_TOPIC = "logo/planta1/cmd";
const STATUS_TOPIC = "logo/planta1/status";

// Total de lámparas que el LOGO puede reportar. Cada una tiene sus propias
// tags: HoraOnN / HoraOffN (horarios), Auto_N (modo), FB_LampN (encendido real)
// y TurnOn_N (forzar encendido/apagado manual).
const LAMP_COUNT = 15;

export type LampState = {
  onTime: string | null;
  offTime: string | null;
  isOn: boolean | null;
  mode: "AUTO" | "MAN" | null;
};

type BrokerState = {
  lamps: Record<number, LampState>;
  updatedAt: number | null;
  connected: boolean;
  // "$logotime" que manda el LOGO: segundos desde 1970-01-01 (Unix timestamp).
  logoTime: number | null;
};

function emptyLampState(): LampState {
  return { onTime: null, offTime: null, isOn: null, mode: null };
}

const state: BrokerState = {
  lamps: Object.fromEntries(Array.from({ length: LAMP_COUNT }, (_, i) => [i + 1, emptyLampState()])),
  updatedAt: null,
  connected: false,
  logoTime: null,
};

// Si el LOGO deja de mandar datos por más de este tiempo, lo consideramos
// desconectado aunque el socket con el broker siga técnicamente abierto:
// "conectado" significa que el LOGO está vivo y escribiendo, no solo que
// nuestro servidor tiene sesión con HiveMQ.
const STALE_AFTER_MS = 60_000;

// El LOGO manda las horas como un entero decimal que, en hex, es "HHMM".
// Ej: 10:00 -> 0x1000 -> 4096. 08:15 -> 0x0815 -> 2069.
function decodeHour(value: number): string {
  const hex = value.toString(16).padStart(4, "0");
  return `${hex.slice(0, 2)}:${hex.slice(2, 4)}`;
}

function encodeHour(time: string): number {
  const [h, m] = time.split(":");
  const hex = `${(h ?? "0").padStart(2, "0")}${(m ?? "0").padStart(2, "0")}`;
  return parseInt(hex, 16);
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
          const lamp = state.lamps[id];
          const onValue = reported[`HoraOn${id}`]?.value?.[0];
          const offValue = reported[`HoraOff${id}`]?.value?.[0];
          const autoValue = reported[`Auto_${id}`]?.value?.[0];
          const fbValue = reported[`FB_Lamp${id}`]?.value?.[0];
          if (typeof onValue === "number") lamp.onTime = decodeHour(onValue);
          if (typeof offValue === "number") lamp.offTime = decodeHour(offValue);
          if (typeof autoValue === "number") lamp.mode = autoValue === 1 ? "AUTO" : "MAN";
          if (typeof fbValue === "number") lamp.isOn = fbValue === 1;
        }

        const logoTimeValue = reported["$logotime"];
        if (typeof logoTimeValue === "number") state.logoTime = logoTimeValue;

        state.updatedAt = Date.now();
      } catch (err) {
        console.error("[mqtt] payload inválido en", topic, err);
      }
    });

    globalThis.__sipMqttClient = client;
  }
  return globalThis.__sipMqttClient;
}

export function getLampsState(): BrokerState {
  getClient();
  const dataIsFresh = state.updatedAt !== null && Date.now() - state.updatedAt < STALE_AFTER_MS;
  return {
    lamps: Object.fromEntries(Object.entries(state.lamps).map(([id, lamp]) => [id, { ...lamp }])),
    updatedAt: state.updatedAt,
    // "Conectado" = tenemos sesión con el broker Y el LOGO nos ha escrito
    // datos en el último minuto. Si deja de mandar, se marca desconectado
    // aunque el socket siga abierto.
    connected: state.connected && dataIsFresh,
    logoTime: state.logoTime,
  };
}

export function setLampTime(id: number, which: "on" | "off", time: string): void {
  const client = getClient();
  const field = which === "on" ? `HoraOn${id}` : `HoraOff${id}`;
  const value = encodeHour(time);
  const payload = JSON.stringify({ state: { [field]: { value: [value] } } });
  client.publish(CMD_TOPIC, payload, { qos: 0 });
}

// Fuerza el encendido/apagado manual de una lámpara. El LOGO confirma el
// cambio real a través de FB_LampN en logo/planta1/status.
export function setLampPower(id: number, on: boolean): void {
  const client = getClient();
  const field = `TurnOn_${id}`;
  const payload = JSON.stringify({ state: { [field]: { value: [on ? 1 : 0] } } });
  client.publish(CMD_TOPIC, payload, { qos: 0 });
}
