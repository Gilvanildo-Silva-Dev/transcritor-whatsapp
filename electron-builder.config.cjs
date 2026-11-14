module.exports = {
  appId: "br.local.transcritorwhatsapp",
  productName: "Transcritor de Áudios WhatsApp",
  directories: { output: "dist-desktop" },
  asar: true,
  files: ["desktop/main.cjs", "desktop/preload.cjs", "desktop/security.cjs", "package.json", "!node_modules/**/*"],
  extraResources: [{ from: ".desktop-build/resources", to: ".", filter: ["**/*"] }],
  npmRebuild: false,
  compression: "normal",
  win: { icon: ".desktop-build/icon.ico", target: [{ target: "nsis", arch: ["x64"] }, { target: "portable", arch: ["x64"] }], signAndEditExecutable: true },
  nsis: {
    oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true, createStartMenuShortcut: true,
    artifactName: "TranscritorWhatsApp-Setup-${version}.${ext}",
    installerIcon: ".desktop-build/icon.ico", uninstallerIcon: ".desktop-build/icon.ico",
  },
  portable: { useZip: true, artifactName: "TranscritorWhatsApp-Portable-${version}.${ext}" },
  publish: null,
};

