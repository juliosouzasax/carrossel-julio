// Confere se os modelos configurados existem para a SUA chave. Rode antes da primeira execução real:
//   npm run check:modelos
import { configPadrao } from "../src/lib/config";
import { listarModelos } from "../src/lib/openai";

async function main() {
  const cfg = configPadrao();
  const disponiveis = new Set(await listarModelos());
  const usados = { ...cfg.modelos };
  let falta = false;
  for (const [funcao, nome] of Object.entries(usados)) {
    const ok = disponiveis.has(nome);
    if (!ok) falta = true;
    console.log(`${ok ? "OK    " : "FALTA "} ${funcao.padEnd(14)} ${nome}`);
  }
  if (falta) {
    const sugestoes = [...disponiveis].filter((m) => /gpt-6|gpt-image/.test(m));
    console.log("\nModelos parecidos que a sua chave enxerga:\n  " + (sugestoes.join("\n  ") || "(nenhum encontrado)"));
    console.log("\nAjuste os nomes em Configuração > modelos (ou em src/lib/config.ts) e rode de novo.");
    process.exitCode = 1;
  }
}
main().catch((e) => { console.error("Erro:", (e as Error).message); process.exitCode = 1; });
