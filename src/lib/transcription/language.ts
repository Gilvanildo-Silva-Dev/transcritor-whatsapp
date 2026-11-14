export type DetectedLanguage = { code: string; confidence: number | null };

/** Nunca transforma ausencia ou valor invalido em certeza artificial. */
export function normalizeLanguage(value: unknown): DetectedLanguage | null {
  if (!value || typeof value !== "object" || !("code" in value) || typeof value.code !== "string") return null;
  const code = value.code.trim().toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/.test(code)) return null;
  const probability = "confidence" in value ? value.confidence : null;
  const confidence = typeof probability === "number" && Number.isFinite(probability) && probability >= 0 && probability <= 1 ? probability : null;
  return { code, confidence };
}

export function languageLabel(code: string): string {
  try {
    const label = new Intl.DisplayNames(["pt-BR"], { type: "language" }).of(code) || code;
    return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
  } catch { return code.toUpperCase(); }
}
