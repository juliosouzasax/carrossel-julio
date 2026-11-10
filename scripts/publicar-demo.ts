// PUBLICA DE VERDADE, no Instagram, um carrossel que já foi gerado e revisado pelo `npm run demo` (out/demo-resultado/post.json).
// Só roda com a flag explícita --publicar-de-verdade. Sem ela, mostra o que faria e sai.
//
//   npm run publicar:demo -- --publicar-de-verdade
//
// O que faz: sobe as imagens-base para o Supabase, cria o post do dia (kind "dia") já APROVADO (a revisão aconteceu no demo),
// renderiza os slides com URL pública, roda a checagem final de atualidade e publica pela API oficial. Idempotente por (conta, data).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { env } from "../src/lib/env";
import { avancar, criarCtx } from "../src/lib/pipeline/orquestrador";
import { executarRender } from "../src/lib/pipeline/renderizar";
import { SupabaseBlobs, SupabaseStore } from "../src/lib/store/supabase";
import { agoraSP } from "../src/lib/tempo";
import { STATUS_TERMINAIS, type Post } from "../src/lib/types";

async function main() {
  const deVerdade = process.argv.includes("--publicar-de-verdade");
  const pasta = path.join(process.cwd(), "out", "demo-resultado");
  const arq = path.join(pasta, "post.json");
  if (!existsSync(arq)) throw new Error(`Não achei ${arq}. Rode "npm run demo" antes.`);
  const demo = JSON.parse(readFileSync(arq, "utf8")) as Post;
  if (!demo.roteiro || !demo.slides.length) throw new Error("O post do demo não tem roteiro/slides.");
  if (!["simulado", "pronto", "aprovado", "aguardando_aprovacao"].includes(demo.status)) throw new Error(`O post do demo terminou em "${demo.status}" (${demo.motivo ?? demo.erro ?? "sem motivo"}); não é publicável.`);
  const aprovou = demo.revisoes.length && demo.revisoes[demo.revisoes.length - 1].aprovado;
  if (!aprovou) throw new Error("A última revisão do demo NÃO aprovou o conteúdo; não publico.");
  if (env("STORE") === "memory") throw new Error("Rode SEM STORE=memory: a publicação precisa do Supabase.");

  const conta = env("IG_CONTA") || "juliosouza_costa";
  const agora = agoraSP();
  console.log(`== ${deVerdade ? "PUBLICAÇÃO REAL" : "ENSAIO (sem --publicar-de-verdade: nada será publicado)"} ==`);
  console.log(`Headline: ${demo.roteiro.headline_escolhida}\nSlides: ${demo.slides.length} | Data: ${agora.data} | Conta: ${conta}`);
  if (!deVerdade) return;

  const store = new SupabaseStore();
  const blobs = new SupabaseBlobs();
  const cfgBanco = await store.getConfig();
  // Esta execução publica mesmo que a configuração do painel esteja em modo de teste: a flag na linha de comando é o consentimento.
  const cfg = { ...cfgBanco, modo_teste: false, ativo: true, modo: "automatico" as const };
  const ctx = criarCtx(store, blobs, cfg, agora, conta);

  // 1) Imagens-base do disco → Supabase (mesmos caminhos; URLs passam a ser públicas).
  const localBlobs = path.join(process.cwd(), "out", "demo");
  const imagens_base = [];
  for (const img of demo.imagens_base) {
    const local = path.join(localBlobs, img.storage_path);
    if (!existsSync(local)) throw new Error(`Imagem-base não encontrada em disco: ${local}`);
    const { url } = await blobs.put(img.storage_path, readFileSync(local), "image/jpeg");
    imagens_base.push({ ...img, url });
  }
  console.log(`${imagens_base.length} imagem(ns)-base enviadas ao Supabase.`);

  // 2) Post do dia, já aprovado (a revisão foi feita no demo e fica registrada).
  const { post: criado, criado: novo } = await store.criarPost({
    conta,
    data: agora.data,
    kind: "dia",
    status: "aprovado",
    modo: "automatico",
    tipo_pauta: demo.tipo_pauta,
    pauta: demo.pauta,
    justificativa: `${demo.justificativa ?? ""} (gerado e aprovado pelo demo; publicado por npm run publicar:demo)`.trim(),
    roteiro: demo.roteiro,
    slides: demo.slides.map((s) => ({ ...s, url: null, storage_path: null, bytes: null })),
    legenda: demo.legenda,
    imagens_base,
    revisoes: demo.revisoes,
  });
  if (!novo) {
    if (STATUS_TERMINAIS.includes(criado.status)) throw new Error(`Já existe um post do dia ${agora.data} com status "${criado.status}" (${criado.publicacao.permalink ?? criado.motivo ?? ""}). Não publico duas vezes no mesmo dia.`);
    console.log(`Já existia o post do dia (${criado.status}); vou continuar a partir dele.`);
  }
  let post = criado;

  // 3) Renderiza com URL pública e segue: aprovado → checagem final → pronto → publicação.
  if (!post.slides.every((s) => s.url?.startsWith("https://"))) post = await executarRender(ctx, { ...post, status: "aprovado" });
  post = (await store.atualizarPost(post.id, { status: "aprovado" })) ?? post;
  for (let i = 0; i < 12; i++) {
    const r = await avancar(ctx, post, { forcar: true });
    post = r.post;
    console.log(`→ ${r.acao} (${post.status})`);
    if (STATUS_TERMINAIS.includes(post.status) || r.acao.startsWith("nada")) break;
    if (post.proxima_tentativa_em) await new Promise((res) => setTimeout(res, 5000));
  }
  console.log(`\nStatus final: ${post.status}`);
  if (post.publicacao.permalink) console.log(`PUBLICADO: ${post.publicacao.permalink} (id ${post.publicacao.media_id})`);
  else console.log(`Não publicado. Motivo: ${post.erro ?? post.motivo ?? post.publicacao.ultimo_erro ?? "veja os logs no painel"}`);
}
main().catch((e) => {
  console.error("Erro:", (e as Error).message);
  process.exitCode = 1;
});
