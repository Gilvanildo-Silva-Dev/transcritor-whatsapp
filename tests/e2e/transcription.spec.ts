import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { wavFixture } from "../audio-fixtures";

const audio = (name = "mensagem.wav") => ({ name, mimeType: "audio/wav", buffer: Buffer.from(wavFixture()) });
const result = "Bom dia, vamos confirmar a reunião às dez horas.";

let transport: Server;
let transportUrl: string;
let receivedBody = "";
let receivedType = "";
// HTTP local real: interceptacoes fulfill do Playwright nao disparam upload.onload enquanto aguardam.
test.beforeAll(async () => {
  transport = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "*");
    if (request.method === "OPTIONS") { response.end(); return; }
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      receivedBody = Buffer.concat(chunks).toString("latin1");
      receivedType = request.headers["content-type"] || "";
      const timer = setTimeout(() => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ text: result })); }, 900);
      response.on("close", () => clearTimeout(timer));
    });
  });
  await new Promise<void>((resolve) => transport.listen(0, "127.0.0.1", resolve));
  transportUrl = `http://127.0.0.1:${(transport.address() as AddressInfo).port}/transcribe`;
});
test.afterAll(async () => { await new Promise<void>((resolve) => transport.close(() => resolve())); });
test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("envio multipart, processamento, sucesso, edição e download da transcrição", async ({ page }) => {
  await page.route("**/api/transcribe", (route) => route.continue({ url: transportUrl }));
  await page.locator("#audio-input").setInputFiles(audio());
  await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.getByRole("button", { name: "Transcrevendo áudio…" })).toBeDisabled();
  await expect(page.getByLabel("Texto da transcrição · editável")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Copiar texto" })).toBeDisabled();
  await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue(result);
  await expect(page.getByText("Transcrição concluída.", { exact: false })).toBeVisible();
  expect(receivedType).toContain("multipart/form-data; boundary=");
  expect(receivedBody).toContain('name="file"; filename="mensagem.wav"');
  const edited = result + " Obrigado.";
  await page.getByLabel("Texto da transcrição · editável").fill(edited);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar TXT" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("mensagem.txt");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "")).toBe(edited);
});

test("estado de envio fica visível antes de o corpo terminar de sair", async ({ page }) => {
  await page.addInitScript(() => {
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      setTimeout(() => send.call(this, body), 400);
    };
  });
  await page.reload();
  await page.route("**/api/transcribe", (route) => route.fulfill({ json: { text: result } }));
  await page.locator("#audio-input").setInputFiles(audio());
  await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.getByRole("button", { name: "Enviando áudio…" })).toBeDisabled();
  await expect(page.getByText("Enviando arquivo: 0%", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue(result);
});

for (const status of [422, 429, 503]) {
  test(`erro ${status} permite tentar novamente sem mostrar texto fictício`, async ({ page }) => {
    let calls = 0;
    await page.route("**/api/transcribe", (route) => {
      calls++;
      return route.fulfill(calls === 1 ? { status, json: { error: "Mensagem de falha controlada para teste." } } : { json: { text: result } });
    });
    await page.locator("#audio-input").setInputFiles(audio());
    await page.getByRole("button", { name: "Transcrever áudio" }).click();
    await expect(page.locator("#transcription-error")).toContainText("Mensagem de falha controlada");
    await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Baixar TXT" })).toBeDisabled();
    await page.getByRole("button", { name: "Transcrever áudio" }).click();
    await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue(result);
    await expect(page.locator("#transcription-error")).toHaveCount(0);
  });
}

test("falha de rede tem mensagem clara", async ({ page }) => {
  await page.route("**/api/transcribe", (route) => route.abort("failed"));
  await page.locator("#audio-input").setInputFiles(audio());
  await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.locator("#transcription-error")).toContainText("Falha de conexão");
  await expect(page.getByRole("button", { name: "Transcrever áudio" })).toBeEnabled();
});

test("resposta inválida não é apresentada como transcrição", async ({ page }) => {
  await page.route("**/api/transcribe", (route) => route.fulfill({ json: { text: "" } }));
  await page.locator("#audio-input").setInputFiles(audio());
  await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.locator("#transcription-error")).toContainText("não retornou uma transcrição válida");
  await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue("");
});

for (const action of ["remove", "replace"]) {
  test(`${action}: resposta antiga não reaparece após cancelar a transcrição`, async ({ page }) => {
    await page.route("**/api/transcribe", (route) => route.continue({ url: transportUrl }));
    await page.locator("#audio-input").setInputFiles(audio());
    await page.getByRole("button", { name: "Transcrever áudio" }).click();
    await expect(page.getByRole("button", { name: "Transcrevendo áudio…" })).toBeDisabled();
    if (action === "remove") await page.getByRole("button", { name: "Remover áudio selecionado" }).click();
    else await page.locator("#audio-input").setInputFiles(audio("novo.wav"));
    await page.waitForTimeout(1100);
    await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue("");
    await expect(page.getByLabel("Texto da transcrição · editável")).toBeEnabled();
    await expect(page.getByText("Transcrição concluída.", { exact: false })).toHaveCount(0);
    if (action === "replace") await expect(page.getByTitle("novo.wav")).toBeVisible();
    else await expect(page.getByRole("button", { name: "Transcrever áudio" })).toBeDisabled();
  });
}

test("endpoint real valida o arquivo e informa configuração ausente sem revelar chave", async ({ request }) => {
  const missing = await request.post("/api/transcribe", { multipart: { file: { name: "audio.wav", mimeType: "audio/wav", buffer: Buffer.from(wavFixture()) } } });
  expect(missing.status()).toBe(503);
  expect((await missing.json()).error).toContain("OPENAI_API_KEY");
  const bad = await request.post("/api/transcribe", { multipart: { file: { name: "falso.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("arquivo sem audio real") } } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error).toContain("conteúdo");
  expect((await request.get("/api/transcribe")).status()).toBe(405);
});

