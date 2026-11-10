// Devolve o post do dia à pauta de NOTÍCIA escolhida pela pesquisa, depois de um plano B indevido.
// Relê o material das fontes (texto + fotos de divulgação), zera roteiro/slides/revisões e o contador de fallback.
//
//   npx tsx --env-file=.env.local scripts/refazer-pauta.ts [AAAA-MM-DD] [--pausado]
//
// --pausado deixa o post pausado (útil enquanto um deploy não ficou pronto); retomar pelo painel ou por --retomar.
import { env } from "../src/lib/env";
import { criarCtx } from "../src/lib/pipeline/orquestrador";
import { materialDaPauta } from "../src/lib/pipeline/pesquisa";
import { SupabaseBlobs, SupabaseStore } from "../src/lib/store/supabase";
import { agoraSP } from "../src/lib/tempo";

async function main() {
  const args = process.argv.slice(2);
  const data = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? agoraSP().data;
  const pausado = args.includes("--pausado");
  const conta = env("IG_CONTA") || "juliosouza_costa";
  const store = new SupabaseStore();
  const blobs = new SupabaseBlobs();
  const cfg = await store.getConfig();
  const post = await store.getPostPorData(conta, data, "dia");
  if (!post) throw new Error(`Não há post do dia ${data}.`);
  if (["publicado", "publicando"].includes(post.status)) throw new Error(`Post já está "${post.status}"; não mexo.`);

  if (args.includes("--retomar")) {
    await store.atualizarPost(post.id, { pausado: false });
    console.log(`Post ${post.id} retomado.`);
    return;
  }

  const cands = await store.getCandidatos(post.id);
  if (!cands || cands.escolhido === null || cands.escolhido === undefined) throw new Error("A pesquisa do dia não tem candidato escolhido.");
  const pauta = cands.candidatos[cands.escolhido];
  console.log(`Pauta escolhida pela pesquisa: "${pauta.titulo}" (${pauta.fontes.length} fonte(s)). Status atual do post: ${post.status} / ${post.tipo_pauta}.`);

  const ctx = criarCtx(store, blobs, cfg, agoraSP(), conta);
  const { imagens_base, pauta: comMaterial } = await materialDaPauta(ctx, post, pauta);
  const atual = await store.atualizarPost(post.id, {
    pauta: comMaterial,
    tipo_pauta: "noticia",
    justificativa: `${cands.justificativa} (pauta restaurada à mão em ${new Date().toISOString()} após plano B indevido)`,
    roteiro: null,
    slides: [],
    legenda: "",
    imagens_base,
    revisoes: [],
    recheck: null,
    tentativas: {},
    erro: null,
    motivo: null,
    proxima_tentativa_em: null,
    status: "pesquisado",
    pausado,
  });
  console.log(`OK: post ${atual?.id} em "${atual?.status}" (${atual?.tipo_pauta}), ${imagens_base.length} foto(s) real(is), ${comMaterial.trechos?.length ?? 0} matéria(s) lida(s), pausado=${pausado}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
