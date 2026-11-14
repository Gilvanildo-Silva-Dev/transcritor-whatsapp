import { test } from "node:test";
import assert from "node:assert/strict";
import { isDigitalSilence } from "../src/server/audio/silence.ts";
import { wavFixture } from "./audio-fixtures.ts";

for (const [encoding, bits] of [[1, 8], [1, 16], [1, 24], [1, 32], [3, 32], [3, 64]]) {
  test(`silêncio digital: formato ${encoding}, ${bits} bits`, async () => {
    const bytes = wavFixture(44 + 96); const view = new DataView(bytes.buffer);
    view.setUint16(20, encoding, true); view.setUint16(34, bits, true);
    view.setUint16(32, bits / 8, true); view.setUint32(28, 16000 * bits / 8, true);
    bytes.fill(bits === 8 ? 128 : 0, 44);
    assert.equal(await isDigitalSilence(new File([bytes], "synthetic.wav")), true);
  });
}

test("volume muito baixo não é confundido com silêncio", async () => {
  const bytes = wavFixture(); bytes.fill(0, 44); new DataView(bytes.buffer).setInt16(44, 1, true);
  assert.equal(await isDigitalSilence(new File([bytes], "synthetic.wav")), false);
});

test("float com zero negativo também é silêncio", async () => {
  const bytes = wavFixture(44 + 96); const view = new DataView(bytes.buffer);
  view.setUint16(20, 3, true); view.setUint16(34, 32, true); view.setUint16(32, 4, true); view.setUint32(28, 64000, true);
  bytes.fill(0, 44); for (let offset = 44; offset < bytes.length; offset += 4) view.setFloat32(offset, -0, true);
  assert.equal(await isDigitalSilence(new File([bytes], "synthetic.wav")), true);
});

test("dados desconhecidos não são classificados como silêncio", async () => {
  assert.equal(await isDigitalSilence(new File(["not wav"], "audio.wav")), false);
});
