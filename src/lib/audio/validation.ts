export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const AUDIO_EXTENSIONS = ["ogg", "opus", "mp3", "m4a", "wav", "webm"] as const;
export const AUDIO_ACCEPT = AUDIO_EXTENSIONS.map((extension) => `.${extension}`).join(",");
export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];
export type AudioDetails = {
  extension: AudioExtension;
  container: "ogg" | "mp3" | "mp4" | "wav" | "webm";
  mime: string;
  label: string;
  verification: "audio-header" | "container-header";
  note?: string;
};
export type AudioValidation = { ok: true; details: AudioDetails } | { ok: false; error: string };
type AudioFile = Pick<File, "name" | "size" | "slice">;
const HEADER_BYTES = 64 * 1024;
const invalid = (error: string): AudioValidation => ({ ok: false, error });
const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

function mp3Frame(bytes: Uint8Array, offset: number): boolean {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return false;
  const version = (bytes[offset + 1] >> 3) & 3;
  const layer = (bytes[offset + 1] >> 1) & 3;
  const bitrateIndex = bytes[offset + 2] >> 4;
  const sampleIndex = (bytes[offset + 2] >> 2) & 3;
  return version !== 1 && layer === 1 && bitrateIndex > 0 && bitrateIndex < 15 && sampleIndex < 3;
}

/** Inspecao local limitada aos cabecalhos; nao substitui uma decodificacao completa. */
export async function validateAudioFile(file: AudioFile): Promise<AudioValidation> {
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(extension)) return invalid("Extensão não suportada. Escolha OGG, OPUS, MP3, M4A, WAV ou WEBM.");
  if (file.size === 0) return invalid("O arquivo está vazio. Selecione outro áudio.");
  if (file.size > MAX_AUDIO_BYTES) return invalid("O áudio deve ter até 25 MB (26.214.400 bytes). Selecione um arquivo menor.");
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer()); }
  catch { return invalid("Não foi possível ler o arquivo. Tente selecioná-lo novamente."); }
  if (bytes.length < 12) return invalid("O arquivo está incompleto ou não contém um cabeçalho de áudio válido.");
  const ext = extension as AudioExtension;
  let detected: Omit<AudioDetails, "extension"> | undefined;

  if (ascii(bytes, 0, 4) === "OggS" && bytes[4] === 0 && bytes.length >= 28) {
    const segmentCount = bytes[26];
    const bodyStart = 27 + segmentCount;
    let bodyLength = 0;
    for (let index = 27; index < bodyStart && index < bytes.length; index++) bodyLength += bytes[index];
    const validPage = segmentCount > 0 && bodyStart + bodyLength <= file.size && bodyStart < bytes.length;
    if (validPage && bodyLength >= 19 && ascii(bytes, bodyStart, 8) === "OpusHead") {
      detected = { container: "ogg", mime: 'audio/ogg; codecs="opus"', label: "OGG / Opus", verification: "audio-header" };
    } else if (validPage && bodyLength >= 30 && bytes[bodyStart] === 1 && ascii(bytes, bodyStart + 1, 6) === "vorbis") {
      detected = { container: "ogg", mime: 'audio/ogg; codecs="vorbis"', label: "OGG / Vorbis", verification: "audio-header" };
    }
  } else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let hasFormat = false;
    let hasData = false;
    const riffEnd = view.getUint32(4, true) + 8;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = ascii(bytes, offset, 4);
      const length = view.getUint32(offset + 4, true);
      if (offset + 8 + length > file.size) break;
      if (chunk === "fmt " && length >= 16 && offset + 24 <= bytes.length) {
        hasFormat = view.getUint16(offset + 10, true) > 0 && view.getUint32(offset + 12, true) > 0;
      }
      if (chunk === "data" && length > 0) hasData = true;
      if (hasFormat && hasData) break;
      offset += 8 + length + (length % 2);
    }
    if (riffEnd <= file.size && hasFormat && hasData) detected = { container: "wav", mime: "audio/wav", label: "WAV", verification: "audio-header" };
  } else if (ascii(bytes, 4, 4) === "ftyp") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const boxSize = view.getUint32(0);
    const brands = ascii(bytes, 8, Math.min(boxSize, bytes.length) - 8);
    if (boxSize >= 16 && boxSize <= file.size && /M4A |M4B |isom|iso2|mp41|mp42|qt  /.test(brands)) {
      detected = { container: "mp4", mime: "audio/mp4", label: "M4A / MPEG-4", verification: "container-header", note: "Contêiner MPEG-4 reconhecido. A faixa de áudio e sua integridade ainda precisam de decodificação." };
    }
  } else if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    const header = ascii(bytes, 0, bytes.length);
    if (header.includes("webm")) {
      const codec = header.includes("A_OPUS") ? "Opus" : header.includes("A_VORBIS") ? "Vorbis" : null;
      detected = { container: "webm", mime: codec ? `audio/webm; codecs="${codec.toLowerCase()}"` : "audio/webm", label: codec ? `WEBM / ${codec}` : "WEBM", verification: "container-header", note: "Contêiner WEBM reconhecido. A presença e a integridade da faixa de áudio precisam de decodificação." };
    }
  } else {
    let frameOffset = 0;
    if (ascii(bytes, 0, 3) === "ID3") {
      if (bytes.subarray(6, 10).some((value) => value > 127)) return invalid("O cabeçalho MP3 está inválido ou corrompido.");
      const tagSize = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
      frameOffset = 10 + tagSize + (bytes[3] === 4 && (bytes[5] & 0x10) ? 10 : 0);
    }
    if (frameOffset + 4 <= file.size) {
      let frame = bytes;
      let offset = frameOffset;
      if (offset + 4 > bytes.length) {
        try { frame = new Uint8Array(await file.slice(offset, offset + 4).arrayBuffer()); offset = 0; }
        catch { return invalid("Não foi possível ler o cabeçalho MP3."); }
      }
      if (mp3Frame(frame, offset)) detected = { container: "mp3", mime: "audio/mpeg", label: "MP3", verification: "audio-header" };
    }
  }

  if (!detected) return invalid("O conteúdo não corresponde a um áudio reconhecido ou está incompleto. Renomear a extensão não converte o arquivo.");
  const expected = ext === "opus" || ext === "ogg" ? "ogg" : ext === "m4a" ? "mp4" : ext;
  if (detected.container !== expected || (ext === "opus" && !detected.label.includes("Opus"))) {
    return invalid(`A extensão .${ext} não corresponde ao formato detectado (${detected.label}). Selecione o arquivo original com a extensão correta.`);
  }
  return { ok: true, details: { extension: ext, ...detected } };
}
