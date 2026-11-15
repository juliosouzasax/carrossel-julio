// Story chamando para o post que acabou de sair no feed. Melhor esforço: falha aqui NUNCA desfaz nem bloqueia o
// carrossel; fica registrada em publicacao.story e no log, e o ciclo tenta de novo algumas vezes no mesmo dia.
import { clienteInstagram, ErroInstagram, garantirConta, imagemPublicaOk, type ClienteIG } from "../instagram";
import { dataUri, dimensoesJpeg, tipoDaImagem } from "../render/jpeg";
import { mesAnoDe } from "../render/slides";
import { renderizarStoryJpeg, STORY_ALTURA, STORY_LARGURA } from "../render/story";
import type { Post, PublicacaoStory } from "../types";
import { logar, type Ctx } from "./contexto";

export type DepsStory = { cliente?: ClienteIG; verificarImagem?: (url: string) => Promise<{ ok: boolean; motivo?: string }>; esperar?: (ms: number) => Promise<void> };

export const MAX_TENTATIVAS_STORY = 3;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function storyPendente(post: Post, cfg: Ctx["cfg"]): boolean {
  if (!cfg.story.ativo || post.status !== "publicado" || post.publicacao.simulada) return false;
  const s = post.publicacao.story ?? {};
  return !s.media_id && (s.tentativas ?? 0) < MAX_TENTATIVAS_STORY;
}

async function gravar(ctx: Ctx, post: Post, story: PublicacaoStory): Promise<Post> {
  return (await ctx.store.atualizarPost(post.id, { publicacao: { ...post.publicacao, story } })) ?? { ...post, publicacao: { ...post.publicacao, story } };
}

// Renderiza a arte (uma vez) a partir da CAPA já publicada e devolve a URL pública.
async function arteDoStory(ctx: Ctx, post: Post, story: PublicacaoStory): Promise<{ post: Post; story: PublicacaoStory }> {
  if (story.url && story.storage_path) return { post, story };
  const capa = post.slides.find((s) => s.layout === "capa") ?? post.slides[0];
  let capaDataUri: string | null = null;
  if (capa?.storage_path) {
    const buf = await ctx.blobs.get(capa.storage_path);
    const tipo = buf ? tipoDaImagem(buf) : null;
    if (buf && tipo) capaDataUri = dataUri(buf, tipo);
  }
  const headline = post.roteiro?.headline_escolhida ?? capa?.titulo ?? post.pauta?.titulo ?? "";
  const { jpeg, largura, altura } = await renderizarStoryJpeg({
    identidade: ctx.cfg.identidade,
    chamada: ctx.cfg.story.chamada,
    instrucao: ctx.cfg.story.instrucao,
    headline,
    destaque: capa?.destaque ?? null,
    totalSlides: post.slides.length,
    capaDataUri,
    mesAno: mesAnoDe(post.data),
  });
  const dim = dimensoesJpeg(jpeg);
  if (largura !== STORY_LARGURA || altura !== STORY_ALTURA || !dim) throw new Error(`Story saiu com ${largura}x${altura}; esperado ${STORY_LARGURA}x${STORY_ALTURA}.`);
  const caminho = `${post.data}/${post.id}/story-${Date.now().toString(36)}.jpg`;
  const { url } = await ctx.blobs.put(caminho, jpeg, "image/jpeg");
  const nova = { ...story, storage_path: caminho, url };
  return { post: await gravar(ctx, post, nova), story: nova };
}

export async function publicarStoryDoPost(ctx: Ctx, postInicial: Post, deps: DepsStory = {}): Promise<Post> {
  let post = postInicial;
  if (!storyPendente(post, ctx.cfg)) return post;
  let story: PublicacaoStory = { ...(post.publicacao.story ?? {}) };
  const esperar = deps.esperar ?? dormir;
  const verificarImagem = deps.verificarImagem ?? imagemPublicaOk;
  try {
    ({ post, story } = await arteDoStory(ctx, post, story));
    const v = await verificarImagem(story.url!);
    if (!v.ok) throw new ErroInstagram(`Arte do story não acessível à Meta (${v.motivo}).`, null, 2207052, null, true);
    const conta = deps.cliente ? null : await garantirConta(ctx);
    const cliente = deps.cliente ?? clienteInstagram(conta!.token, conta!.igId);
    let container = story.container_id ?? null;
    if (!container) {
      container = await cliente.criarStory(story.url!);
      story = { ...story, container_id: container };
      post = await gravar(ctx, post, story);
    }
    const limite = Date.now() + 60_000;
    for (;;) {
      const st = await cliente.statusContainer(container);
      if (st.codigo === "FINISHED" || st.codigo === "PUBLISHED") break;
      if (st.codigo === "ERROR" || st.codigo === "EXPIRED") {
        story = { ...story, container_id: null };
        throw new ErroInstagram(`Container do story em ${st.codigo}: ${st.detalhe ?? ""}`, null, 2207032, null, true);
      }
      if (Date.now() > limite) throw new ErroInstagram("Story ainda sendo processado pela Meta.", null, 2207027, null, true);
      await esperar(3000);
    }
    const mediaId = await cliente.publicar(container);
    const d = await cliente.detalhe(mediaId).catch(() => ({ permalink: null, timestamp: null }));
    story = { ...story, media_id: mediaId, permalink: d.permalink, erro: null, em: new Date().toISOString() };
    post = await gravar(ctx, post, story);
    await logar(ctx, post, "story", "info", "Story publicado chamando para o post do feed.", { media_id: mediaId });
    return post;
  } catch (e) {
    const msg = (e as Error).message;
    const retentavel = e instanceof ErroInstagram ? e.retentavel : true;
    story = { ...story, erro: msg, em: new Date().toISOString(), tentativas: retentavel ? (story.tentativas ?? 0) + 1 : MAX_TENTATIVAS_STORY };
    post = await gravar(ctx, post, story);
    await logar(ctx, post, "story", retentavel && (story.tentativas ?? 0) < MAX_TENTATIVAS_STORY ? "aviso" : "erro", `Story não saiu${retentavel && (story.tentativas ?? 0) < MAX_TENTATIVAS_STORY ? " (tento de novo no próximo ciclo)" : ""}: ${msg}`);
    return post;
  }
}
