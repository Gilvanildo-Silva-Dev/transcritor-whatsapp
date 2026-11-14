export {};
declare global {
  interface Window {
    transcritorDesktop?: {
      readonly isDesktop: true;
      getTheme(): "light" | "dark" | "system";
      setTheme(theme: "light" | "dark" | "system"): Promise<void>;
    };
  }
}
