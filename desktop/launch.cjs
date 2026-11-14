const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const root = join(__dirname, "..");
if (!existsSync(join(root, ".desktop-build", "resources", "server", "server.js"))) {
  console.error("Prepare o aplicativo com npm run desktop:prepare antes de iniciar.");
  process.exit(1);
}
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [join(__dirname, "main.cjs")], { cwd: root, env: environment, stdio: "inherit", windowsHide: true });
child.on("error", () => { console.error("Não foi possível abrir o aplicativo desktop."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code || 0; });
