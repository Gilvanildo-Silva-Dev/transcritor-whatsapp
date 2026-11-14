import nextEnv from "@next/env";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Usa a cadeia de certificados do sistema sem desativar verificacao TLS.
if (Number(process.versions.node.split(".")[0]) >= 24 && !process.execArgv.includes("--use-system-ca")) {
  const result = spawnSync(process.execPath, ["--use-system-ca", fileURLToPath(import.meta.url)], { stdio: "inherit", windowsHide: true });
  process.exit(result.status ?? 1);
}
const root = process.cwd();
nextEnv.loadEnvConfig(root);
const python = process.env.LOCAL_PYTHON_PATH?.trim() || join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const execute = (command, args) => {
  const environment = { ...process.env, PYTHONIOENCODING: "utf-8" };
  delete environment.OPENAI_API_KEY;
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true, env: environment });
  if (result.error || result.status !== 0) throw new Error("Falha ao preparar o Python local. Verifique a instalacao do Python.");
};
try {
  if (!process.env.LOCAL_PYTHON_PATH && !existsSync(python)) execute(process.env.PYTHON_BOOTSTRAP || (process.platform === "win32" ? "python" : "python3"), ["-m", "venv", ".venv"]);
  console.log("Instalando dependencias do Whisper local...");
  execute(python, ["-m", "pip", "install", "--only-binary=:all:", "-r", "requirements-local.in"]);
  const modelDir = process.env.LOCAL_MODEL_PATH || join(root, ".local-models", "whisper-base");
  await mkdir(modelDir, { recursive: true });
  for (const name of ["config.json", "tokenizer.json", "vocabulary.txt", "model.bin"]) {
    const destination = join(modelDir, name);
    if (existsSync(destination)) continue;
    console.log(`Baixando ${name} do modelo publico Whisper base...`);
    const partial = destination + ".part";
    let handle;
    try {
      const response = await fetch(`https://huggingface.co/Systran/faster-whisper-base/resolve/main/${name}?download=true`, { signal: AbortSignal.timeout(600_000) });
      if (!response.ok || !response.body) throw new Error("Download indisponivel.");
      handle = await open(partial, "w");
      const hash = createHash("sha256");
      let bytes = 0;
      let lastProgress = 0;
      for await (const chunk of response.body) {
        await handle.write(chunk);
        hash.update(chunk);
        bytes += chunk.byteLength;
        if (bytes - lastProgress >= 25 * 1024 * 1024) { console.log(`${name}: ${Math.round(bytes / 1024 / 1024)} MB baixados`); lastProgress = bytes; }
      }
      await handle.close(); handle = undefined;
      if (name === "model.bin" && (bytes !== 145217532 || hash.digest("hex") !== "d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9")) throw new Error("Os pesos baixados estao incompletos ou divergentes.");
      if (!bytes) throw new Error("O download retornou arquivo vazio.");
      await rename(partial, destination);
    } finally {
      await handle?.close();
      try { await unlink(partial); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
  console.log("Modelo pronto. Execute npm run dev e selecione seu audio em http://localhost:3000.");
} catch {
  console.error("A configuracao local nao foi concluida. Verifique Python, conexao e espaco e execute npm run setup:local novamente.");
  process.exitCode = 1;
}


