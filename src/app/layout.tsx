import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transcritor de Áudios WhatsApp",
  description: "Aplicativo para converter a fala de áudios do WhatsApp em texto com inteligência artificial. Transcrição local gratuita com identificação de idioma.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=window.transcritorDesktop?window.transcritorDesktop.getTheme():localStorage.getItem('transcritor-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}})();` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
