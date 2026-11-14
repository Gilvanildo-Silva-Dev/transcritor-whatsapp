export function wavFixture(size = 1644): Uint8Array {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string) => [...value].forEach((char, index) => { bytes[offset + index] = char.charCodeAt(0); });
  write(0, "RIFF"); view.setUint32(4, size - 8, true); write(8, "WAVE");
  write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, size - 44, true);
  if (size >= 46) view.setInt16(44, 512, true); // Sinal sintetico, nunca uma gravacao pessoal.
  return bytes;
}

// Cabecalhos sinteticos para testar deteccao; nao sao amostras decodificaveis.
export function oggHeader(codec = "opus"): Uint8Array {
  const packet = codec === "opus" ? new Uint8Array(19) : new Uint8Array(30);
  const signature = codec === "opus" ? "OpusHead" : "\x01vorbis";
  packet.set(new TextEncoder().encode(signature));
  if (codec === "opus") { packet[8] = 1; packet[9] = 1; }
  else { packet[11] = 1; new DataView(packet.buffer).setUint32(12, 48000, true); packet[28] = 0xb8; packet[29] = 1; }
  const bytes = new Uint8Array(28 + packet.length);
  bytes.set(new TextEncoder().encode("OggS")); bytes[5] = 2; bytes[26] = 1; bytes[27] = packet.length;
  bytes.set(packet, 28);
  return bytes;
}
export function mp3Header(): Uint8Array {
  const bytes = new Uint8Array(417);
  bytes.set([0xff, 0xfb, 0x90, 0x00]);
  return bytes;
}
export function m4aHeader(): Uint8Array {
  const bytes = new Uint8Array(24);
  new DataView(bytes.buffer).setUint32(0, 24);
  bytes.set(new TextEncoder().encode("ftypM4A "), 4);
  bytes.set(new TextEncoder().encode("isommp42"), 16);
  return bytes;
}
export function webmHeader(): Uint8Array {
  return new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, ...new TextEncoder().encode("webm A_OPUS")]);
}


