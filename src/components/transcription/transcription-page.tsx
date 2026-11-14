import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { TranscriptionWorkspace } from "@/components/transcription/transcription-workspace";

export function TranscriptionPage({ localMode = true }: { localMode?: boolean }) {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 pb-12 pt-12 sm:px-8 sm:pt-16">
        <div className="mb-10 max-w-2xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{localMode ? "Transcrição gratuita no seu computador" : "Do áudio à palavra"}</p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">{localMode ? "Seu áudio em texto, gratuitamente." : "Dê voz ao seu texto."}</h1>
          <p className="mt-4 text-base leading-7 text-slate-500 sm:text-lg">{localMode ? "Selecione seu áudio e transcreva de verdade com Whisper local, sem chave de API e sem cobrança por transcrição." : "Selecione um áudio, ouça a prévia e prepare sua transcrição em um só lugar."}</p>
          <Link href={localMode ? "/openai" : "/"} className="mt-4 inline-block rounded text-sm font-semibold text-emerald-700 underline decoration-emerald-200 underline-offset-4 hover:decoration-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">{localMode ? "Usar OpenAI (API paga)" : "Transcrever gratuitamente neste computador"}</Link>
        </div>
        <TranscriptionWorkspace localMode={localMode} />
      </main>
      <footer className="mx-auto flex max-w-6xl flex-col justify-between gap-2 border-t border-slate-200 px-5 py-6 text-xs leading-5 text-slate-400 sm:flex-row sm:px-8"><span>Transcritor de Áudios WhatsApp</span><span>Projeto independente, sem vínculo com o WhatsApp.</span></footer>
    </div>
  );
}

