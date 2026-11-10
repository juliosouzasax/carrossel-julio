// Renderização de TESTE com conteúdo de exemplo FIXO (fixture). Não chama OpenAI, Meta nem banco.
// Serve para conferir tipografia, margens, proporção 4:5 e exportação em JPEG.
// O fundo da capa é um degradê gerado por código — NÃO é uma imagem da IA.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { configPadrao } from "../src/lib/config";
import { mesAnoDe, renderizarSlideJpeg } from "../src/lib/render/slides";
import { dataUri } from "../src/lib/render/jpeg";
import type { Slide } from "../src/lib/types";

function fundoProcedural(): Buffer {
  const w = 1024;
  const h = 1536;
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dx = (x - w * 0.7) / w;
      const dy = (y - h * 0.3) / h;
      const brilho = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.2);
      png.data[i] = Math.round(18 + 150 * brilho);
      png.data[i + 1] = Math.round(16 + 110 * brilho);
      png.data[i + 2] = Math.round(12 + 40 * brilho);
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const base = { corpo: "", destaque: null, imagem_idx: null, hipotetico: false } as const;
export const slidesDeExemplo: Slide[] = [
  { ...base, n: 1, papel: "capa", layout: "capa", titulo: "A fila do WhatsApp que ninguém responde", corpo: "O que isso custa à sua clínica", destaque: "ninguém responde", imagem_idx: 0 },
  { ...base, n: 2, papel: "contexto", layout: "foto", rotulo: "CONSUMO", titulo: "Depois de 23 anos e 234 jogos, o capitão encerrou a história com a seleção num vídeo publicado nos próprios canais.", destaque: "23 anos e 234 jogos,", corpo: "A saída veio um mês depois de uma briga com o técnico, que o deixou no banco contra a Noruega.\nMeses antes, um especialista já comparava o tamanho do jogador com o da própria seleção.", fonte_dado: "Record / Lusa", imagem_idx: 0 },
  { ...base, n: 3, papel: "contexto", layout: "citacao", rotulo: "MARKETING", titulo: "Ele é incomparavelmente maior do que toda a seleção e mais não sei quantas juntas.", destaque: "incomparavelmente maior", autor: "Daniel Sá, diretor-executivo do Instituto Português de Administração de Marketing", fonte_dado: "Record / Lusa, julho de 2026", corpo: "Na época da briga, a conta dele tinha cerca de 679 milhões de seguidores, 27 vezes mais do que os 25 milhões da seleção.", imagem_idx: 0 },
  { ...base, n: 8, papel: "contexto", layout: "foto_escura", titulo: "Nos dois dias seguintes, a conta da seleção perdeu mais de 1,5 milhão de seguidores, cerca de 6%.", destaque: "mais de 1,5 milhão de seguidores,", corpo: "Parte dos fãs promoveu um boicote às redes da seleção, e cartazes de apoio a ele apareceram em Lisboa e Oeiras.", fonte_dado: "Record", imagem_idx: 0 },
  { ...base, n: 3, papel: "aprendizado", layout: "dados", titulo: "Velocidade vende mais que desconto", destaque: "Velocidade", numeros: [{ valor: "5 min", rotulo: "meta de primeira resposta no horário comercial" }, { valor: "1 em 3", rotulo: "conversas que esfriam sem retorno (exemplo ilustrativo)" }], corpo: "Números de referência para a sua meta, não uma pesquisa.", fonte_dado: "metas sugeridas, sem pesquisa citada" },
  { ...base, n: 4, papel: "aplicacao", layout: "comparativo", titulo: "Resposta que avança vs resposta que devolve", colunas: [{ titulo: "Avança", itens: ["Temos quinta às 15h, serve?", "Já deixo reservado para você"] }, { titulo: "Devolve", itens: ["Venha conhecer a clínica", "Os valores variam"] }], corpo: "Toda mensagem precisa terminar em um próximo passo." },
  { ...base, n: 5, papel: "exemplo", layout: "imagem", titulo: "Uma clínica, duas respostas", corpo: "Mesma pergunta, duas respostas. A primeira marca avaliação. A segunda devolve o trabalho ao paciente.", destaque: "duas respostas", imagem_idx: 0, hipotetico: true },
  { ...base, n: 6, papel: "acao", layout: "checklist", titulo: "Antes de investir em anúncio, responda:", destaque: "responda:", itens: ["Quanto tempo leva a 1ª resposta?", "Quem responde fora do horário?", "Onde o retorno fica registrado?"], corpo: "Se travou numa resposta, o gargalo é aí." },
  { ...base, n: 7, papel: "fechamento", layout: "cta", titulo: "Salve e mande para quem responde seu WhatsApp", corpo: "Siga para ver o próximo.", destaque: "Salve" },
];

async function main() {
  const cfg = configPadrao();
  const fundo = dataUri(fundoProcedural(), "png");
  const saida = path.join(process.cwd(), "out", "demo-render");
  mkdirSync(saida, { recursive: true });
  for (const s of slidesDeExemplo) {
    const ctx = { total: slidesDeExemplo.length, identidade: cfg.identidade, imagemDataUri: s.imagem_idx !== null ? fundo : null, ilustrativo: s.papel === "capa", mesAno: mesAnoDe("2026-11-09") };
    const t0 = Date.now();
    const { jpeg, largura, altura } = await renderizarSlideJpeg(s, ctx);
    const arq = path.join(saida, `slide-${String(s.n).padStart(2, "0")}-${s.layout}.jpg`);
    writeFileSync(arq, jpeg);
    console.log(`${arq}  ${largura}x${altura}  ${(jpeg.length / 1024).toFixed(0)} KB  ${Date.now() - t0} ms`);
  }
  console.log("\nTESTE: conteúdo fixo, fundo procedural. Nada foi enviado a OpenAI, Meta ou banco.");
}

if (process.argv[1]?.endsWith("demo-render.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
