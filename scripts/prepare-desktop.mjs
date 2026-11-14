import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { cp, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

if (process.platform !== "win32" || process.arch !== "x64") throw new Error("O empacotamento atual requer Windows x64.");
if (Number(process.versions.node.split(".")[0]) >= 24 && !process.execArgv.includes("--use-system-ca")) {
  const result = spawnSync(process.execPath, ["--use-system-ca", fileURLToPath(import.meta.url)], { stdio: "inherit", windowsHide: true });
  process.exit(result.status ?? 1);
}
const root = process.cwd();
const stage = resolve(root, ".desktop-build");
const resources = join(stage, "resources");
const run = (command, args, environment = {}) => {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...environment }, stdio: "inherit", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error("Uma etapa de preparacao desktop falhou.");
};
async function resetGenerated(directory) {
  const target = resolve(directory);
  const path = relative(stage, target);
  if (!path || path.startsWith(".." + sep) || isAbsolute(path) || !target.startsWith(stage + sep)) throw new Error("Diretorio de build inesperado.");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
}
const pythonVersion = "3.14.7";
const embeddedRoot = join(stage, "python-embedded");
const pythonRoot = join(resources, "python");
await mkdir(resources, { recursive: true });
if (!existsSync(join(root, ".venv", "Scripts", "python.exe")) || !existsSync(join(root, ".local-models", "whisper-base", "model.bin"))) run(process.execPath, ["scripts/setup-local.mjs"]);
const pythonAbi = execFileSync(join(root, ".venv", "Scripts", "python.exe"), ["-c", "import sys,struct; print(str(sys.version_info.major)+'.'+str(sys.version_info.minor)+'-'+str(struct.calcsize('P')*8))"], { encoding: "utf8", windowsHide: true }).trim();
if (pythonAbi !== "3.14-64") throw new Error("Para gerar o desktop, recrie .venv com Python 3.14 x64 e execute npm run setup:local. O runtime portatil usa essa ABI.");
console.log("Compilando interface e backend interno...");
run(process.execPath, ["node_modules/next/dist/bin/next", "build"]);
await resetGenerated(join(resources, "server"));
await cp(join(root, ".next", "standalone"), join(resources, "server"), {
  recursive: true, dereference: true,
  filter: (path) => !path.split(/[\\/]/).some((segment) => segment.startsWith(".env") || [".git", ".venv", ".local-models", ".local-cache", ".desktop-build", "dist-desktop", "tests", "test-results", "playwright-report"].includes(segment)),
});
await cp(join(root, ".next", "static"), join(resources, "server", ".next", "static"), { recursive: true });
await cp(join(root, "public"), join(resources, "server", "public"), { recursive: true });

const zip = join(root, ".local-cache", `python-${pythonVersion}-embed-amd64.zip`);
if (!existsSync(zip)) {
  console.log("Baixando Python portatil oficial...");
  await mkdir(dirname(zip), { recursive: true });
  const response = await fetch(`https://www.python.org/ftp/python/${pythonVersion}/python-${pythonVersion}-embed-amd64.zip`, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error("Nao foi possivel baixar o Python portatil oficial.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 5 * 1024 * 1024 || bytes.toString("ascii", 0, 2) !== "PK") throw new Error("Arquivo Python portatil invalido.");
  await writeFile(zip + ".part", bytes);
  await rename(zip + ".part", zip);
}
if (!existsSync(join(embeddedRoot, "python.exe"))) {
  await mkdir(embeddedRoot, { recursive: true });
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:DESKTOP_PYTHON_ZIP -DestinationPath $env:DESKTOP_PYTHON_DEST -Force"], { DESKTOP_PYTHON_ZIP: zip, DESKTOP_PYTHON_DEST: embeddedRoot });
}
const requirements = await readFile(join(root, "requirements-local.in"));
const runtimeStamp = createHash("sha256").update(requirements).update(pythonVersion).digest("hex");
const marker = join(pythonRoot, "desktop-runtime.json");
let installed;
try { installed = JSON.parse(await readFile(marker, "utf8")).stamp; } catch { installed = null; }
if (installed !== runtimeStamp) {
  console.log("Preparando Python e bibliotecas portateis...");
  await resetGenerated(pythonRoot);
  await cp(embeddedRoot, pythonRoot, { recursive: true });
  const site = join(root, ".venv", "Lib", "site-packages");
  await mkdir(join(pythonRoot, "Lib", "site-packages"), { recursive: true });
  await cp(site, join(pythonRoot, "Lib", "site-packages"), {
    recursive: true,
    filter: (path) => {
      const parts = relative(site, path).split(/[\\/]/);
      return !parts.some((part) => ["__pycache__", "tests", "test"].includes(part)) && !/^pip(?:-|$)/.test(parts[0]) && !/\.(?:pyc|wav|ogg|opus|mp3|m4a|webm|flac|aac|mp4)$/i.test(path);
    },
  });
  await writeFile(join(pythonRoot, "python314._pth"), "python314.zip\n.\nLib\\site-packages\nimport site\n");
  await writeFile(marker, JSON.stringify({ python: pythonVersion, stamp: runtimeStamp }));
}
console.log("Verificando runtime portatil sem depender do Python instalado...");
run(join(pythonRoot, "python.exe"), ["-I", "-c", "import faster_whisper, ctranslate2, av, onnxruntime; print('Runtime portatil: OK')"]);
const modelRoot = join(resources, "models", "whisper-base");
await mkdir(modelRoot, { recursive: true });
for (const name of ["config.json", "model.bin", "tokenizer.json", "vocabulary.txt"]) await copyFile(join(root, ".local-models", "whisper-base", name), join(modelRoot, name));
const hash = createHash("sha256");
for await (const chunk of createReadStream(join(modelRoot, "model.bin"))) hash.update(chunk);
if (hash.digest("hex") !== "d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9") throw new Error("Modelo portatil divergente.");
await mkdir(join(resources, "backend"), { recursive: true });
for (const name of ["server.cjs", "security.cjs"]) await copyFile(join(root, "desktop", name), join(resources, "backend", name));
await copyFile(join(root, "scripts", "transcribe-local.py"), join(resources, "backend", "transcribe-local.py"));
const scriptHashes = new Set();
async function collectScripts(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectScripts(path);
    else if (entry.name.endsWith(".html")) {
      const html = await readFile(path, "utf8");
      for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if (match[1].trim()) scriptHashes.add(`'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
    }
  }
}
await collectScripts(join(resources, "server", ".next", "server", "app"));
const csp = `default-src 'self'; script-src 'self' ${[...scriptHashes].join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;
await writeFile(join(resources, "desktop-security.json"), JSON.stringify({ csp }));
console.log("Gerando icone do aplicativo...");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0">${await readFile(join(root, "desktop", "assets", "icon.svg"), "utf8")}</body></html>`);
  const png = await page.locator("svg").screenshot({ omitBackground: true });
  await writeFile(join(resources, "icon.png"), png);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  await writeFile(join(stage, "icon.ico"), Buffer.concat([header, png]));
} finally { await browser.close(); }
await writeFile(join(resources, "desktop-manifest.json"), JSON.stringify({ name: "Transcritor de Áudios WhatsApp", platform: "win32-x64", python: pythonVersion, model: "whisper-base", offline: true }));
console.log("Recursos desktop prontos. Execute npm run desktop ou npm run desktop:build.");
