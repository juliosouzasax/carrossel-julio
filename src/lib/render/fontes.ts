import { readFileSync } from "node:fs";
import path from "node:path";

type Fonte = { name: string; data: Buffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" | "italic" };

let cache: Fonte[] | null = null;

// Fontes em assets/fonts (copiadas do @fontsource, licença OFL), incluídas no pacote da função
// pelo outputFileTracingIncludes do next.config.ts.
//  - Anton: manchete condensada gigante
//  - Archivo: texto corrido
//  - PT Serif: frases-tese e títulos serifados
export function fontes(): Fonte[] {
  if (cache) return cache;
  const dir = path.join(process.cwd(), "assets", "fonts");
  const ler = (arq: string) => readFileSync(path.join(dir, arq));
  cache = [
    { name: "Anton", data: ler("anton-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Archivo", data: ler("archivo-latin-500-normal.woff"), weight: 500, style: "normal" },
    { name: "Archivo", data: ler("archivo-latin-600-normal.woff"), weight: 600, style: "normal" },
    { name: "Archivo", data: ler("archivo-latin-800-normal.woff"), weight: 800, style: "normal" },
    { name: "PT Serif", data: ler("pt-serif-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "PT Serif", data: ler("pt-serif-latin-400-italic.woff"), weight: 400, style: "italic" },
    { name: "PT Serif", data: ler("pt-serif-latin-700-normal.woff"), weight: 700, style: "normal" },
  ];
  return cache;
}
