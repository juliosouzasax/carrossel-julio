import { garantirOrcamento, OrcamentoEstourado, registrarImagem } from "../custo";
import { gerarImagem } from "../openai";
import { promptImagem } from "../../prompts";
import type { ImagemBase, Post, Slide } from "../types";
import { logar, type Ctx } from "./contexto";

// Índices das imagens-base: 0 = capa gerada; 1..k = fotos reais das fontes (já existem desde a pesquisa);
// k+1.. = extras geradas pela IA, na ordem de prompts_imagens_extras.
export function fotosReais(post: Post) {
  return post.imagens_base.filter((i) => i.funcao === "fonte").sort((a, b) => a.indice - b.indice);
}

function cenas(post: Post): Map<number, { funcao: "capa" | "extra"; cena: string }> {
  const r = post.roteiro;
  const m = new Map<number, { funcao: "capa" | "extra"; cena: string }>();
  if (!r) return m;
  m.set(0, { funcao: "capa", cena: r.prompt_imagem_capa });
  const k = fotosReais(post).length;
  (r.prompts_imagens_extras ?? []).forEach((c, i) => m.set(k + 1 + i, { funcao: "extra", cena: c }));
  return m;
}

async function gerarUma(ctx: Ctx, post: Post, indice: number, funcao: "capa" | "extra", cena: string): Promise<ImagemBase> {
  const { cfg } = ctx;
  const modelo = funcao === "capa" ? cfg.modelos.imagem_capa : cfg.modelos.imagem_extra;
  const qualidade = funcao === "capa" ? cfg.imagens.qualidade_capa : cfg.imagens.qualidade_extra;
  const p = promptImagem({ cena, cfg, ilustrativo: !!post.roteiro?.ilustrativo, funcao });
  await garantirOrcamento(ctx.store, cfg, { imagensNovas: 1 });
  const img = await gerarImagem({ modelo, prompt: p.prompt, tamanho: cfg.imagens.tamanho, qualidade });
  await registrarImagem(ctx.store, cfg, post.id, funcao === "capa" ? "imagem_capa" : "imagem_extra", modelo, img, qualidade, p.versao);
  const caminho = `${post.data}/${post.id}/base-${indice}-${Date.now().toString(36)}.jpg`;
  const { url } = await ctx.blobs.put(caminho, img.dados, "image/jpeg");
  return { indice, funcao, prompt: p.prompt, storage_path: caminho, url, bytes: img.dados.length, modelo };
}

// Gera as imagens-base (SEM texto). Idempotente: o que já existe não é gerado de novo.
export async function executarImagens(ctx: Ctx, post: Post): Promise<Post> {
  const lista = [...cenas(post).entries()].filter(([idx]) => idx < ctx.cfg.imagens.max_por_post + fotosReais(post).length);
  const existentes = new Map(post.imagens_base.map((i) => [i.indice, i]));
  const geradas: ImagemBase[] = [...post.imagens_base];
  // Só gera o que algum slide usa (capa sempre).
  const usados = new Set<number>([0, ...post.slides.map((s) => s.imagem_idx).filter((x): x is number => x !== null && x !== undefined)]);

  for (const [i, c] of lista) {
    if (existentes.has(i) || !usados.has(i)) continue;
    try {
      const img = await gerarUma(ctx, post, i, c.funcao, c.cena);
      geradas.push(img);
      await ctx.store.atualizarPost(post.id, { imagens_base: geradas }); // salva a cada imagem: reinício não perde
    } catch (e) {
      if (c.funcao === "capa" || e instanceof OrcamentoEstourado) throw e; // sem capa não há post
      await logar(ctx, post, "imagens", "aviso", `Imagem extra ${i} falhou; o slide correspondente usará só texto.`, (e as Error).message);
    }
  }

  // Slide que pedia imagem que não existe cai no layout só-texto equivalente (nada de slide quebrado).
  const indicesOk = new Set(geradas.map((g) => g.indice));
  const SEM_FOTO: Partial<Record<Slide["layout"], Slide["layout"]>> = { imagem: "texto", foto: "texto", foto_escura: "tese", citacao: "destaque" };
  const slides = post.slides.map((s) => {
    const alternativa = SEM_FOTO[s.layout];
    const temFoto = s.imagem_idx !== null && s.imagem_idx !== undefined && indicesOk.has(s.imagem_idx);
    return alternativa && !temFoto ? { ...s, layout: alternativa, imagem_idx: null } : s;
  });
  const atual = await ctx.store.atualizarPost(post.id, { imagens_base: geradas, slides, status: "imagens_prontas", erro: null });
  return atual ?? post;
}

// Regenera UMA imagem (botão do painel). Respeita o limite de regenerações por post.
export async function regenerarImagem(ctx: Ctx, post: Post, indice: number, cenaNova?: string): Promise<Post> {
  const usadas = post.tentativas["regen_imagem"] ?? 0;
  if (usadas >= ctx.cfg.limites.max_regeneracoes_por_post) throw new OrcamentoEstourado(`Limite de ${ctx.cfg.limites.max_regeneracoes_por_post} regenerações de imagem por post atingido.`);
  const base = cenas(post).get(indice);
  if (!base) throw new Error(`Imagem ${indice} não existe neste post (fotos reais das fontes não são regeneradas).`);
  const img = await gerarUma(ctx, post, indice, base.funcao, cenaNova?.trim() || base.cena);
  const imagens = [...post.imagens_base.filter((i) => i.indice !== indice), img].sort((a, b) => a.indice - b.indice);
  const atual = await ctx.store.atualizarPost(post.id, { imagens_base: imagens, tentativas: { ...post.tentativas, regen_imagem: usadas + 1 } });
  return atual ?? post;
}
