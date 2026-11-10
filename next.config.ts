import type { NextConfig } from "next";

const config: NextConfig = {
  // As fontes dos slides são lidas do disco em tempo de execução, e o sharp (conversão de WebP/PNG das fotos de
  // divulgação) precisa dos binários nativos. Sem isto a Vercel não os inclui no pacote da função.
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*", "./node_modules/@img/sharp-libvips-linux-x64/**/*", "./node_modules/@img/sharp-linux-x64/**/*"],
  },
  serverExternalPackages: ["sharp"],
};

export default config;
