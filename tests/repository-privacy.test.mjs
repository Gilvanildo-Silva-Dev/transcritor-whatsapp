import { test } from "node:test";
import assert from "node:assert/strict";
import { auditRepositoryPrivacy } from "../scripts/check-privacy.mjs";

test("repositório e candidatos não contêm mídia, TXT privado nem credenciais", () => {
  const result = auditRepositoryPrivacy();
  assert.equal(result.ok, true, `Falhas de privacidade: ${result.issues.length}; valores e conteudo omitidos.`);
});
