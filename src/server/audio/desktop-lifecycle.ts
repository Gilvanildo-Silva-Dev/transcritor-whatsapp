import "server-only";

type DesktopProcess = NodeJS.Process & { __transcritorDesktopJobs?: Set<AbortController> };
export function registerDesktopJob() {
  if (process.env.TRANSCRITOR_DESKTOP_RUNTIME !== "1") return null;
  const runtime = process as DesktopProcess;
  const jobs = runtime.__transcritorDesktopJobs ??= new Set<AbortController>();
  const controller = new AbortController();
  jobs.add(controller);
  return { signal: controller.signal, finish: () => { jobs.delete(controller); } };
}
