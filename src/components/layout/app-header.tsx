export function AppHeader() {
  return (
    <header className="border-b border-emerald-100 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-5">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-emerald-700 font-bold text-white">T</span>
        <span className="text-sm font-semibold sm:text-base">Transcritor de Áudios WhatsApp</span>
      </div>
    </header>
  );
}
