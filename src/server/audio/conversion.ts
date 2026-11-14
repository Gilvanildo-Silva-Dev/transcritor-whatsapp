import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { validateAudioFile } from "../../lib/audio/validation";

const run = promisify(execFile);
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

/** Preparado para uso futuro em runtime Node.js. Nao esta ligado a nenhuma rota ou interface. */
export async function convertAudioToWav(file: File): Promise<Buffer> {
  const validation = await validateAudioFile(file);
  if (!validation.ok) throw new Error(validation.error);
  const directory = await mkdtemp(join(tmpdir(), "transcritor-audio-"));
  const input = join(directory, `input.${validation.details.extension}`);
  const output = join(directory, "output.wav");
  try {
    await writeFile(input, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
    try {
      await run(process.env.FFMPEG_PATH || "ffmpeg", [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
        "-protocol_whitelist", "file,pipe", "-i", input,
        "-map", "0:a:0", "-vn", "-sn", "-dn",
        "-map_metadata", "-1", "-ac", "1", "-ar", "16000",
        "-c:a", "pcm_s16le", "-fs", String(MAX_OUTPUT_BYTES), output,
      ], { timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024, windowsHide: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new Error("FFmpeg não está disponível no servidor. Configure FFMPEG_PATH ou instale o executável no PATH.");
      if ((error as { killed?: boolean }).killed) throw new Error("A conversão excedeu o tempo máximo de 120 segundos.");
      throw new Error("Não foi possível converter o áudio. O arquivo pode estar corrompido ou não conter uma faixa de áudio.");
    }
    const result = await stat(output);
    // O limite do FFmpeg pode encerrar com sucesso e produzir um arquivo truncado.
    if (result.size >= MAX_OUTPUT_BYTES - 64 * 1024) throw new Error("O áudio convertido excede o limite de saída de 128 MB.");
    const buffer = await readFile(output);
    if (buffer.length <= 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("A conversão não produziu um WAV válido.");
    return buffer;
  } finally {
    // Remove somente os dois arquivos conhecidos e o diretorio exclusivo, sem exclusao recursiva.
    await Promise.all([input, output].map(async (path) => {
      try { await unlink(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }));
    await rmdir(directory);
  }
}
