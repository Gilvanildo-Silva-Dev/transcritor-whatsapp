const { contextBridge, ipcRenderer } = require("electron");
let theme = process.argv.find((arg) => arg.startsWith("--transcritor-theme="))?.split("=")[1] || "system";
if (!["light", "dark", "system"].includes(theme)) theme = "system";
contextBridge.exposeInMainWorld("transcritorDesktop", {
  isDesktop: true,
  getTheme: () => theme,
  setTheme: (value) => {
    if (!["light", "dark", "system"].includes(value)) return Promise.reject(new Error("Invalid theme."));
    theme = value;
    return ipcRenderer.invoke("desktop:theme:set", value);
  },
});
