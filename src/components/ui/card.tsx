import type { ComponentPropsWithoutRef } from "react";

export function Card({ className = "", ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={`rounded-2xl border border-emerald-100 dark:border-emerald-900 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-8 ${className}`} {...props} />;
}
