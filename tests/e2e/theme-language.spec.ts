import { expect, test } from "@playwright/test";
import { wavFixture } from "../audio-fixtures";

test("tema claro/escuro persiste na recarga e na navegação sem erro de hidratação", async ({ page }) => {
  const hydration: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && /hydration|server rendered|didn't match/i.test(message.text())) hydration.push(message.text()); });
  await page.goto("/");
  await page.getByLabel("Tema visual").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 20, 18)");
  await page.reload(); await expect(page.getByLabel("Tema visual")).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "Usar OpenAI (API paga)" }).click();
  await expect(page.getByLabel("Tema visual")).toHaveValue("dark");
  await page.getByLabel("Tema visual").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(247, 249, 248)");
  expect(hydration).toEqual([]);
});
test("tema Sistema acompanha mudanças da preferência do dispositivo", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" }); await page.goto("/");
  await expect(page.getByLabel("Tema visual")).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("se localStorage bloquear gravação, tema ainda muda nesta sessão", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("transcritor-theme", "light");
    Storage.prototype.setItem = () => { throw new DOMException("Bloqueado", "SecurityError"); };
  });
  await page.goto("/"); await page.getByLabel("Tema visual").selectOption("dark");
  await expect(page.getByLabel("Tema visual")).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
test("tema escuro mantém seleção de áudio e idioma com percentual estimado", async ({ page }) => {
  await page.route("**/api/transcribe/local", (route) => route.fulfill({ json: { text: "Synthetic language result.", language: { code: "en", confidence: 0.94 } } }));
  await page.goto("/"); await page.getByLabel("Tema visual").selectOption("dark");
  await page.locator("#audio-input").setInputFiles({ name: "sample.wav", mimeType: "audio/wav", buffer: Buffer.from(wavFixture()) });
  await page.getByRole("button", { name: "Transcrever áudio" }).click();
  const panel = page.getByRole("region", { name: "Idioma do áudio" });
  await expect(panel.getByText("Inglês", { exact: true })).toBeVisible();
  await expect(panel.getByText("94,0%", { exact: true })).toBeVisible();
  await expect(panel).toContainText("não é garantia");
  await page.getByRole("button", { name: "Remover áudio selecionado" }).click();
  await expect(panel).toHaveCount(0);
});
test("sem confiança ou com dado inválido não mostra porcentagem fictícia", async ({ page }) => {
  await page.route("**/api/transcribe/local", (route) => route.fulfill({ json: { text: "Teste sintético.", language: { code: "pt", confidence: 97 } } }));
  await page.goto("/"); await page.locator("#audio-input").setInputFiles({ name: "sample.wav", mimeType: "audio/wav", buffer: Buffer.from(wavFixture()) });
  await page.getByRole("button", { name: "Transcrever áudio" }).click();
  await expect(page.getByRole("region", { name: "Idioma do áudio" }).getByText("Não informada", { exact: true })).toBeVisible();
});
test("seletor de tema cabe na tela estreita", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await page.goto("/");
  await page.getByLabel("Tema visual").selectOption("dark");
  await expect(page.getByLabel("Tema visual")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("captura visual dos temas", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 1000 }); await page.goto("/");
  await page.getByLabel("Tema visual").selectOption("dark"); await page.screenshot({ path: info.outputPath("dark-desktop.png"), fullPage: true, animations: "disabled" });
  await page.getByLabel("Tema visual").selectOption("light"); await page.screenshot({ path: info.outputPath("light-desktop.png"), fullPage: true, animations: "disabled" });
});


test("botão principal mantém contraste de texto nos dois temas, inclusive ao passar o mouse", async ({ page }) => {
  await page.goto("/");
  await page.locator("#audio-input").setInputFiles({ name: "sample.wav", mimeType: "audio/wav", buffer: Buffer.from(wavFixture()) });
  const button = page.getByRole("button", { name: "Transcrever áudio" });
  await expect(button).toBeEnabled();
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Tema visual").selectOption(theme);
    for (const hover of [false, true]) {
      if (hover) await button.hover(); else await page.mouse.move(0, 0);
      await expect.poll(() => button.evaluate((node) => {
        const style = getComputedStyle(node);
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
          const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const foreground = luminance(style.color); const background = luminance(style.backgroundColor);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      })).toBeGreaterThanOrEqual(4.5);
    }
  }
});
