// Publica à mão um post cujos slides finais já estão no storage mas cujo roteiro/legenda foram apagados pelo plano B
// (caso de 11/11/2026). Reconstrói slides mínimos (url + alt), grava a legenda e chama o passo de publicação
// segurando o lock do tick (senão o ciclo marca "perdeu_janela" no meio).
//   npx tsx --env-file=.env.local scripts/publicar-slides-aprovados.ts <postId> <pastaSlides> <arquivo-legenda.txt>
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { env } from "../src/lib/env";
import { criarCtx } from "../src/lib/pipeline/orquestrador";
import { executarPublicacao } from "../src/lib/pipeline/publicar";
import { SupabaseBlobs, SupabaseStore } from "../src/lib/store/supabase";
import { agoraSP } from "../src/lib/tempo";
import type { Slide } from "../src/lib/types";

async function main() {
  const [postId, pasta, legendaArq] = process.argv.slice(2);
  if (!postId || !pasta || !legendaArq) throw new Error("uso: <postId> <pastaSlides> <legenda.txt>");
  const legenda = readFileSync(legendaArq, "utf8").trim();
  const store = new SupabaseStore();
  const blobs = new SupabaseBlobs();
  const cfg = await store.getConfig();
  const conta = env("IG_CONTA") || "juliosouza_costa";
  const post = await store.getPost(postId);
  if (!post) throw new Error("post não existe");
  if (post.publicacao.media_id) throw new Error("já publicado");
  const cands = await store.getCandidatos(post.id);
  const pauta = cands && cands.escolhido != null ? cands.candidatos[cands.escolhido] : post.pauta;
  const alts = [
    ["11.11: como sua clínica pode fechar mais sem dar desconto", "Nubank–Shopee: até 50%, limite de R$ 20"],
    ["O 11.11 chegou com até 50% de desconto. E um teto: R$ 20.", "Neste 11 de novembro de 2026, entra em vigor o cupom Nubank–Shopee para clientes elegíveis."],
    ["Não basta ser cliente: é preciso resgatar e pagar com cartão Nubank.", "Percentual, teto e forma de pagamento fazem parte da mesma oferta."],
    ["As datas duplas já movimentaram R$ 14,4 bilhões neste ano.", "De janeiro a setembro de 2026, alta de 42,1% sobre 2025 (InfoMoney, dados Confi)."],
    ["Sua clínica não precisa de liquidação. Precisa de uma proposta clara.", "Valor total, o que está incluído e condições de pagamento devem aparecer juntos."],
    ["No WhatsApp, não termine a conversa no preço.", "Após enviar o orçamento, pergunte qual dúvida ficou sobre valores ou condições."],
    ["Antes de baixar o preço, esclareça a proposta.", "Salve, encaminhe para um dentista ou dono de clínica e me chame no direct."],
  ];
  const slides: Slide[] = alts.map(([titulo, corpo], i) => {
    const storage_path = `${pasta}/slide-${String(i + 1).padStart(2, "0")}.jpg`;
    const url = `${env("SUPABASE_URL")}/storage/v1/object/public/${env("SUPABASE_BUCKET") || "carrosseis"}/${storage_path}`;
    return { n: i + 1, papel: i === 0 ? "capa" : i === 6 ? "fechamento" : "contexto", layout: i === 0 ? "capa" : i === 6 ? "cta" : "texto", titulo, corpo, destaque: null, imagem_idx: null, hipotetico: false, url, storage_path };
  });
  const dono = randomUUID();
  if (!(await store.obterLock("tick", 285, dono))) throw new Error("tick ocupado; tente de novo");
  try {
    let p = (await store.atualizarPost(post.id, { pauta, tipo_pauta: "noticia", slides, legenda, status: "pronto", erro: null, motivo: null, proxima_tentativa_em: null, justificativa: `${post.justificativa ?? ""} | Publicado à mão com os slides aprovados às 09:35 (plano B indevido às 11:45).` }))!;
    const ctx = criarCtx(store, blobs, cfg, agoraSP(), conta);
    const r = await executarPublicacao(ctx, p);
    console.log(r.resultado, r.mensagem, r.post.publicacao.permalink ?? "");
  } finally {
    await store.liberarLock("tick", dono);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
