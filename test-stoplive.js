const mqtt = require("mqtt");

const MQTT_URL = "mqtts://broker.hivemq.com:8883";
const TOPIC = "vespera/G1J0A1.3T4L7PYY";

const client = mqtt.connect(MQTT_URL, { reconnectPeriod: 0 });

client.on("connect", () => {
  const payload = JSON.stringify({
    pv: 1,
    type: "stop_live",
    deviceId: "incommand-web-test",
    room: "vid-livetest1",
    channelId: "livetest1",
    timestamp: Date.now(),
  });
  client.publish(TOPIC, payload, { qos: 1 }, (err) => {
    if (err) console.error("publish failed", err);
    else console.log("published stop_live to", TOPIC);
    setTimeout(() => client.end(), 1000);
  });
});
client.on("error", (e) => console.error("mqtt error", e));
