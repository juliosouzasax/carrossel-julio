// EXECUÇÃO DEMONSTRATIVA (TESTE). Roda o pipeline inteiro de verdade — pesquisa na web, roteiro, imagens,
// renderização, revisão e checagem final — usando a OpenAI real, e termina em publicação SIMULADA.
// NADA é enviado ao Instagram. Os resultados ficam em out/demo/.
//   npm run demo        (precisa de OPENAI_API_KEY em .env.local; gera custo na OpenAI)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "../src/lib/env";
import { avancar, criarCtx } from "../src/lib/pipeline/orquestrador";
import { agoraSP } from "../src/lib/tempo";
import { getBlobs, getStore } from "../src/lib/store";
import { STATUS_TERMINAIS } from "../src/lib/types";

async function main() {
  if (!env("OPENAI_API_KEY")) {
    console.error("OPENAI_API_KEY não configurada: a execução demonstrativa precisa da chave (veja README). Nada foi executado.");
    process.exitCode = 1;
    return;
  }
  const store = getStore();
  await store.saveConfig({ modo_teste: true, ativo: true, modo: "automatico" });
  const agora = agoraSP();
  const { post: criado } = await store.criarPost({ conta: "demo", data: agora.data, kind: "teste", status: "novo", modo: "automatico" });
  let post = criado;
  console.log("== EXECUÇÃO DE TESTE — nada será publicado no Instagram ==\n");
  for (let i = 0; i < 40; i++) {
    const cfg = await store.getConfig();
    const ctx = criarCtx(store, getBlobs(), cfg, agoraSP(), "demo");
    const t0 = Date.now();
    const r = await avancar(ctx, post, { forcar: true });
    post = r.post;
    console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${r.acao} → ${post.status}`);
    if (r.acao.startsWith("nada") || STATUS_TERMINAIS.includes(post.status)) break;
  }
  const uso = await store.usoDoPost(post.id);
  const custo = uso.reduce((a, u) => a + u.custo_usd, 0);
  const pasta = path.join(process.cwd(), "out", "demo-resultado");
  mkdirSync(pasta, { recursive: true });
  writeFileSync(path.join(pasta, "resumo.json"), JSON.stringify({ status: post.status, pauta: post.pauta, justificativa: post.justificativa, legenda: post.legenda, revisoes: post.revisoes, custo_estimado_usd: custo, publicacao: post.publicacao }, null, 2));
  // Post completo (roteiro, slides, imagens-base com caminhos locais): é o que `npm run publicar:demo` usa para publicar de verdade.
  writeFileSync(path.join(pasta, "post.json"), JSON.stringify(post, null, 2));
  console.log(`\nStatus final: ${post.status}${post.publicacao.simulada ? " (publicação SIMULADA — nada foi ao Instagram)" : ""}`);
  console.log(`Assunto: ${post.pauta?.titulo ?? "-"}\nHeadline: ${post.roteiro?.headline_escolhida ?? "-"}\nCusto estimado: US$ ${custo.toFixed(2)}`);
  console.log(`Slides, imagens e resumo em: out/demo/ e ${path.relative(process.cwd(), pasta)}/resumo.json`);
  if (post.erro) console.log(`Último erro: ${post.erro}`);
}
main().catch((e) => { console.error("Erro:", (e as Error).message); process.exitCode = 1; });
