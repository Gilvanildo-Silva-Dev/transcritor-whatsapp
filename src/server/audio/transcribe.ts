import "server-only";

import OpenAI from "openai";
import { registerDesktopJob } from "./desktop-lifecycle";
import { normalizeLanguage } from "../../lib/transcription/language";
import { MAX_AUDIO_BYTES, validateAudioFile } from "../../lib/audio/validation";
import { convertAudioToWav } from "./conversion";
import { TranscriptionError } from "./errors";
import { isDigitalSilence } from "./silence";
import { readAudioUpload } from "./upload";


const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const createClient = (apiKey: string) => new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", timeout: 120_000, maxRetries: 0 });
type Dependencies = {
  getApiKey?: () => string | undefined;
  clientFactory?: (apiKey: string) => OpenAI;
  convert?: typeof convertAudioToWav;
};

function canRetryWithConversion(error: unknown): boolean {
  return error instanceof OpenAI.APIError && [400, 415, 422].includes(error.status ?? 0) &&
    (/(unsupported|invalid)_(audio_)?(format|codec)|audio_decoding_error/.test(error.code ?? "") ||
     /(unsupported|invalid) (audio |file )?(format|codec)|format.*not supported|could not decode|failed to decode/i.test(error.message));
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
    const desktopJob = registerDesktopJob();
    const deadline = AbortSignal.timeout(270_000);
    const signal = AbortSignal.any([request.signal, deadline, ...(desktopJob ? [desktopJob.signal] : [])]);
    try {
      const { file, validation } = await readAudioUpload(request, signal);
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
        const wav = new File([new Uint8Array(buffer)], "audio.wav", { type: "audio/wav" });
        const checked = await validateAudioFile(wav);
        if (!checked.ok) throw new TranscriptionError("A conversão não produziu um WAV válido.", 422);
        if (await isDigitalSilence(wav)) throw new TranscriptionError("O áudio contém apenas silêncio digital. Envie uma gravação com fala audível.", 422);
        return wav;
      };
      // .opus do WhatsApp ja usa Ogg: normalizar o nome nao altera o audio nem exige FFmpeg.
      const uploadExtension = validation.details.container === "ogg" ? "ogg" : validation.details.extension;
      let upload = new File([file], `audio.${uploadExtension}`, { type: validation.details.mime.split(";")[0] });
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
      if (!result || typeof result.text !== "string") throw new TranscriptionError("A OpenAI retornou uma resposta inválida. Tente novamente.", 502);
      if (!result.text.trim()) throw new TranscriptionError("Não foi possível identificar fala neste áudio. Verifique a gravação e tente novamente.", 422);
      const language = Array.isArray(result.languages) && result.languages.length === 1 ? normalizeLanguage({ code: result.languages[0].code, confidence: null }) : null;
      return json({ text: result.text.trim(), ...(language ? { language } : {}) });
    } catch (error) {
      if (request.signal.aborted || desktopJob?.signal.aborted) return json({ error: "Transcrição cancelada." }, 499);
      if (deadline.aborted) return json({ error: "A transcrição excedeu o tempo máximo. Tente um áudio menor." }, 504);
      const failure = publicError(error);
      return json({ error: failure.message }, failure.status);
    } finally { desktopJob?.finish(); }
  };
}
