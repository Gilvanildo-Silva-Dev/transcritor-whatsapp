const { timingSafeEqual } = require("node:crypto");

function isSameOrigin(url, origin) {
  try { const parsed = new URL(url); return parsed.origin === origin && parsed.protocol === "http:" && !parsed.username && !parsed.password; }
  catch { return false; }
}
function validTheme(value) { return ["light", "dark", "system"].includes(value) ? value : "system"; }
function authorized(request, token, origin) {
  const supplied = request.headers["x-transcritor-desktop-token"];
  if (typeof supplied !== "string" || supplied.length !== token.length || !token.length) return false;
  if (request.headers.host !== new URL(origin).host) return false;
  const suppliedBytes = Buffer.from(supplied);
  const tokenBytes = Buffer.from(token);
  return suppliedBytes.length === tokenBytes.length && timingSafeEqual(suppliedBytes, tokenBytes);
}
function protectServer(server, token, origin) {
  const emit = server.emit;
  server.emit = function (event, ...args) {
    if ((event === "request" || event === "upgrade") && !authorized(args[0], token, origin)) {
      if (event === "request") { args[1].writeHead(403, { "Content-Type": "text/plain", "Cache-Control": "no-store" }); args[1].end("Desktop session required."); }
      else args[1].destroy();
      return true;
    }
    return emit.call(this, event, ...args);
  };
  return server;
}
module.exports = { isSameOrigin, validTheme, authorized, protectServer };
