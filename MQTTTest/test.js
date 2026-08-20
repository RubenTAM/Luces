const mqtt = require("mqtt");

const BROKER = "mqtts://c56dc92e5c454d4a808083fe2db4874d.s1.eu.hivemq.cloud:8883";
const USERNAME = "admin";
const PASSWORD = "Tam_2026";

const client = mqtt.connect(BROKER, {
  username: USERNAME,
  password: PASSWORD,
  rejectUnauthorized: true,
  reconnectPeriod: 3000,
});

client.on("connect", () => {
  console.log("\n✅ Conectado al broker");

  client.subscribe("logo/planta1/#", { qos: 1 }, (error) => {
    if (error) {
      console.error("❌ Error al suscribirse:", error.message);
      return;
    }

    console.log("📡 Escuchando: logo/planta1/#\n");
  });
});

client.on("message", (topic, message, packet) => {
  const payload = message.toString();

  console.log("========================================");
  console.log("FECHA:", new Date().toISOString());
  console.log("TOPIC:", topic);
  console.log("QOS:", packet.qos);
  console.log("RETAIN:", packet.retain);
  console.log("BYTES:", message.length);
  console.log("PAYLOAD CRUDO:");
  console.log(payload);

  try {
    const parsed = JSON.parse(payload);
    console.log("PAYLOAD JSON:");
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log("El payload no es JSON válido.");
  }

  console.log("========================================\n");
});

client.on("reconnect", () => {
  console.log("🔄 Reconectando...");
});

client.on("error", (error) => {
  console.error("❌ Error MQTT:", error.message);
});