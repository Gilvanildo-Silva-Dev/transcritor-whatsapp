export {};
declare global {
  interface Window {
    transcritorDesktop?: {
      readonly isDesktop: true;
      selectAudio(): Promise<{file: {name: string; data: Uint8Array}} | {error: string} | null>;
      getTheme(): "light" | "dark" | "system";
      setTheme(theme: "light" | "dark" | "system"): Promise<void>;
    };
  }
}
