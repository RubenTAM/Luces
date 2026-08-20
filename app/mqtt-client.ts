import { connect, type MqttClient } from "mqtt";

// Broker real de HiveMQ Cloud donde está conectado el LOGO de Siemens (planta1).
const BROKER_URL = "mqtts://c56dc92e5c454d4a808083fe2db4874d.s1.eu.hivemq.cloud:8883";
const BROKER_USERNAME = "prueba";
const BROKER_PASSWORD = "123456789";

const CMD_TOPIC = "logo/planta1/cmd";
const STATUS_TOPIC = "logo/planta1/status";

type Lamp1State = {
  onTime: string | null;
  offTime: string | null;
  isOn: boolean | null;
  mode: "AUTO" | "MAN" | null;
  updatedAt: number | null;
  connected: boolean;
};

const state: Lamp1State = { onTime: null, offTime: null, isOn: null, mode: null, updatedAt: null, connected: false };

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
        const onValue = reported.HoraOn1?.value?.[0];
        const offValue = reported.HoraOff1?.value?.[0];
        const autoValue = reported.Auto_1?.value?.[0];
        const fbValue = reported.FB_Lamp1?.value?.[0];
        if (typeof onValue === "number") state.onTime = decodeHour(onValue);
        if (typeof offValue === "number") state.offTime = decodeHour(offValue);
        if (typeof autoValue === "number") state.mode = autoValue === 1 ? "AUTO" : "MAN";
        if (typeof fbValue === "number") state.isOn = fbValue === 1;
        state.updatedAt = Date.now();
      } catch (err) {
        console.error("[mqtt] payload inválido en", topic, err);
      }
    });

    globalThis.__sipMqttClient = client;
  }
  return globalThis.__sipMqttClient;
}

export function getLamp1State(): Lamp1State {
  getClient();
  return { ...state };
}

export function setLamp1Time(which: "on" | "off", time: string): void {
  const client = getClient();
  const field = which === "on" ? "HoraOn1" : "HoraOff1";
  const value = encodeHour(time);
  const payload = JSON.stringify({ state: { [field]: { value: [value] } } });
  client.publish(CMD_TOPIC, payload, { qos: 0 });
}
