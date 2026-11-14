import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Python e pesos sao provisionados localmente, nunca copiados para o pacote Next.
  outputFileTracingExcludes: {
    "/*": ["./.venv/**/*", "./.local-models/**/*", "./.local-cache/**/*", "./.env*", "./.desktop-build/**/*", "./dist-desktop/**/*", "./tests/**/*", "./test-results/**/*", "./playwright-report/**/*"],
  },
};

export default nextConfig;
