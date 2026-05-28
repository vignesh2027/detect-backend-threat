import http from "http";
import { createApp } from "./server";
import { attachWebSocketServer } from "./ws";

const PORT = parseInt(process.env.PORT ?? "4000", 10);

const app = createApp();
const server = http.createServer(app);
attachWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`ingest: listening on :${PORT}`);
  console.log(
    `ingest: REST POST /events | WebSocket ws://...:${PORT}/ws/events`
  );
});

process.on("SIGTERM", () => {
  console.log("ingest: shutting down");
  server.close(() => process.exit(0));
});
