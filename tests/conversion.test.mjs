import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rmdir, writeFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAudioConverter } from "../src/server/audio/conversion.ts";
import { TranscriptionError } from "../src/server/audio/errors.ts";
import { wavFixture, oggHeader } from "./audio-fixtures.ts";

const opus = () => new File([oggHeader()], "mensagem.opus");
for (const scenario of ["success", "process-error", "invalid-output", "large-output"]) {
  test(`FFmpeg: limpeza dos temporários em ${scenario}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "transcritor-test-"));
    let workspace;
    try {
      const convert = createAudioConverter({ temporaryRoot: root, execute: async (executable, args) => {
        assert.ok(executable); assert.ok(args.includes("-nostdin")); assert.ok(args.includes("0:a:0"));
        const input = args[args.indexOf("-i") + 1]; const output = args.at(-1); workspace = dirname(input);
        assert.deepEqual(new Uint8Array(await readFile(input)), oggHeader());
        if (scenario === "process-error") { await writeFile(output, "partial"); throw new TranscriptionError("Falha de conversão de teste.", 422); }
        if (scenario === "invalid-output") { await writeFile(output, "not a wav"); return; }
        if (scenario === "large-output") {
          const handle = await open(output, "w"); try { await handle.truncate(25 * 1024 * 1024); } finally { await handle.close(); } return;
        }
        await writeFile(output, wavFixture());
      } });
      if (scenario === "success") assert.deepEqual(new Uint8Array(await convert(opus())), wavFixture());
      else await assert.rejects(convert(opus()), (error) => error instanceof TranscriptionError);
      assert.ok(workspace); assert.deepEqual(await readdir(root), []);
    } finally { await rmdir(root); }
  });
}

test("FFmpeg ausente devolve 503 e também limpa entrada e diretório", async () => {
  const root = await mkdtemp(join(tmpdir(), "transcritor-test-"));
  const previous = process.env.FFMPEG_PATH;
  process.env.FFMPEG_PATH = join(root, "nao-existe-ffmpeg.exe");
  try {
    await assert.rejects(createAudioConverter({ temporaryRoot: root })(opus()), (error) => error instanceof TranscriptionError && error.status === 503);
    assert.deepEqual(await readdir(root), []);
  } finally {
    if (previous === undefined) delete process.env.FFMPEG_PATH; else process.env.FFMPEG_PATH = previous;
    await rmdir(root);
  }
});

test("conversão cancelada também remove arquivos parciais", async () => {
  const root = await mkdtemp(join(tmpdir(), "transcritor-test-"));
  const controller = new AbortController();
  try {
    const convert = createAudioConverter({ temporaryRoot: root, execute: async (_executable, args, signal) => {
      await writeFile(args.at(-1), "partial output");
      await new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        setTimeout(() => controller.abort(), 15);
      });
    } });
    await assert.rejects(convert(opus(), controller.signal), (error) => error.name === "AbortError");
    assert.deepEqual(await readdir(root), []);
  } finally { await rmdir(root); }
});
