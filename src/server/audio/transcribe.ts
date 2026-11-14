import "server-only";

import OpenAI from "openai";
import { MAX_AUDIO_BYTES, validateAudioFile } from "../../lib/audio/validation";
import { convertAudioToWav } from "./conversion";
import { TranscriptionError } from "./errors";

const MAX_MULTIPART_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const createClient = (apiKey: string) => new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", timeout: 120_000, maxRetries: 0 });
type Dependencies = {
  getApiKey?: () => string | undefined;
  clientFactory?: (apiKey: string) => OpenAI;
  convert?: typeof convertAudioToWav;
};

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
  } finally { signal.removeEventListener("abort", cancelRead); reader.releaseLock(); }
  try { return await new Response(new Blob(chunks), { headers: { "content-type": contentType } }).formData(); }
  catch { throw new TranscriptionError("O formulário de envio está inválido. Selecione o áudio novamente.", 400); }
}

function canRetryWithConversion(error: unknown): boolean {
  return error instanceof OpenAI.APIError && [400, 415, 422].includes(error.status ?? 0) &&
    (/(unsupported|invalid)_(audio_)?(format|codec)|audio_decoding_error/.test(error.code ?? "") ||
     /unsupported (audio |file )?(format|codec)|format.*not supported|could not decode|failed to decode/i.test(error.message));
}

function publicError(error: unknown): { message: string; status: number } {
  if (error instanceof TranscriptionError) return { message: error.message, status: error.status };
  if (error instanceof OpenAI.APIConnectionTimeoutError) return { message: "A OpenAI demorou para responder. Tente novamente ou use um áudio menor.", status: 504 };
  if (error instanceof OpenAI.APIConnectionError) return { message: "Não foi possível conectar à OpenAI. Verifique a conexão do servidor e tente novamente.", status: 502 };
  if (error instanceof OpenAI.APIError) {
    if ([401, 403].includes(error.status ?? 0)) return { message: "A OpenAI recusou as credenciais ou o acesso ao modelo. Verifique OPENAI_API_KEY e as permissões no servidor.", status: 503 };
    if (error.status === 429) return { message: "A OpenAI atingiu o limite de uso ou de créditos. Verifique o saldo e tente novamente mais tarde.", status: 429 };
    if (error.status === 404) return { message: "O modelo gpt-transcribe não está disponível para esta configuração da API.", status: 503 };
    if ([400, 413, 415, 422].includes(error.status ?? 0)) return { message: "A OpenAI não conseguiu processar este áudio. Verifique o formato, a integridade e o tamanho do arquivo.", status: error.status === 413 ? 413 : 422 };
    return { message: "O serviço de transcrição está indisponível. Tente novamente mais tarde.", status: 502 };
  }
  return { message: "Não foi possível concluir a transcrição. Tente novamente.", status: 500 };
}

export function createTranscribeHandler({ getApiKey = () => process.env.OPENAI_API_KEY, clientFactory = createClient, convert = convertAudioToWav }: Dependencies = {}) {
  return async function transcribe(request: Request): Promise<Response> {
    const deadline = AbortSignal.timeout(270_000);
    const signal = AbortSignal.any([request.signal, deadline]);
    try {
      const form = await readMultipart(request, signal);
      const entries = form.getAll("file");
      const allFiles = [...form.values()].filter((entry) => typeof entry !== "string");
      if (entries.length !== 1 || !(entries[0] instanceof File) || allFiles.length !== 1) throw new TranscriptionError("Envie exatamente um arquivo de áudio no campo file.", 400);
      const file = entries[0];
      const validation = await validateAudioFile(file);
      if (!validation.ok) throw new TranscriptionError(validation.error, file.size > MAX_AUDIO_BYTES ? 413 : 422);
      const apiKey = getApiKey()?.trim();
      if (!apiKey) throw new TranscriptionError("A transcrição ainda não está configurada. Defina OPENAI_API_KEY em .env.local no servidor.", 503);
      signal.throwIfAborted();
      const client = clientFactory(apiKey);
      let converted = false;
      const prepareWav = async () => {
        const buffer = await convert(file, signal);
        signal.throwIfAborted();
        if (buffer.byteLength > MAX_AUDIO_BYTES) throw new TranscriptionError("O áudio convertido excede o limite de 25 MB. Divida-o em partes menores.", 413);
        converted = true;
        return new File([new Uint8Array(buffer)], "audio.wav", { type: "audio/wav" });
      };
      // OPUS exportado pelo WhatsApp recebe uma extensao aceita apos conversao real.
      let upload = validation.details.extension === "opus" ? await prepareWav() :
        new File([file], `audio.${validation.details.extension}`, { type: validation.details.mime.split(";")[0] });
      const send = () => client.audio.transcriptions.create({
        file: upload,
        model: "gpt-transcribe",
        languages: ["pt"],
        prompt: "Transcrição fiel de uma mensagem de voz, normalmente em português brasileiro. Preserve o idioma original, os nomes próprios e a pontuação natural. Não traduza nem acrescente conteúdo ausente do áudio.",
        response_format: "json",
      }, { signal });
      let result;
      try { result = await send(); }
      catch (error) {
        if (converted || !canRetryWithConversion(error)) throw error;
        upload = await prepareWav();
        result = await send();
      }
      if (!result.text?.trim()) throw new TranscriptionError("Não foi possível identificar fala neste áudio. Verifique a gravação e tente novamente.", 422);
      return json({ text: result.text.trim() });
    } catch (error) {
      if (request.signal.aborted) return json({ error: "Transcrição cancelada." }, 499);
      if (deadline.aborted) return json({ error: "A transcrição excedeu o tempo máximo. Tente um áudio menor." }, 504);
      const failure = publicError(error);
      return json({ error: failure.message }, failure.status);
    }
  };
}

