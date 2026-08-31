const io = require("socket.io-client");
const sessionId = process.argv[2];
const actions = process.argv.slice(3);
const h = io("http://localhost:3000/session", {
  path: "/socket",
  transports: ["websocket"],
  query: { role: "host", sessionId },
});
h.on("state", (s) =>
  console.log(`HOST: phase=${s.phase} roster=${(s.roster || []).length} q=${s.questionIndex}/${s.questionCount}`)
);
let i = 0;
setInterval(() => {
  if (i < actions.length) {
    console.log(`--> ${actions[i]}`);
    h.emit(actions[i]);
    i++;
  }
}, 2000);
