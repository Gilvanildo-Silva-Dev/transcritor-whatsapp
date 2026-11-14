import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function AppHeader() {
  return (
    <header className="border-b border-slate-200/80 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm"><Icon name="audio" width="25" height="25" /></span>
          <span><span className="block text-sm font-bold tracking-tight sm:text-base">Transcritor de Áudios WhatsApp</span><span className="mt-0.5 block text-xs text-slate-500">Menos tempo ouvindo. Mais clareza.</span></span>
        </Link>
        <span className="hidden shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 sm:block">Prévia da interface</span>
      </div>
    </header>
  );
}

