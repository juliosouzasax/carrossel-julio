// Comparação simples de textos para evitar repetir headlines e assuntos.
const PARADAS = new Set(["de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "no", "na", "nos", "nas", "um", "uma", "que", "para", "por", "com", "se", "ao", "à", "como", "mais", "sua", "seu", "ja", "já", "nao", "não"]);

export function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(t: string): Set<string> {
  return new Set(
    normalizar(t)
      .split(" ")
      .filter((w) => w.length > 2 && !PARADAS.has(w)),
  );
}

export function jaccard(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

export function maisParecido(texto: string, outros: string[]): { score: number; com: string | null } {
  let melhor = { score: 0, com: null as string | null };
  for (const o of outros) {
    const s = jaccard(texto, o);
    if (s > melhor.score) melhor = { score: s, com: o };
  }
  return melhor;
}

export function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Domínio "registrável" aproximado (agrupa subdomínios do mesmo veículo: g1.globo.com e oglobo.globo.com → globo.com).
export function dominioRaiz(url: string): string {
  const h = dominioDe(url);
  if (!h) return "";
  const p = h.split(".");
  if (p.length <= 2) return h;
  const sufixosDuplos = ["com.br", "org.br", "gov.br", "net.br", "co.uk"];
  const ult2 = p.slice(-2).join(".");
  return sufixosDuplos.includes(ult2) ? p.slice(-3).join(".") : ult2;
}
