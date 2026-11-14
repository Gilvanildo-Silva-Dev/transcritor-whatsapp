import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_AUDIO_BYTES, validateAudioFile } from "../src/lib/audio/validation.ts";
import { wavFixture, oggHeader, mp3Header, m4aHeader, webmHeader } from "./audio-fixtures.ts";

for (const [name, bytes, label] of [
  ["mensagem.ogg", oggHeader(), "OGG / Opus"],
  ["PTT-20261114-WA0001.OPUS", oggHeader(), "OGG / Opus"],
  ["audio.ogg", oggHeader("vorbis"), "OGG / Vorbis"],
  ["audio.mp3", mp3Header(), "MP3"],
  ["audio.m4a", m4aHeader(), "M4A / MPEG-4"],
  ["audio.wav", wavFixture(), "WAV"],
  ["audio.webm", webmHeader(), "WEBM / Opus"],
]) {
  test(`reconhece ${name} sem depender do MIME`, async () => {
    const result = await validateAudioFile(new File([bytes], name, { type: "application/octet-stream" }));
    assert.equal(result.ok, true);
    assert.equal(result.details.label, label);
  });
}

test("rejeita extensão não permitida mesmo com MIME de áudio", async () => {
  const result = await validateAudioFile(new File([wavFixture()], "audio.exe", { type: "audio/wav" }));
  assert.equal(result.ok, false); assert.match(result.error, /Extensão/);
});
test("rejeita arquivo sem extensão", async () => {
  assert.equal((await validateAudioFile(new File([wavFixture()], "audio"))).ok, false);
});
test("rejeita texto renomeado como áudio", async () => {
  const result = await validateAudioFile(new File(["isto nao e um arquivo de audio"], "audio.mp3", { type: "audio/mpeg" }));
  assert.equal(result.ok, false); assert.match(result.error, /conteúdo/);
});
test("rejeita contêiner incompatível com extensão", async () => {
  const result = await validateAudioFile(new File([wavFixture()], "audio.ogg"));
  assert.equal(result.ok, false); assert.match(result.error, /não corresponde/);
});
test("OPUS exige codec Opus, não apenas OGG", async () => {
  assert.equal((await validateAudioFile(new File([oggHeader("vorbis")], "audio.opus"))).ok, false);
});
test("rejeita vazio e arquivo truncado", async () => {
  const empty = await validateAudioFile(new File([], "audio.wav"));
  assert.match(empty.error, /vazio/);
  assert.equal((await validateAudioFile(new File([wavFixture().slice(0, 40)], "audio.wav"))).ok, false);
});
test("aceita exatamente 25 MB e rejeita acima antes de ler", async () => {
  assert.equal((await validateAudioFile(new File([wavFixture(MAX_AUDIO_BYTES)], "audio.wav"))).ok, true);
  const result = await validateAudioFile({ name: "audio.wav", size: MAX_AUDIO_BYTES + 1, slice() { throw new Error("nao deve ler"); } });
  assert.match(result.error, /25 MB/);
});
test("trata falha de leitura sem rejeição não capturada", async () => {
  const result = await validateAudioFile({ name: "audio.wav", size: 100, slice: () => ({ arrayBuffer: async () => { throw new Error("permissao"); } }) });
  assert.match(result.error, /Não foi possível ler/);
});
test("ID3 sem frames MPEG não é aceito como MP3", async () => {
  const bytes = new Uint8Array(32); bytes.set(new TextEncoder().encode("ID3")); bytes[3] = 4;
  assert.equal((await validateAudioFile(new File([bytes], "audio.mp3"))).ok, false);
});
test("M4A e WEBM informam o limite da inspeção do contêiner", async () => {
  for (const [name, bytes] of [["audio.m4a", m4aHeader()], ["audio.webm", webmHeader()]]) {
    const result = await validateAudioFile(new File([bytes], name));
    assert.equal(result.details.verification, "container-header"); assert.ok(result.details.note);
  }
});
test("leitura é limitada ao cabeçalho e ignora ID3 grande com leitura pontual", async () => {
  const tagSize = 100_000;
  const bytes = new Uint8Array(tagSize + 10 + 417);
  bytes.set(new TextEncoder().encode("ID3")); bytes[3] = 4;
  bytes[6] = (tagSize >> 21) & 127; bytes[7] = (tagSize >> 14) & 127;
  bytes[8] = (tagSize >> 7) & 127; bytes[9] = tagSize & 127;
  bytes.set(mp3Header(), tagSize + 10);
  const file = new File([bytes], "audio.mp3"); const reads = [];
  const result = await validateAudioFile({ name: file.name, size: file.size, slice(start, end) { reads.push(end - start); return file.slice(start, end); } });
  assert.equal(result.ok, true); assert.deepEqual(reads, [65536, 4]);
});

for (const [name, create] of [
  ["frame MP3 truncado", () => new File([mp3Header().slice(0, 32)], "audio.mp3")],
  ["Ogg com tabela de segmentos truncada", () => { const bytes = oggHeader(); bytes[26] = 200; return new File([bytes], "audio.opus"); }],
  ["Ogg sem pacote inicial completo", () => { const bytes = oggHeader(); bytes[27] = 255; return new File([bytes], "audio.opus"); }],
  ["Opus sem canais", () => { const bytes = oggHeader(); bytes[37] = 0; return new File([bytes], "audio.opus"); }],
  ["WAV com RIFF menor que os chunks", () => { const bytes = wavFixture(); new DataView(bytes.buffer).setUint32(4, 20, true); return new File([bytes], "audio.wav"); }],
  ["WAV com frames parciais", () => { const bytes = wavFixture(); new DataView(bytes.buffer).setUint32(40, bytes.length - 45, true); return new File([bytes], "audio.wav"); }],
  ["M4A com brand deslocado", () => { const bytes = m4aHeader(); bytes.fill(0, 8); bytes.set(new TextEncoder().encode(" M4A"), 8); return new File([bytes], "audio.m4a"); }],
  ["WebM com texto webm fora do cabeçalho EBML", () => new File([new Uint8Array([0x1a,0x45,0xdf,0xa3,0x80]), "texto webm A_OPUS"], "audio.webm")],
]) {
  test(`rejeita ${name}`, async () => { assert.equal((await validateAudioFile(create())).ok, false); });
}
