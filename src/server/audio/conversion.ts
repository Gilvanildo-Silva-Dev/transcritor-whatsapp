import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MAX_AUDIO_BYTES, validateAudioFile } from "../../lib/audio/validation";
import { TranscriptionError } from "./errors";


type Execute = (executable: string, args: string[], signal?: AbortSignal) => Promise<void>;
const executeFfmpeg: Execute = async (executable, args, signal) => {
  try {
    await new Promise<void>((resolve, reject) => {
      let failure: Error | null = null;
      const child = execFile(executable, args, { timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024, windowsHide: true, signal }, (error) => { failure = error; });
      child.once("error", (error) => { failure = error; });
      // Aguarda o processo fechar antes de remover arquivos (inclusive no Windows).
      child.once("close", () => { if (failure) reject(failure); else resolve(); });
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new TranscriptionError("A conversão deste formato precisa do FFmpeg no servidor. Configure FFMPEG_PATH e tente novamente.", 503);
    if ((error as { killed?: boolean }).killed) throw new TranscriptionError("A conversão excedeu 120 segundos. Tente um áudio menor.", 504);
    throw new TranscriptionError("Não foi possível converter o áudio. O arquivo pode estar corrompido ou não conter uma faixa de áudio.", 422);
  }
};

/** Dependencias substituiveis para verificar conversao e limpeza sem executar binarios nos testes. */
export function createAudioConverter({ execute = executeFfmpeg, temporaryRoot = tmpdir() }: { execute?: Execute; temporaryRoot?: string } = {}) {
  return async function convert(file: File, signal?: AbortSignal): Promise<Buffer> {
    const validation = await validateAudioFile(file);
    if (!validation.ok) throw new TranscriptionError(validation.error, file.size > MAX_AUDIO_BYTES ? 413 : 422);
    signal?.throwIfAborted();
    const directory = await mkdtemp(join(temporaryRoot, "transcritor-audio-"));
    const input = join(directory, `input.${validation.details.extension}`);
    const output = join(directory, "output.wav");
    try {
      await writeFile(input, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
      await execute(process.env.FFMPEG_PATH || "ffmpeg", [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
        "-protocol_whitelist", "file,pipe", "-i", input,
        "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1",
        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        "-fs", String(MAX_AUDIO_BYTES), output,
      ], signal);
      signal?.throwIfAborted();
      const result = await stat(output);
      // -fs pode encerrar com sucesso e truncar a saida; nao transcrever audio parcial.
      if (result.size >= MAX_AUDIO_BYTES - 64 * 1024) throw new TranscriptionError("O WAV convertido excede o limite da transcrição. Divida o áudio em partes menores.", 413);
      const buffer = await readFile(output);
      const converted = await validateAudioFile(new File([new Uint8Array(buffer)], "audio.wav"));
      if (!converted.ok) throw new TranscriptionError("A conversão não produziu um WAV válido.", 422);
      return buffer;
    } finally {
      const removals = await Promise.allSettled([input, output].map(async (path) => {
        try { await unlink(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }));
      // Sem exclusao recursiva: apenas arquivos conhecidos no diretorio exclusivo.
      await rmdir(directory);
      if (removals.some((result) => result.status === "rejected")) throw new TranscriptionError("Não foi possível concluir a limpeza dos arquivos temporários.", 500);
    }
  };
}

export const convertAudioToWav = createAudioConverter();

