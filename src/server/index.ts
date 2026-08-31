// Custom server entry — hosts Next.js and Socket.IO on one Node process
// Use for `npm run dev` / `npm run start` instead of `next dev`.

import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { registerSessionHandlers } from "./socket/session";

const dev = process.env.NODE_ENV !== "production";
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

async function start() {
  const app = next({ dev });
  const handler = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    handler(req, res);
  });

  const io = new SocketIOServer(httpServer, {
    path: "/socket",
    cors: { origin: true },
  });

  const sessionNS = io.of("/session");
  sessionNS.on("connection", (sock) => registerSessionHandlers(sessionNS, sock));

  httpServer.listen(port, host, () => {
    console.log(`Quran school listening on http://${host}:${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
