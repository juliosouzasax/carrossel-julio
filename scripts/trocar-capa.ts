// Troca a CAPA de um post (texto + imagem gerada a partir de uma cena) e manda de volta para render + revisão.
//   npx tsx --env-file=.env.local scripts/trocar-capa.ts <postId> "<titulo>" "<destaque>" "<corpo>" "<cena em inglês>"
import { configPadrao, mesclarConfig } from "../src/lib/config";
import { gerarImagem } from "../src/lib/openai";
import { promptImagem } from "../src/prompts";
import { SupabaseBlobs, SupabaseStore } from "../src/lib/store/supabase";
import type { ImagemBase } from "../src/lib/types";

async function main() {
  const [postId, titulo, destaque, corpo, cena] = process.argv.slice(2);
  if (!postId || !titulo || !cena) throw new Error("uso: postId titulo destaque corpo cena");
  const store = new SupabaseStore();
  const blobs = new SupabaseBlobs();
  const cfg = mesclarConfig(configPadrao(), await store.getConfig());
  const post = await store.getPost(postId);
  if (!post?.roteiro) throw new Error("post sem roteiro");
  const p = promptImagem({ cena, cfg, ilustrativo: false, funcao: "capa" });
  const img = await gerarImagem({ modelo: cfg.modelos.imagem_capa, prompt: p.prompt, tamanho: cfg.imagens.tamanho, qualidade: cfg.imagens.qualidade_capa });
  const caminho = `${post.data}/${post.id}/base-0-capa-${Date.now().toString(36)}.jpg`;
  const { url } = await blobs.put(caminho, img.dados, "image/jpeg");
  const capa: ImagemBase = { indice: 0, funcao: "capa", prompt: p.prompt, storage_path: caminho, url, bytes: img.dados.length, modelo: cfg.modelos.imagem_capa };
  const imagens_base = [capa, ...post.imagens_base.filter((i) => i.indice !== 0)];
  const slides = post.slides.map((s) => (s.n === 1 ? { ...s, titulo, destaque: destaque || null, corpo: corpo ?? s.corpo, imagem_idx: 0, url: null, storage_path: null, bytes: null } : { ...s, url: null, storage_path: null, bytes: null }));
  const roteiro = { ...post.roteiro, headline_escolhida: titulo, headlines: [titulo, ...post.roteiro.headlines.filter((h) => h !== titulo)].slice(0, 5), prompt_imagem_capa: cena, slides };
  const atual = await store.atualizarPost(post.id, { imagens_base, slides, roteiro, status: "imagens_prontas", revisoes: [], recheck: null, erro: null, proxima_tentativa_em: null, pausado: false });
  console.log("capa trocada:", atual?.status, "|", titulo, "| imagem", img.dados.length, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
