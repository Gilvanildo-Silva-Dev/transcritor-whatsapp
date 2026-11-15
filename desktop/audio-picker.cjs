const { open } = require('node:fs/promises');
const { basename, extname } = require('node:path');
const MAX_BYTES = 25 * 1024 * 1024;
const extensions = ['ogg', 'opus', 'mp3', 'm4a', 'wav', 'webm'];
async function readSelectedAudio(path) {
  if (!extensions.includes(extname(path).slice(1).toLowerCase())) throw new Error('FORMAT');
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || !info.size) throw new Error('EMPTY');
    if (info.size > MAX_BYTES) throw new Error('SIZE');
    const chunks = [];
    let size = 0;
    while (size <= MAX_BYTES) {
      const chunk = Buffer.alloc(Math.min(1024 * 1024, MAX_BYTES + 1 - size));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, size);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > MAX_BYTES) throw new Error('SIZE');
      chunks.push(chunk.subarray(0, bytesRead));
    }
    if (!size) throw new Error('EMPTY');
    return { name: basename(path), data: new Uint8Array(Buffer.concat(chunks)) };
  } finally { await handle.close(); }
}
async function chooseAudio(dialog, parent, desktopPath) {
  try {
    const result = await dialog.showOpenDialog(parent, {
      title: 'Selecionar arquivo de áudio', defaultPath: desktopPath,
      properties: ['openFile'],
      filters: [{ name: 'Áudios WhatsApp e outros áudios', extensions }],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    return { file: await readSelectedAudio(result.filePaths[0]) };
  } catch (error) {
    const messages = {
      SIZE: 'O áudio excede o limite de 25 MB. Selecione um arquivo menor.',
      EMPTY: 'O arquivo está vazio ou não é um arquivo de áudio válido.',
      FORMAT: 'Formato não suportado. Selecione OGG, OPUS, MP3, M4A, WAV ou WEBM.',
    };
    return { error: messages[error.message] || 'Não foi possível abrir o áudio. Verifique se o arquivo está disponível no computador e tente novamente.' };
  }
}
module.exports = { chooseAudio, readSelectedAudio };
