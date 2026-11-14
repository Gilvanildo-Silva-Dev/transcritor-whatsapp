import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";

export default function Home() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">Em desenvolvimento</span>
        <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Seus áudios do WhatsApp, em texto.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">Um espaço para transformar fala em texto com inteligência artificial. Estamos preparando os primeiros passos.</p>
        <Card className="mt-10 max-w-2xl" aria-labelledby="project-status">
          <h2 id="project-status" className="text-xl font-semibold">Estrutura inicial pronta</h2>
          <p className="mt-3 leading-relaxed text-slate-600">Esta é a primeira etapa do projeto. O envio de arquivos e a transcrição de áudios serão disponibilizados nas próximas etapas.</p>
        </Card>
      </main>
      <footer className="mx-auto max-w-5xl px-6 pb-8 text-sm text-slate-500">Transcritor de Áudios WhatsApp · Projeto independente, sem vínculo com o WhatsApp.</footer>
    </>
  );
}
