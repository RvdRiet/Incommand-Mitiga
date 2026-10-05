const { RoomServiceClient } = require("livekit-server-sdk");

const client = new RoomServiceClient("http://192.168.80.189:7880", "devkey", "secret");

(async () => {
  const rooms = await client.listRooms();
  console.log("rooms:", rooms.map((r) => ({ name: r.name, numParticipants: r.numParticipants })));
  for (const r of rooms) {
    const participants = await client.listParticipants(r.name);
    console.log(`room ${r.name} participants:`, participants.map((p) => ({
      identity: p.identity,
      tracks: p.tracks.map((t) => ({ source: t.source, type: t.type, muted: t.muted })),
    })));
  }
})();
