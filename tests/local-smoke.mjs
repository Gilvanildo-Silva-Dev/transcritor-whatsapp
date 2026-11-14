import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalTranscribeHandler } from "../src/server/audio/local.ts";

if (process.platform !== "win32") throw new Error("Este teste de fala sintetica usa a voz Microsoft Maria do Windows.");
const root = await mkdtemp(join(tmpdir(), "whisper-local-smoke-"));
const wav = join(root, "synthetic.wav");
const opus = join(root, "synthetic.opus");
const silence = join(root, "silence.opus");
const python = join(process.cwd(), ".venv", "Scripts", "python.exe");
try {
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
    Add-Type -AssemblyName System.Speech
    $voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
    try {
      $voice.SelectVoice('Microsoft Maria Desktop')
      $voice.Rate = -1
      $voice.SetOutputToWaveFile($env:LOCAL_SMOKE_OUTPUT)
      $voice.Speak('Olá. Este é um teste de transcrição gratuita no computador. O áudio é processado localmente, sem usar uma API paga. Podemos selecionar o arquivo, copiar o texto e baixar a transcrição.')
    } finally { $voice.Dispose() }
  `], { env: { ...process.env, LOCAL_SMOKE_OUTPUT: wav }, windowsHide: true, timeout: 60_000, stdio: "pipe" });
  execFileSync(python, ["-c", `
import sys
import av
source = av.open(sys.argv[1])
output = av.open(sys.argv[2], mode='w', format='ogg')
stream = output.add_stream('libopus', rate=48000)
stream.layout = 'mono'
stream.bit_rate = 24000
resampler = av.AudioResampler(format='fltp', layout='mono', rate=48000)
for frame in source.decode(audio=0):
    for converted in resampler.resample(frame):
        converted.pts = None
        for packet in stream.encode(converted):
            output.mux(packet)
for converted in resampler.resample(None):
    converted.pts = None
    for packet in stream.encode(converted):
        output.mux(packet)
for packet in stream.encode(None):
    output.mux(packet)
output.close()
source.close()
silent_output = av.open(sys.argv[3], mode='w', format='ogg')
silent_stream = silent_output.add_stream('libopus', rate=48000)
silent_stream.layout = 'mono'
for _ in range(500):
    frame = av.AudioFrame(format='fltp', layout='mono', samples=960)
    frame.sample_rate = 48000
    for plane in frame.planes:
        plane.update(bytes(plane.buffer_size))
    for packet in silent_stream.encode(frame):
        silent_output.mux(packet)
for packet in silent_stream.encode(None):
    silent_output.mux(packet)
silent_output.close()
  `, wav, opus, silence], { timeout: 60_000, windowsHide: true, stdio: "pipe" });
  const handler = createLocalTranscribeHandler();
  for (const path of [wav, opus]) {
    const extension = path.endsWith(".opus") ? "opus" : "wav";
    const form = new FormData();
    form.append("file", new File([await readFile(path)], `synthetic.${extension}`));
    const response = await handler(new Request("http://localhost/api/transcribe/local", { method: "POST", body: form }));
    const body = await response.json();
    assert.equal(response.status, 200, `Falha na transcricao local ${extension}: ${body.error || "erro"}`);
    assert.equal(body.engine, "local");
    assert.match(body.text, /transcri|gratuit|computador/i);
    console.log(`${extension.toUpperCase()}: inferencia real local aprovada (${body.text.length} caracteres), sem API.`);
  }
  const silentForm = new FormData();
  silentForm.append("file", new File([await readFile(silence)], "silence.opus"));
  const silentResponse = await handler(new Request("http://localhost/api/transcribe/local", { method: "POST", body: silentForm }));
  assert.equal(silentResponse.status, 422);
  assert.match((await silentResponse.json()).error, /fala/);
  console.log("OPUS silencioso: ausencia de fala detectada pelo modelo/VAD real, sem texto inventado.");
} finally {
  for (const path of [wav, opus, silence]) { try { await unlink(path); } catch (error) { if (error.code !== "ENOENT") throw error; } }
  await rmdir(root);
}

