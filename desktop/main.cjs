const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, utilityProcess } = require("electron");
const { randomBytes } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } = require("node:fs");
const { mkdtemp, readdir, rmdir, unlink } = require("node:fs/promises");
const { createServer } = require("node:net");
const { join, resolve, basename } = require("node:path");
const { parseEnv } = require("node:util");
const { execFile } = require("node:child_process");
const { isSameOrigin, validTheme } = require("./security.cjs");

const { chooseAudio } = require("./audio-picker.cjs");
let choosingAudio = false;
const product = "Transcritor de Áudios WhatsApp";
app.setName(product);
if (process.env.TRANSCRITOR_DESKTOP_TEST === "1" && process.env.TRANSCRITOR_DESKTOP_PROFILE) app.setPath("userData", resolve(process.env.TRANSCRITOR_DESKTOP_PROFILE));
let window;
let service;
let origin;
let sessionDirectory;
let closing = false;
let shutdownPromise;
let savedTheme = "system";
const testMode = process.env.TRANSCRITOR_DESKTOP_TEST === "1";
const themePath = () => join(app.getPath("userData"), "preferences.json");

function resources() { return app.isPackaged ? process.resourcesPath : join(__dirname, "..", ".desktop-build", "resources"); }
function loadPreferences() {
  mkdirSync(app.getPath("userData"), { recursive: true });
  try { savedTheme = validTheme(JSON.parse(readFileSync(themePath(), "utf8")).theme); } catch { savedTheme = "system"; }
}
function saveTheme(theme) {
  savedTheme = validTheme(theme);
  const temporary = themePath() + ".tmp";
  writeFileSync(temporary, JSON.stringify({ theme: savedTheme }), { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, themePath());
}
function configuredEnvironment() {
  const environment = { ...process.env };
  const configPath = app.isPackaged ? join(app.getPath("userData"), "config.env") : join(__dirname, "..", ".env.local");
  try {
    const config = parseEnv(readFileSync(configPath, "utf8"));
    for (const key of ["OPENAI_API_KEY", "FFMPEG_PATH"]) if (typeof config[key] === "string") environment[key] = config[key];
  } catch { /* O motor gratuito nao precisa de chave nem arquivo de configuracao. */ }
  if (testMode) environment.OPENAI_API_KEY = "";
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.NODE_OPTIONS;
  return environment;
}
async function freePort() {
  const listener = createServer();
  await new Promise((resolvePort, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolvePort); });
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  return port;
}
async function cleanTemporaryDirectory() {
  if (!sessionDirectory || !basename(sessionDirectory).startsWith("transcritor-desktop-")) return;
  for (const entry of await readdir(sessionDirectory, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !/^transcritor-(local|audio)-/.test(entry.name)) continue;
    const directory = join(sessionDirectory, entry.name);
    for (const file of await readdir(directory).catch(() => [])) {
      if (/^(input\.(ogg|opus|mp3|m4a|wav|webm)|output\.wav)$/.test(file)) await unlink(join(directory, file)).catch(() => {});
    }
    await rmdir(directory).catch(() => {});
  }
  await rmdir(sessionDirectory).catch(() => {});
}
async function stopService() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    if (service?.pid) {
      await new Promise((done) => {
        const timer = setTimeout(() => {
          const pid = service?.pid;
          if (pid && process.platform === "win32") execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => done());
          else { service?.kill(); done(); }
        }, 8000);
        service.once("exit", () => { clearTimeout(timer); done(); });
        service.postMessage({ type: "shutdown" });
      });
    }
    await cleanTemporaryDirectory();
  })();
  return shutdownPromise;
}
async function startService() {
  const root = resources();
  const serverEntry = join(root, "server", "server.js");
  const python = join(root, "python", "python.exe");
  if (!existsSync(serverEntry) || !existsSync(python) || !existsSync(join(root, "models", "whisper-base", "model.bin"))) throw new Error("MISSING_RESOURCES");
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  const token = randomBytes(32).toString("hex");
  sessionDirectory = await mkdtemp(join(app.getPath("temp"), "transcritor-desktop-"));
  const environment = {
    ...configuredEnvironment(), NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port),
    NEXT_TELEMETRY_DISABLED: "1", TRANSCRITOR_DESKTOP_RUNTIME: "1", TRANSCRITOR_DESKTOP_TOKEN: token,
    TRANSCRITOR_SERVER_ENTRY: serverEntry, TRANSCRITOR_TEMP_DIR: sessionDirectory,
    LOCAL_PYTHON_PATH: python, LOCAL_MODEL_PATH: join(root, "models", "whisper-base"),
    LOCAL_TRANSCRIBE_SCRIPT: join(root, "backend", "transcribe-local.py"),
  };
  service = utilityProcess.fork(join(root, "backend", "server.cjs"), [], { env: environment, cwd: join(root, "server"), stdio: "ignore", serviceName: "Transcritor local" });
  let serviceExited = false;
  service.on("exit", () => {
    serviceExited = true;
    if (!closing && window && !window.isDestroyed()) {
      dialog.showErrorBox(product, "O motor local foi encerrado. Feche e abra o aplicativo para tentar novamente.");
      app.quit();
    }
  });
  let ready = false;
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    if (serviceExited) throw new Error("SERVER_EXITED");
    if (!service.pid) await new Promise((done) => setTimeout(done, 100));
    try {
      const response = await fetch(origin + "/api/health", { headers: { "x-transcritor-desktop-token": token }, signal: AbortSignal.timeout(1200) });
      if (response.ok && (await response.json()).service === "transcritor-whatsapp") { ready = true; break; }
    } catch { /* Aguarda somente o servidor desta instancia. */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!ready) throw new Error("SERVER_START_FAILED");
  return token;
}
function createWindow(token) {
  window = new BrowserWindow({
    width: 1280, height: 900, minWidth: 780, minHeight: 620, title: product,
    show: false, icon: join(resources(), "icon.png"), backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b1412" : "#f7f9f8",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, spellcheck: false, devTools: !app.isPackaged || testMode,
      additionalArguments: [`--transcritor-theme=${savedTheme}`],
    },
  });
  const session = window.webContents.session;
  const security = JSON.parse(readFileSync(join(resources(), "desktop-security.json"), "utf8"));
  session.webRequest.onHeadersReceived({ urls: [origin + "/*"] }, (details, done) => done({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [security.csp], "X-Content-Type-Options": ["nosniff"], "Referrer-Policy": ["no-referrer"] } }));
  session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (details, done) => done({ cancel: !isSameOrigin(details.url, origin) }));
  session.webRequest.onBeforeSendHeaders({ urls: [origin + "/*"] }, (details, done) => done({ requestHeaders: { ...details.requestHeaders, "x-transcritor-desktop-token": token } }));
  const permissionAllowed = (contents, permission) => Boolean(contents && isSameOrigin(contents.getURL(), origin) && ["clipboard-sanitized-write", "clipboard-write"].includes(permission));
  session.setPermissionRequestHandler((contents, permission, done) => done(permissionAllowed(contents, permission)));
  session.setPermissionCheckHandler((contents, permission) => permissionAllowed(contents, permission));
  session.on("will-download", (event, item) => {
    if (!item.getURL().startsWith(`blob:${origin}/`) || !item.getFilename().toLowerCase().endsWith(".txt")) { event.preventDefault(); return; }
    item.setSaveDialogOptions({ title: "Salvar transcrição", filters: [{ name: "Texto", extensions: ["txt"] }] });
  });
  window.webContents.on("will-navigate", (event, url) => { if (!isSameOrigin(url, origin)) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.once("ready-to-show", () => { if (!testMode) window.show(); });
  window.on("closed", () => { window = null; });
  return window.loadURL(origin);
}
ipcMain.handle("desktop:audio:select", async (event) => {
  if (!window || event.sender !== window.webContents || !event.senderFrame || event.senderFrame.parent !== null || !isSameOrigin(event.senderFrame.url, origin)) throw new Error("Invalid request.");
  if (choosingAudio) return null;
  choosingAudio = true;
  try { return await chooseAudio(dialog, window, app.getPath("desktop")); }
  finally { choosingAudio = false; }
});
ipcMain.handle("desktop:theme:set", (event, theme) => {
  if (!window || event.sender !== window.webContents || (!event.senderFrame || event.senderFrame.parent !== null) || !isSameOrigin(event.senderFrame.url, origin) || !["light", "dark", "system"].includes(theme)) throw new Error("Invalid request.");
  saveTheme(theme);
});
function configureMenu() { Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: "Arquivo", submenu: [{ role: "quit", label: "Sair" }] },
  { label: "Editar", submenu: [{ role: "undo", label: "Desfazer" }, { role: "redo", label: "Refazer" }, { type: "separator" }, { role: "cut", label: "Recortar" }, { role: "copy", label: "Copiar" }, { role: "paste", label: "Colar" }, { role: "selectAll", label: "Selecionar tudo" }] },
  { label: "Visualizar", submenu: [{ role: "resetZoom", label: "Tamanho original" }, { role: "zoomIn", label: "Ampliar" }, { role: "zoomOut", label: "Reduzir" }, { role: "togglefullscreen", label: "Tela cheia" }] },
])); }
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    loadPreferences();
    configureMenu();
    try { const token = await startService(); await createWindow(token); }
    catch { if (!testMode) dialog.showErrorBox(product, "Não foi possível iniciar o aplicativo. Verifique a instalação ou tente abri-lo novamente."); app.quit(); }
  });
}
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (closing) return;
  event.preventDefault(); closing = true;
  void stopService().finally(() => app.exit(0));
});

