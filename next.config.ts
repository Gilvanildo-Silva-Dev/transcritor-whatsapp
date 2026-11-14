import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Python e pesos sao provisionados localmente, nunca copiados para o pacote Next.
  outputFileTracingExcludes: {
    "/*": ["./.venv/**/*", "./.local-models/**/*", "./.local-cache/**/*", "./.env*"],
  },
};

export default nextConfig;
