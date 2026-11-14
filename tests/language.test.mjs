import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLanguage, languageLabel } from "../src/lib/transcription/language.ts";

test("normaliza código e mantém probabilidade real do idioma", () => {
  assert.deepEqual(normalizeLanguage({ code: " PT ", confidence: 0.973 }), { code: "pt", confidence: 0.973 });
  assert.equal(languageLabel("pt"), "Português"); assert.equal(languageLabel("en"), "Inglês");
});
test("sem probabilidade não inventa certeza", () => {
  assert.deepEqual(normalizeLanguage({ code: "en" }), { code: "en", confidence: null });
  for (const confidence of [-1, 1.1, NaN, Infinity, "99%", null]) assert.equal(normalizeLanguage({ code: "pt", confidence }).confidence, null);
});
test("zero e um são probabilidades válidas sem arredondamento no backend", () => {
  assert.equal(normalizeLanguage({ code: "es", confidence: 0 }).confidence, 0);
  assert.equal(normalizeLanguage({ code: "es", confidence: 1 }).confidence, 1);
});
test("código inválido ou conteúdo arbitrário é descartado", () => {
  for (const value of [null, 42, "pt", { code: "<script>" }, { code: "portugues" }, { code: "" }]) assert.equal(normalizeLanguage(value), null);
});
