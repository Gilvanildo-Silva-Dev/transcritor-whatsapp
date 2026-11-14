export type WavInfo = {
  encoding: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  data: { offset: number; length: number }[];
};
const ascii = (bytes: Uint8Array, offset: number, length: number) => new TextDecoder("latin1").decode(bytes.subarray(offset, offset + length));

/** Valida os chunks disponiveis no prefixo sem tratar metadados como amostras. */
export function inspectWav(bytes: Uint8Array, fileSize = bytes.byteLength): WavInfo | null {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = view.getUint32(4, true) + 8;
  if (end < 44 || end > fileSize) return null;
  let format: Omit<WavInfo, "data"> | undefined;
  const data: WavInfo["data"] = [];
  for (let offset = 12; offset + 8 <= Math.min(bytes.length, end);) {
    const chunk = ascii(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    if (payload + length > end) return null;
    if (chunk === "fmt ") {
      if (length < 16 || payload + 16 > bytes.length) return null;
      const encoding = view.getUint16(payload, true);
      const channels = view.getUint16(payload + 2, true);
      const sampleRate = view.getUint32(payload + 4, true);
      const byteRate = view.getUint32(payload + 8, true);
      const blockAlign = view.getUint16(payload + 12, true);
      const bitsPerSample = view.getUint16(payload + 14, true);
      if (!encoding || !channels || !sampleRate || !blockAlign) return null;
      if (encoding === 1 || encoding === 3) {
        const supportedBits = encoding === 1 ? [8, 16, 24, 32] : [32, 64];
        if (!supportedBits.includes(bitsPerSample) || blockAlign !== channels * bitsPerSample / 8 || byteRate !== sampleRate * blockAlign) return null;
      }
      format = { encoding, channels, sampleRate, blockAlign, bitsPerSample };
    }
    if (chunk === "data") {
      if (!length) return null;
      data.push({ offset: payload, length });
    }
    offset = payload + length + (length % 2);
  }
  if (!format || !data.length || data.some((chunk) => chunk.length % format.blockAlign !== 0)) return null;
  return { ...format, data };
}
