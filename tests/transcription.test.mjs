import { test } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { createTranscribeHandler } from "../src/server/audio/transcribe.ts";
import { wavFixture, oggHeader } from "./audio-fixtures.ts";

const wav = () => new File([wavFixture()], "mensagem.wav", { type: "application/octet-stream" });
const opus = () => new File([oggHeader()], "PTT-WhatsApp.opus");
function request(file = wav(), options = {}) {
  const form = new FormData(); form.append("file", file);
  return new Request("http://localhost/api/transcribe", { method: "POST", body: form, ...options });
}
function setup(responses = [{ status: 200, body: { text: "Transcrição de teste." } }], convert) {
  const calls = [];
  const client = new OpenAI({
    apiKey: "test-only-key", maxRetries: 0,
    fetch: async (url, init) => {
      const received = new Request(url, init);
      const form = await received.formData();
      calls.push({ url: received.url, form, headers: received.headers });
      const response = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (response.throw) throw response.throw;
      return Response.json(response.body, { status: response.status });
    },
  });
  return { calls, handler: createTranscribeHandler({ getApiKey: () => "test-only-key", clientFactory: () => client, convert }) };
}

test("SDK oficial envia multipart com gpt-transcribe e contexto brasileiro, retornando somente texto", async () => {
  const { handler, calls } = setup();
  const response = await handler(request());
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { text: "Transcrição de teste." });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(calls[0].form.get("model"), "gpt-transcribe");
  assert.equal(calls[0].form.get("response_format"), "json");
  assert.match(calls[0].form.get("prompt"), /português brasileiro/);
  assert.deepEqual(calls[0].form.getAll("languages[]"), ["pt"]);
  const uploaded = calls[0].form.get("file");
  assert.equal(uploaded.name, "audio.wav"); assert.equal(uploaded.type, "audio/wav");
  assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), wavFixture());
});

test("WAV suportado não executa FFmpeg", async () => {
  const { handler } = setup(undefined, async () => { throw new Error("conversão indevida"); });
  assert.equal((await handler(request())).status, 200);
});

test("OPUS é convertido para WAV antes do envio", async () => {
  let conversions = 0;
  const { handler, calls } = setup(undefined, async (file) => { assert.equal(file.name, "PTT-WhatsApp.opus"); conversions++; return Buffer.from(wavFixture()); });
  assert.equal((await handler(request(opus()))).status, 200);
  assert.equal(conversions, 1); assert.equal(calls[0].form.get("file").name, "audio.wav");
});

test("formato rejeitado pela OpenAI recebe uma única tentativa após conversão", async () => {
  let conversions = 0;
  const { handler, calls } = setup([
    { status: 400, body: { error: { message: "unsupported audio format", code: "unsupported_audio_format" } } },
    { status: 200, body: { text: "Resultado após conversão." } },
  ], async () => { conversions++; return Buffer.from(wavFixture()); });
  const response = await handler(request());
  assert.equal(response.status, 200); assert.equal(calls.length, 2); assert.equal(conversions, 1);
});

test("OPUS já convertido não entra em ciclo de tentativas", async () => {
  const { handler, calls } = setup([{ status: 400, body: { error: { message: "unsupported audio format", code: "unsupported_audio_format" } } }], async () => Buffer.from(wavFixture()));
  assert.equal((await handler(request(opus()))).status, 422); assert.equal(calls.length, 1);
});

