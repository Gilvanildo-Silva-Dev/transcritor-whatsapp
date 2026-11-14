import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { files: ["desktop/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  globalIgnores([".next/**", "out/**", "dist/**", "next-env.d.ts", ".desktop-build/**", "dist-desktop/**", ".venv/**", ".local-models/**", ".local-cache/**"]),
]);
