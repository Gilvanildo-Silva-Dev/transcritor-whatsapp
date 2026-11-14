import "server-only";

export function getHealthStatus() {
  return { status: "ok", service: "transcritor-whatsapp" } as const;
}
