// Leitura de variáveis de ambiente. Os valores nunca são impressos nem registrados em log.
export function env(nome: string, opcoes?: { obrigatoria?: boolean }): string {
  const v = process.env[nome];
  if (v && v.trim()) return v.trim();
  if (opcoes?.obrigatoria) {
    throw new Error(`Variável de ambiente ${nome} não configurada. Veja .env.example e o README.`);
  }
  return "";
}

export function envObrigatoria(nome: string): string {
  return env(nome, { obrigatoria: true });
}

export function graphVersion(): string {
  return env("IG_GRAPH_VERSION") || "v27.0";
}

// Remove de qualquer texto de erro/log o que parece segredo (tokens, chaves).
export function sanitizar(texto: string): string {
  return texto
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-***")
    .replace(/(access_token=)[^&\s"']+/gi, "$1***")
    .replace(/(client_secret=)[^&\s"']+/gi, "$1***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{16,}/g, "$1***")
    .replace(/IG[A-Za-z0-9_-]{40,}/g, "IG***")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "jwt***");
}
