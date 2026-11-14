import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalTranscribeHandler, createLocalRunner } from "../src/server/audio/local.ts";
import { TranscriptionError } from "../src/server/audio/errors.ts";
import { wavFixture, oggHeader } from "./audio-fixtures.ts";

const audio = () => new File([wavFixture()], "voz.wav");
function request(file = audio(), options = {}) {
  const form = new FormData(); form.append("file", file);
  return new Request("http://localhost/api/transcribe/local", { method: "POST", body: form, ...options });
}
test("transcrição local retorna texto real do runner sem usar SDK ou chave", async () => {
  let called = 0;
  const handler = createLocalTranscribeHandler({ run: async (file) => { called++; assert.equal(file.name, "voz.wav"); return "  Resultado local sintético.  "; } });
  const response = await handler(request());
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { text: "Resultado local sintético.", engine: "local" });
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(called, 1);
});
test("OPUS do WhatsApp é aceito pelo motor local sem FFmpeg externo", async () => {
  const handler = createLocalTranscribeHandler({ run: async (file) => { assert.equal(file.name, "PTT.opus"); return "Teste de Opus local."; } });
  assert.equal((await handler(request(new File([oggHeader()], "PTT.opus")))).status, 200);
});
test("motor local repete validação de arquivo inválido e tamanho", async () => {
  let called = false; const handler = createLocalTranscribeHandler({ run: async () => { called = true; return "texto"; } });
  assert.equal((await handler(request(new File(["arquivo inválido"], "audio.mp3")))).status, 422);
  assert.equal((await handler(request(new File([new Uint8Array(25 * 1024 * 1024 + 1)], "grande.wav")))).status, 413);
  assert.equal(called, false);
});
test("silêncio digital não inicia o processo local", async () => {
  const silent = wavFixture(); silent.fill(0, 44);
  const handler = createLocalTranscribeHandler({ run: async () => { throw new Error("não deve executar"); } });
  assert.equal((await handler(request(new File([silent], "silencio.wav")))).status, 422);
});
test("sem fala, configuração ausente e erro interno têm mensagens seguras", async () => {
  const empty = createLocalTranscribeHandler({ run: async () => " " });
  assert.equal((await empty(request())).status, 422);
  const missing = createLocalTranscribeHandler({ run: async () => { throw new TranscriptionError("Execute npm run setup:local.", 503); } });
  const response = await missing(request()); assert.equal(response.status, 503); assert.match((await response.json()).error, /setup:local/);
  const failure = createLocalTranscribeHandler({ run: async () => { throw new Error("private transcript details"); } });
  const failed = await failure(request()); assert.equal(failed.status, 500); assert.doesNotMatch(await failed.text(), /private transcript/);
});
test("só um processo de inferência local é aceito por vez e o slot é liberado", async () => {
  let release; const waiting = new Promise((resolve) => { release = resolve; }); let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const handler = createLocalTranscribeHandler({ run: async () => { entered(); await waiting; return "Resultado local."; } });
  const first = handler(request()); await started;
  assert.equal((await handler(request())).status, 429);
  release(); assert.equal((await first).status, 200);
  assert.equal((await handler(request())).status, 200);
});
test("cancelamento local não inicia trabalho nem mantém slot ocupado", async () => {
  let calls = 0; const handler = createLocalTranscribeHandler({ run: async () => { calls++; return "Texto local."; } });
  const controller = new AbortController(); controller.abort();
  assert.equal((await handler(request(audio(), { signal: controller.signal }))).status, 499);
  assert.equal(calls, 0); assert.equal((await handler(request())).status, 200);
});
for (const scenario of ["success", "failed", "invalid-json", "cancelled"]) {
  test(`runner local limpa os temporários: ${scenario}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "transcritor-local-test-")); const controller = new AbortController();
    try {
      const runner = createLocalRunner({ temporaryRoot: root, checkSetup: false, execute: async (_python, args) => {
        assert.ok(args.includes("--model-dir")); assert.equal((await readFile(args[1])).length, wavFixture().length);
        if (scenario === "failed") throw new Error("process failure");
        if (scenario === "cancelled") { controller.abort(); throw controller.signal.reason; }
        return scenario === "invalid-json" ? "invalid" : JSON.stringify({ text: "Resultado do processo local." });
      } });
      if (scenario === "success") assert.equal(await runner(audio(), controller.signal), "Resultado do processo local.");
      else await assert.rejects(runner(audio(), controller.signal));
      assert.deepEqual(await readdir(root), []);
    } finally { await rmdir(root); }
  });
}