test("recebimento exige multipart válido e exatamente um arquivo no campo file", async () => {
  const { handler, calls } = setup();
  const json = new Request("http://localhost/api/transcribe", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  assert.equal((await handler(json)).status, 415);
  const malformed = new Request("http://localhost/api/transcribe", { method: "POST", body: "invalido", headers: { "content-type": "multipart/form-data; boundary=x" } });
  assert.equal((await handler(malformed)).status, 400);
  for (const variant of ["missing", "text", "duplicate", "other-file"]) {
    const form = new FormData();
    if (variant !== "missing") form.append("file", variant === "text" ? "não é um arquivo" : wav());
    if (variant === "duplicate") form.append("file", wav());
    if (variant === "other-file") form.append("extra", wav());
    assert.equal((await handler(new Request("http://localhost/api/transcribe", { method: "POST", body: form }))).status, 400);
  }
  assert.equal(calls.length, 0);
});

test("backend rejeita extensão, cabeçalho e arquivo vazio sem chamar API", async () => {
  const { handler, calls } = setup();
  for (const file of [new File([wavFixture()], "audio.exe", { type: "audio/wav" }), new File(["texto que nao e audio"], "audio.mp3"), new File([], "vazio.wav")]) {
    assert.equal((await handler(request(file))).status, 422);
  }
  assert.equal(calls.length, 0);
});

test("limite de arquivo é repetido no backend", async () => {
  const { handler, calls } = setup();
  const response = await handler(request(new File([new Uint8Array(25 * 1024 * 1024 + 1)], "audio.wav")));
  assert.equal(response.status, 413); assert.equal(calls.length, 0);
});

test("corpo multipart acima do limite é rejeitado mesmo sem Content-Length", async () => {
  const { handler, calls } = setup();
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(25 * 1024 * 1024 + 65537)); },
    cancel() { cancelled = true; },
  });
  const req = new Request("http://localhost/api/transcribe", { method: "POST", body, duplex: "half", headers: { "content-type": "multipart/form-data; boundary=x" } });
  assert.equal((await handler(req)).status, 413); assert.equal(cancelled, true); assert.equal(calls.length, 0);
});

test("Content-Length excessivo é recusado antes de ler o corpo", async () => {
  const { handler } = setup();
  const req = new Request("http://localhost/api/transcribe", { method: "POST", body: "x", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "999999999" } });
  assert.equal((await handler(req)).status, 413);
});

test("ausência de OPENAI_API_KEY responde 503 sem instanciar SDK nem converter", async () => {
  const handler = createTranscribeHandler({ getApiKey: () => undefined, clientFactory: () => { throw new Error("não deve instanciar"); }, convert: async () => { throw new Error("não deve converter"); } });
  const response = await handler(request(opus()));
  assert.equal(response.status, 503); assert.match((await response.json()).error, /OPENAI_API_KEY/);
});

for (const [upstream, expected] of [[401, 503], [403, 503], [404, 503], [429, 429], [500, 502]]) {
  test(`erro ${upstream} da API vira resposta ${expected} sem revelar credenciais ou detalhes`, async () => {
    const { handler, calls } = setup([{ status: upstream, body: { error: { message: "sensitive-provider-detail test-only-key", code: "test-error" } } }]);
    const response = await handler(request());
    assert.equal(response.status, expected);
    const body = await response.text(); assert.doesNotMatch(body, /sensitive-provider-detail|test-only-key/); assert.equal(calls.length, 1);
  });
}

test("falha de rede vira erro claro sem detalhes internos", async () => {
  const { handler } = setup([{ throw: new Error("sensitive network details") }]);
  const response = await handler(request());
  assert.equal(response.status, 502); assert.match((await response.json()).error, /conectar/);
});

test("resposta sem fala não é apresentada como sucesso", async () => {
  const { handler } = setup([{ status: 200, body: { text: "  " } }]);
  const response = await handler(request()); assert.equal(response.status, 422); assert.match((await response.json()).error, /identificar fala/);
});

test("requisição cancelada não chama OpenAI", async () => {
  const { handler, calls } = setup(); const controller = new AbortController(); controller.abort();
  assert.equal((await handler(request(wav(), { signal: controller.signal }))).status, 499);
  assert.equal(calls.length, 0);
});

test("prazo total excedido responde 504 e cancela a chamada do SDK", async (context) => {
  context.mock.method(AbortSignal, "timeout", () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("Prazo excedido", "TimeoutError")), 20);
    return controller.signal;
  });
  const client = new OpenAI({ apiKey: "test-only-key", maxRetries: 0, fetch: async (_url, init) => {
    if (init.signal.aborted) throw new DOMException("Cancelado", "AbortError");
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Cancelado", "AbortError")), { once: true }));
  } });
  const handler = createTranscribeHandler({ getApiKey: () => "test-only-key", clientFactory: () => client });
  const response = await handler(request());
  assert.equal(response.status, 504); assert.match((await response.json()).error, /tempo máximo/);
});

test("cancelamento interrompe a leitura de um multipart que não terminou", async () => {
  const controller = new AbortController(); let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const req = new Request("http://localhost/api/transcribe", { method: "POST", body, duplex: "half", signal: controller.signal, headers: { "content-type": "multipart/form-data; boundary=x" } });
  const handler = createTranscribeHandler({ getApiKey: () => undefined });
  setTimeout(() => controller.abort(), 15);
  assert.equal((await handler(req)).status, 499); assert.equal(cancelled, true);
});
