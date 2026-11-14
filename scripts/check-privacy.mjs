import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const git = (args, input) => execFileSync("git", args, { encoding: "utf8", input, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
const blocked = /\.(?:ogg|opus|mp3|m4a|wav|webm|aac|flac|mp4|mpeg|mpga|txt|pem|key|p12|pfx|bin|onnx|safetensors)$/i;
const keyPattern = /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/;
function localKeys() {
  const keys = [];
  if (process.env.OPENAI_API_KEY?.length >= 12) keys.push(process.env.OPENAI_API_KEY.trim());
  if (existsSync(".env.local")) {
    const line = readFileSync(".env.local", "utf8").match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.*)$/m)?.[1]?.trim();
    const key = line?.startsWith('"') || line?.startsWith("'") ? line.slice(1, line.lastIndexOf(line[0])) : line?.split(/\s+#/)[0]?.trim();
    if (key?.length >= 12) keys.push(key);
  }
  return keys;
}

/** O relatorio nunca inclui valores de chaves ou conteudo dos arquivos. */
export function auditRepositoryPrivacy({ history = false, browserBuild = false } = {}) {
  const secrets = localKeys();
  const issues = [];
  const check = (path, content, scope) => {
    if ((/(^|\/)\.env(?:\.|$)/.test(path) && path !== ".env.example") || blocked.test(path) || /(^|\/)(uploads|recordings|transcriptions|transcricoes|private|\.venv|\.local-models|\.local-cache)\//.test(path)) {
      issues.push({ scope, reason: "arquivo privado ou formato de saída/mídia" }); return;
    }
    if (content && (keyPattern.test(content) || secrets.some((key) => content.includes(key)))) issues.push({ scope, reason: "possível credencial" });
  };
  const files = [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))];
  for (const path of files) {
    check(path, existsSync(path) && !blocked.test(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : "", "working-tree");
  }
  let indexBlobs = 0;
  for (const entry of git(["ls-files", "--stage", "-z"]).split("\0").filter(Boolean)) {
    const separator = entry.indexOf("\t");
    const path = entry.slice(separator + 1);
    const id = entry.slice(0, separator).split(" ")[1];
    indexBlobs++;
    check(path, blocked.test(path) ? "" : git(["cat-file", "blob", id]), "index");
  }
  let historyBlobs = 0;
  if (history) {
    const objects = git(["rev-list", "--objects", "--all"]).trim().split("\n").filter(Boolean).map((line) => ({ id: line.split(" ")[0], path: line.slice(line.indexOf(" ") + 1) }));
    const types = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], objects.map((object) => object.id).join("\n") + "\n").trim().split("\n");
    objects.forEach((object, index) => {
      if (!types[index]?.endsWith(" blob")) return;
      historyBlobs++;
      check(object.path, blocked.test(object.path) ? "" : git(["cat-file", "blob", object.id]), "history");
    });
  }
  let browserFiles = 0;
  if (browserBuild && existsSync(".next/static")) {
    const inspect = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) inspect(path);
        else if (/\.(?:js|json|map)$/.test(entry.name)) { browserFiles++; check(path.replaceAll("\\", "/"), readFileSync(path, "utf8"), "browser-build"); }
      }
    };
    inspect(".next/static");
  }
  if (!existsSync(".env.example")) issues.push({ scope: "example", reason: "arquivo de exemplo ausente" });
  if (existsSync(".env.example")) {
    const example = readFileSync(".env.example", "utf8");
    if (!/^OPENAI_API_KEY=\s*$/m.test(example)) issues.push({ scope: "example", reason: "OPENAI_API_KEY precisa estar vazia no exemplo" });
  }
  const ignored = git(["check-ignore", ".env.local", "privacy-check.wav", "privacy-check.opus", "privacy-check.txt"]).trim().split("\n");
  if (ignored.length !== 4) issues.push({ scope: "ignore", reason: "arquivo sensível sem regra de exclusão" });
  return { ok: issues.length === 0, candidateFiles: files.length, indexBlobs, historyBlobs, browserFiles, issues };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditRepositoryPrivacy({ history: process.argv.includes("--history"), browserBuild: process.argv.includes("--build") });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}



