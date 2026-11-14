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


test("copia exatamente o texto editado, com acentos, quebras de linha e emoji", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/transcribe", (route) => route.fulfill({ json: { text: result } }));
  await page.locator("#audio-input").setInputFiles(audio());
  await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue(result);
  const edited = "Revisão manual: ação e reunião.\nSegunda linha 😊";
  await page.getByLabel("Texto da transcrição · editável").fill(edited);
  await page.getByRole("button", { name: "Copiar texto" }).click();
  await expect(page.getByText("Texto copiado para a área de transferência.", { exact: true })).toBeVisible();
  // O clipboard do Windows converte LF para CRLF; o conteudo deve permanecer igual.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(edited);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar TXT" }).click();
  const download = await downloadEvent; const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(bytes.subarray(3).toString("utf8")).toBe(edited);
});

for (const clipboard of ["denied", "missing"]) {
  test(`clipboard ${clipboard}: seleciona o texto e orienta cópia manual`, async ({ page }) => {
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "missing" ? undefined : { writeText: async () => { throw new DOMException("Bloqueado", "NotAllowedError"); } } });
    }, clipboard);
    await page.reload();
    const textarea = page.getByLabel("Texto da transcrição · editável");
    const text = "Texto sintético para cópia manual."; await textarea.fill(text);
    await page.getByRole("button", { name: "Copiar texto" }).click();
    await expect(page.getByText("A cópia automática foi bloqueada.", { exact: false })).toBeVisible();
    await expect(textarea).toBeFocused();
    expect(await textarea.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd])).toEqual([0, text.length]);
  });
}

for (const action of ["edit", "replace"]) {
  test(`cópia pendente não mostra confirmação antiga após ${action}`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise<void>((resolve) => { Object.assign(window, { releaseCopy: resolve }); }) } });
    });
    await page.reload();
    await page.locator("#audio-input").setInputFiles(audio());
    await page.getByLabel("Texto da transcrição · editável").fill("Texto anterior sintético.");
    await page.getByRole("button", { name: "Copiar texto" }).click();
    if (action === "edit") await page.getByLabel("Texto da transcrição · editável").fill("Novo texto sintético.");
    else await page.locator("#audio-input").setInputFiles(audio("novo.wav"));
    await page.evaluate(() => (window as unknown as { releaseCopy: () => void }).releaseCopy());
    await expect(page.getByText("Texto copiado para a área de transferência.", { exact: true })).toHaveCount(0);
  });
}

test("texto vazio desabilita cópia e download sem perder edição manual", async ({ page }) => {
  const textarea = page.getByLabel("Texto da transcrição · editável");
  await textarea.fill("   \n ");
  await expect(page.getByRole("button", { name: "Copiar texto" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Baixar TXT" })).toBeDisabled();
  await textarea.fill("Texto local sintético.");
  await expect(page.getByRole("button", { name: "Copiar texto" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Baixar TXT" })).toBeEnabled();
});

test("falha ao criar download é tratada e mantém o texto", async ({ page }) => {
  await page.addInitScript(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = function (value) {
      if (value instanceof Blob && value.type.startsWith("text/plain")) throw new Error("download indisponivel");
      return original.call(this, value);
    };
  });
  await page.reload();
  await page.getByLabel("Texto da transcrição · editável").fill("Texto sintético preservado.");
  await page.getByRole("button", { name: "Baixar TXT" }).click();
  await expect(page.getByText("Não foi possível baixar o TXT.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue("Texto sintético preservado.");
});

test("falha ao abrir conexão não deixa indicador de carregamento preso", async ({ page }) => {
  await page.addInitScript(() => {
    const original = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
      if (String(url).includes("/api/transcribe")) throw new Error("conexao indisponivel");
      return original.call(this, method, url, async, username, password);
    };
  });
  await page.reload(); await page.locator("#audio-input").setInputFiles(audio());
  await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.locator("#transcription-error")).toContainText("iniciar a conexão");
  await expect(page.getByRole("button", { name: "Transcrever áudio" })).toBeEnabled();
  await expect(page.getByLabel("Texto da transcrição · editável")).toBeEnabled();
});

test("timeout de rede libera interface para nova tentativa", async ({ page }) => {
  await page.addInitScript(() => {
    const original = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) { this.timeout = 50; return original.call(this, body); };
  });
  await page.reload(); await page.route("**/api/transcribe", (route) => route.continue({ url: transportUrl }));
  await page.locator("#audio-input").setInputFiles(audio()); await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.locator("#transcription-error")).toContainText("tempo de espera");
  await expect(page.getByRole("button", { name: "Transcrever áudio" })).toBeEnabled();
});

test("endpoint real rejeita WAV silencioso antes de depender da chave", async ({ request }) => {
  const silent = wavFixture(); silent.fill(0, 44);
  const response = await request.post("/api/transcribe", { multipart: { file: { name: "silencio.wav", mimeType: "audio/wav", buffer: Buffer.from(silent) } } });
  expect(response.status()).toBe(422); expect((await response.json()).error).toContain("silêncio");
});

test("API com texto semelhante a HTML continua sendo texto, sem execução", async ({ page }) => {
  const text = '<script>window.privateMarker=true</script> Texto sintético.';
  await page.route("**/api/transcribe", (route) => route.fulfill({ json: { text } }));
  await page.locator("#audio-input").setInputFiles(audio()); await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.getByLabel("Texto da transcrição · editável")).toHaveValue(text);
  expect(await page.evaluate(() => "privateMarker" in window)).toBe(false);
});



