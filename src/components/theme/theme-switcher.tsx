"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
const storageKey = "transcritor-theme";
const themeEvent = "transcritor-theme-change";
let fallback: Theme = "system";
let storageFailed = false;
const valid = (value: string | null): value is Theme => value === "light" || value === "dark" || value === "system";
function snapshot(): Theme {
  if (storageFailed) return fallback;
  try { const saved = localStorage.getItem(storageKey); return valid(saved) ? saved : fallback; }
  catch { return fallback; }
}
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
}
function subscribe(changed: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const update = () => { apply(snapshot()); changed(); };
  const storage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) update(); };
  apply(snapshot());
  window.addEventListener(themeEvent, update);
  window.addEventListener("storage", storage);
  media.addEventListener("change", update);
  return () => { window.removeEventListener(themeEvent, update); window.removeEventListener("storage", storage); media.removeEventListener("change", update); };
}
export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "system" as Theme);
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
      Tema
      <select aria-label="Tema visual" value={theme} onChange={(event) => {
        const next = event.target.value;
        if (!valid(next)) return;
        fallback = next;
        try { localStorage.setItem(storageKey, next); storageFailed = false; } catch { storageFailed = true; }
        apply(next);
        window.dispatchEvent(new Event(themeEvent));
      }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <option value="system">Sistema</option>
        <option value="light">Claro</option>
        <option value="dark">Escuro</option>
      </select>
    </label>
  );
}

