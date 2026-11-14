import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transcritor de Áudios WhatsApp",
  description: "Aplicativo para converter a fala de áudios do WhatsApp em texto com inteligência artificial. Em desenvolvimento.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
