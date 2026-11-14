import "server-only";

import { inspectWav } from "../../lib/audio/wav";

/** Rejeita apenas silencio digital comprovado, sem limiar que corte fala baixa. */
export async function isDigitalSilence(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectWav(bytes);
  if (!info || ![1, 3].includes(info.encoding)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleBytes = info.bitsPerSample / 8;
  for (const chunk of info.data) {
    for (let offset = chunk.offset; offset < chunk.offset + chunk.length; offset += sampleBytes) {
      if (info.encoding === 3) {
        const sample = info.bitsPerSample === 32 ? view.getFloat32(offset, true) : view.getFloat64(offset, true);
        if (sample !== 0) return false;
      } else if (info.bitsPerSample === 8) {
        if (bytes[offset] !== 128) return false;
      } else {
        for (let index = 0; index < sampleBytes; index++) if (bytes[offset + index] !== 0) return false;
      }
    }
  }
  return true;
}
