import "server-only";
import { MAX_AUDIO_BYTES, validateAudioFile } from "../../lib/audio/validation";
import { TranscriptionError } from "./errors";
import { isDigitalSilence } from "./silence";

const MAX_MULTIPART_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
async function readMultipart(request: Request, signal: AbortSignal): Promise<FormData> {
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) throw new TranscriptionError("Envie o áudio como multipart/form-data no campo file.", 415);
  const length = request.headers.get("content-length");
  if (length && Number(length) > MAX_MULTIPART_BYTES) throw new TranscriptionError("O envio excede o limite de 25 MB por áudio.", 413);
  if (!request.body) throw new TranscriptionError("Nenhum arquivo foi recebido.", 400);
  const reader = request.body.getReader();
  const cancelRead = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancelRead, { once: true });
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new TranscriptionError("O envio excede o limite de 25 MB por áudio.", 413);
      }
      chunks.push(value.slice().buffer);
    }
    signal.throwIfAborted();
  } catch (error) {
    if (error instanceof TranscriptionError || signal.aborted) throw error;
    throw new TranscriptionError("O envio foi interrompido ou não pôde ser lido. Selecione o áudio e tente novamente.", 400);
  } finally { signal.removeEventListener("abort", cancelRead); reader.releaseLock(); }
  try { return await new Response(new Blob(chunks), { headers: { "content-type": contentType } }).formData(); }
  catch { throw new TranscriptionError("O formulário de envio está inválido. Selecione o áudio novamente.", 400); }
}

export async function readAudioUpload(request: Request, signal: AbortSignal) {
  const form = await readMultipart(request, signal);
  const entries = form.getAll("file");
  const allFiles = [...form.values()].filter((entry) => typeof entry !== "string");
  if (entries.length !== 1 || !(entries[0] instanceof File) || allFiles.length !== 1) throw new TranscriptionError("Envie exatamente um arquivo de áudio no campo file.", 400);
  const file = entries[0];
  const validation = await validateAudioFile(file);
  if (!validation.ok) throw new TranscriptionError(validation.error, file.size > MAX_AUDIO_BYTES ? 413 : 422);
  if (validation.details.container === "wav" && await isDigitalSilence(file)) throw new TranscriptionError("O áudio contém apenas silêncio digital. Envie uma gravação com fala audível.", 422);
  signal.throwIfAborted();
  return { file, validation };
}
