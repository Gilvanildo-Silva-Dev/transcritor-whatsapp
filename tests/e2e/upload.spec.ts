import { expect, test, type Page } from "@playwright/test";
import { wavFixture, oggHeader, mp3Header, m4aHeader, webmHeader } from "../audio-fixtures";

const wav = (name = "mensagem.wav") => ({ name, mimeType: "audio/wav", buffer: Buffer.from(wavFixture()) });
async function drop(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const transfer = await page.evaluateHandle((payload) => {
    const data = new DataTransfer();
    for (const file of payload) data.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.mimeType }));
    return data;
  }, files.map((file) => ({ name: file.name, mimeType: file.mimeType, bytes: [...file.buffer] })));
  const zone = page.locator("#audio-input + div");
  await zone.dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(page.getByText("Solte seu áudio aqui", { exact: true })).toBeVisible();
  await zone.dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("seleção, player WAV, substituição, remoção e seleção repetida", async ({ page }) => {
  const button = page.getByRole("button", { name: "Transcrever áudio" });
  await expect(button).toBeDisabled();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Selecionar arquivo", exact: true }).click();
  await (await chooser).setFiles(wav());
  await expect(page.getByTitle("mensagem.wav")).toBeVisible();
  await expect(button).toBeEnabled();
  const player = page.locator("audio");
  await expect(player).toBeVisible();
  await expect.poll(() => player.evaluate((node: HTMLAudioElement) => node.readyState)).toBeGreaterThan(0);
  await page.getByLabel("Texto da transcrição · editável").fill("texto anterior");
  await page.locator("#audio-input").setInputFiles(wav("substituto.wav"));
  await expect(page.getByTitle("substituto.wav")).toBeVisible();
  await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue("");
  await page.getByRole("button", { name: "Remover áudio selecionado" }).click();
  await expect(player).toHaveCount(0); await expect(button).toBeDisabled();
  await page.locator("#audio-input").setInputFiles(wav("substituto.wav"));
  await expect(page.getByTitle("substituto.wav")).toBeVisible();
});

test("arrastar e soltar e rejeitar vários arquivos preservando o anterior", async ({ page }) => {
  await drop(page, [wav()]);
  await expect(page.getByTitle("mensagem.wav")).toBeVisible();
  await drop(page, [wav("primeiro.wav"), wav("segundo.wav")]);
  await expect(page.locator("#upload-error")).toContainText("apenas um áudio");
  await expect(page.getByTitle("mensagem.wav")).toBeVisible();
});

test("erros claros para extensão, conteúdo, arquivo vazio, tamanho e incompatibilidade", async ({ page }) => {
  const cases = [
    { file: { ...wav("audio.exe"), mimeType: "audio/wav" }, error: "Extensão não suportada" },
    { file: { name: "falso.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("nao e um arquivo real de audio") }, error: "conteúdo não corresponde" },
    { file: { name: "vazio.wav", mimeType: "audio/wav", buffer: Buffer.alloc(0) }, error: "arquivo está vazio" },
    { file: { ...wav("grande.wav"), buffer: Buffer.alloc(25 * 1024 * 1024 + 1) }, error: "até 25 MB" },
    { file: wav("errado.ogg"), error: "não corresponde ao formato detectado" },
  ];
  for (const item of cases) {
    await page.locator("#audio-input").setInputFiles(item.file);
    await expect(page.locator("#upload-error")).toContainText(item.error);
    await expect(page.getByRole("button", { name: "Transcrever áudio" })).toBeDisabled();
  }
});

test("reconhece os seis formatos mesmo sem MIME e mantém seleção se a prévia falhar", async ({ page }) => {
  const cases = [["WhatsApp.OPUS", oggHeader()], ["audio.ogg", oggHeader()], ["audio.mp3", mp3Header()], ["audio.m4a", m4aHeader()], ["audio.wav", wavFixture()], ["audio.webm", webmHeader()]] as const;
  for (const [name, bytes] of cases) {
    await page.locator("#audio-input").setInputFiles({ name, mimeType: "", buffer: Buffer.from(bytes) });
    await expect(page.getByTitle(name)).toBeVisible();
    await expect(page.getByRole("button", { name: "Transcrever áudio" })).toBeEnabled();
    await expect(page.locator("#upload-error")).toHaveCount(0);
  }
});

test("navegador sem codec não mostra player nem dispara conversão", async ({ page }) => {
  await page.addInitScript(() => { HTMLMediaElement.prototype.canPlayType = () => ""; });
  await page.reload();
  await page.locator("#audio-input").setInputFiles({ name: "mensagem.opus", mimeType: "", buffer: Buffer.from(oggHeader()) });
  await expect(page.getByText("Áudio reconhecido, mas este navegador", { exact: false })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(page.getByTitle("mensagem.opus")).toBeVisible();
});

test("falha de decodificação remove o player, mas não rejeita o arquivo selecionado", async ({ page }) => {
  await page.locator("#audio-input").setInputFiles(wav());
  await expect(page.locator("audio")).toBeVisible();
  await page.locator("audio").dispatchEvent("error");
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(page.getByText("Áudio reconhecido, mas este navegador", { exact: false })).toBeVisible();
  await expect(page.getByTitle("mensagem.wav")).toBeVisible();
});

test("validação pendente não restaura arquivo removido ou substituído", async ({ page }) => {
  await page.addInitScript(() => {
    const read = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function () {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return read.call(this);
    };
  });
  await page.reload();
  await page.locator("#audio-input").setInputFiles(wav("anterior.wav"));
  await expect(page.getByTitle("anterior.wav")).toBeVisible();
  await page.locator("#audio-input").setInputFiles(wav("lento.wav"));
  await expect(page.getByText("Verificando o arquivo no seu dispositivo…")).toBeVisible();
  await page.getByRole("button", { name: "Remover áudio selecionado" }).click();
  await page.waitForTimeout(600);
  await expect(page.getByTitle("lento.wav")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Transcrever áudio" })).toBeDisabled();
  await page.locator("#audio-input").setInputFiles(wav("primeiro.wav"));
  await page.locator("#audio-input").setInputFiles(wav("ultimo.wav"));
  await expect(page.getByTitle("ultimo.wav")).toBeVisible();
  await expect(page.getByTitle("primeiro.wav")).toHaveCount(0);
});

test("seleção e prévia do áudio não enviam arquivo antes de transcrever", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (/^https?:/.test(request.url()) && (request.method() !== "GET" || !request.url().startsWith("http://127.0.0.1:3100"))) requests.push(request.url()); });
  await page.locator("#audio-input").setInputFiles(wav());
  await expect(page.getByRole("button", { name: "Transcrever áudio" })).toBeEnabled();
  await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue("");
  expect(requests).toEqual([]);
});
test("layout de upload funciona em tela estreita sem rolagem horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator("#audio-input").setInputFiles(wav("mensagem-com-nome-extremamente-longo-exportada-do-whatsapp.wav"));
  await expect(page.getByRole("button", { name: "Remover áudio selecionado" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


