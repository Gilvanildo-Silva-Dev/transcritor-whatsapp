import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TranscriptionError } from "./errors";
import { readAudioUpload } from "./upload";

const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
type Execute = (python: string, args: string[], signal: AbortSignal) => Promise<string>;
const executePython: Execute = async (python, args, signal) => {
  const environment: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1", HF_HUB_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1", TRANSFORMERS_OFFLINE: "1" };
  delete environment.OPENAI_API_KEY;
  delete environment.HF_TOKEN;
  return new Promise((resolve, reject) => {
    let failure: Error | null = null;
    let output = "";
    const child = execFile(python, args, { env: environment, signal, timeout: 840_000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024, encoding: "utf8", windowsHide: true }, (error, stdout) => { failure = error; output = stdout; });
    child.once("error", (error) => { failure = error; });
    child.once("close", () => {
      if (signal.aborted) { reject(signal.reason); return; }
      if (failure) {
        if ((failure as NodeJS.ErrnoException).code === "ENOENT" || output.includes('"DEPENDENCIES_MISSING"') || output.includes('"MODEL_NOT_READY"')) reject(new TranscriptionError("O motor gratuito precisa ser configurado. Execute npm run setup:local no terminal.", 503));
        else if ((failure as { killed?: boolean }).killed) reject(new TranscriptionError("A transcrição local excedeu o tempo máximo. Tente um áudio menor.", 504));
        else reject(new TranscriptionError("Não foi possível ler ou transcrever este áudio localmente. Verifique o arquivo ou tente MP3/WAV.", 422));
      } else resolve(output);
    });
  });
};

export function createLocalRunner({ execute = executePython, temporaryRoot = tmpdir(), root = process.cwd(), checkSetup = true }: { execute?: Execute; temporaryRoot?: string; root?: string; checkSetup?: boolean } = {}) {
  return async function run(file: File, signal: AbortSignal): Promise<string> {
    const python = process.env.LOCAL_PYTHON_PATH?.trim() || join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    const model = process.env.LOCAL_MODEL_PATH?.trim() || join(root, ".local-models", "whisper-base");
    if (checkSetup && ((!process.env.LOCAL_PYTHON_PATH && !existsSync(/* turbopackIgnore: true */ python)) || !existsSync(/* turbopackIgnore: true */ join(model, "model.bin")))) throw new TranscriptionError("Configure a transcrição gratuita executando npm run setup:local no terminal.", 503);
    signal.throwIfAborted();
    const directory = await mkdtemp(join(temporaryRoot, "transcritor-local-"));
    const extension = file.name.split(".").pop()?.toLowerCase() || "audio";
    const input = join(directory, `input.${extension}`);
    try {
      await writeFile(input, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
      const output = await execute(python, [join(root, "scripts", "transcribe-local.py"), input, "--model-dir", model], signal);
      signal.throwIfAborted();
      let response: unknown;
      try { response = JSON.parse(output); } catch { throw new TranscriptionError("O motor local não retornou uma resposta válida.", 500); }
      if (!response || typeof response !== "object" || !("text" in response) || typeof response.text !== "string") throw new TranscriptionError("O motor local não retornou uma transcrição válida.", 500);
      return response.text.trim();
    } finally {
      try { await unlink(input); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await rmdir(directory);
    }
  };
}

export function createLocalTranscribeHandler({ run = createLocalRunner() }: { run?: (file: File, signal: AbortSignal) => Promise<string> } = {}) {
  let busy = false;
  return async function transcribe(request: Request): Promise<Response> {
    if (busy) return json({ error: "Já há um áudio sendo transcrito neste computador. Aguarde e tente novamente." }, 429);
    busy = true;
    const deadline = AbortSignal.timeout(840_000);
    const signal = AbortSignal.any([request.signal, deadline]);
    try {
      const { file } = await readAudioUpload(request, signal);
      const text = await run(file, signal);
      signal.throwIfAborted();
      if (!text.trim()) throw new TranscriptionError("Não foi identificada fala neste áudio. Tente uma gravação com voz audível.", 422);
      return json({ text: text.trim(), engine: "local" });
    } catch (error) {
      if (request.signal.aborted) return json({ error: "Transcrição local cancelada." }, 499);
      if (deadline.aborted) return json({ error: "A transcrição local excedeu o tempo máximo. Tente um áudio menor." }, 504);
      if (error instanceof TranscriptionError) return json({ error: error.message }, error.status);
      return json({ error: "Não foi possível concluir a transcrição local. Tente novamente." }, 500);
    } finally { busy = false; }
  };
}



