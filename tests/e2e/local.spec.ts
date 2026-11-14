import { expect, test } from "@playwright/test";
import { wavFixture, oggHeader } from "../audio-fixtures";
const audio = () => ({ name: "minha-voz.wav", mimeType: "audio/wav", buffer: Buffer.from(wavFixture()) });

test("página inicial seleciona áudio e transcreve pelo motor gratuito, sem endpoint pago", async ({ page }) => {
  const paid: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith("/api/transcribe") || request.url().includes("api.openai.com")) paid.push(request.url()); });
  await page.route("**/api/transcribe/local", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataBuffer()?.toString("latin1")).toContain('filename="minha-voz.wav"');
    await route.fulfill({ json: { text: "Transcrição local controlada para teste.", engine: "local" } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Seu áudio em texto, gratuitamente." })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Selecionar arquivo", exact: true }).click();
  await (await chooser).setFiles(audio());
  await expect(page.getByTitle("minha-voz.wav")).toBeVisible();
  await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue("Transcrição local controlada para teste.");
  await page.getByLabel("Texto da transcrição · editável").fill("Texto local revisado.");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Baixar TXT" }).click();
  expect((await download).suggestedFilename()).toBe("minha-voz.txt");
  expect(paid).toEqual([]);
});
test("OPUS pode ser selecionado no modo gratuito mesmo sem reprodução no navegador", async ({ page }) => {
  await page.addInitScript(() => { HTMLMediaElement.prototype.canPlayType = () => ""; });
  await page.goto("/"); await page.locator("#audio-input").setInputFiles({ name: "PTT-WhatsApp.opus", mimeType: "", buffer: Buffer.from(oggHeader()) });
  await expect(page.getByTitle("PTT-WhatsApp.opus")).toBeVisible();
  await expect(page.getByText("Mesmo sem prévia, você pode transcrevê-lo com o Whisper local.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Transcrever áudio" })).toBeEnabled();
});
test("configuração local ausente é explicada sem sugerir chave paga", async ({ page }) => {
  await page.route("**/api/transcribe/local", (route) => route.fulfill({ status: 503, json: { error: "Configure a transcrição gratuita executando npm run setup:local no terminal." } }));
  await page.goto("/"); await page.locator("#audio-input").setInputFiles(audio());
  await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.locator("#transcription-error")).toContainText("setup:local");
  await expect(page.getByRole("button", { name: "Transcrever áudio" })).toBeEnabled();
});
test("a opção paga fica identificada em página separada", async ({ page }) => {
  await page.goto("/"); await page.getByRole("link", { name: "Usar OpenAI (API paga)" }).click();
  await expect(page).toHaveURL(/\/openai$/);
  await page.getByRole("link", { name: "Transcrever gratuitamente neste computador" }).click();
  await expect(page.getByRole("heading", { name: "Seu áudio em texto, gratuitamente." })).toBeVisible();
});
