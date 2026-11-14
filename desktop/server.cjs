const http = require("node:http");
const { syncBuiltinESMExports } = require("node:module");
const { pathToFileURL } = require("node:url");
const { protectServer } = require("./security.cjs");

const token = process.env.TRANSCRITOR_DESKTOP_TOKEN;
const origin = `http://127.0.0.1:${process.env.PORT}`;
if (!token || !process.env.TRANSCRITOR_SERVER_ENTRY) process.exit(1);
const createServer = http.createServer;
http.createServer = function (...args) { return protectServer(createServer.apply(this, args), token, origin); };
syncBuiltinESMExports();
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const jobs = process.__transcritorDesktopJobs;
  for (const controller of jobs || []) controller.abort(new Error("Desktop closed."));
  const until = Date.now() + 6000;
  while (jobs?.size && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50));
  process.exit(0);
}
process.parentPort?.on("message", (event) => { if (event.data?.type === "shutdown") void shutdown(); });
process.parentPort?.on("close", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
import(pathToFileURL(process.env.TRANSCRITOR_SERVER_ENTRY).href).catch(() => {
  process.parentPort?.postMessage({ type: "startup-error" });
  process.exit(1);
});
