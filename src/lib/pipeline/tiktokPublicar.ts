// Espelha no TikTok (carrossel de fotos) o post que acabou de sair no Instagram. Melhor esforço: falha aqui NUNCA
// desfaz nem bloqueia a publicação do Instagram; fica registrada em publicacao.tiktok e no log.
import { ErroTikTok, contaTikTok, garantirTokenTikTok, publicarFotos, statusPublicacao, urlDaMidiaNoNossoDominio } from "../tiktok";
import type { Post, PublicacaoTikTok } from "../types";
import { logar, type Ctx } from "./contexto";

export function tituloParaTikTok(post: Post): string {
  return (post.roteiro?.headline_escolhida ?? post.pauta?.titulo ?? "").slice(0, 90);
}

// Legenda do TikTok = a do Instagram sem o bloco "Fontes:" (links não clicam lá) e com as hashtags no fim.
export function descricaoParaTikTok(legenda: string): string {
  const semFontes = legenda.split(/\n\s*Fontes:\s*\n/i)[0] ?? legenda;
  return semFontes.trim().slice(0, 4000);
}

export async function publicarPostNoTikTok(ctx: Ctx, post: Post): Promise<Post> {
  const { cfg, store } = ctx;
  if (!cfg.tiktok.ativo) return post;
  const atual: PublicacaoTikTok = post.publicacao.tiktok ?? {};
  if (atual.publish_id) return post;
  if (!(await contaTikTok(store, ctx.conta))) {
    await logar(ctx, post, "tiktok", "aviso", "TikTok ligado na configuração, mas a conta não está conectada (/api/tiktok/conectar). Pulei.");
    return post;
  }
  const urls = post.slides.filter((s) => s.storage_path).map((s) => urlDaMidiaNoNossoDominio(s.storage_path!));
  try {
    const token = await garantirTokenTikTok(store, ctx.conta);
    const r = await publicarFotos(token, { titulo: tituloParaTikTok(post), descricao: descricaoParaTikTok(post.legenda), urls, capaIndice: 0, privacidade: cfg.tiktok.privacidade, desabilitarComentarios: cfg.tiktok.desabilitar_comentarios, autoMusica: cfg.tiktok.auto_musica });
    const tiktok: PublicacaoTikTok = { publish_id: r.publish_id, status: "PROCESSING_DOWNLOAD", iniciado_em: new Date().toISOString(), privacidade: cfg.tiktok.privacidade, erro: null };
    const p = await store.atualizarPost(post.id, { publicacao: { ...post.publicacao, tiktok } });
    await logar(ctx, post, "tiktok", "info", `Enviado ao TikTok (${cfg.tiktok.privacidade}); aguardando processamento.`, { publish_id: r.publish_id, fotos: urls.length });
    return p ?? post;
  } catch (e) {
    const msg = e instanceof ErroTikTok ? `${e.codigo ?? ""} ${e.message}` : (e as Error).message;
    const tiktok: PublicacaoTikTok = { ...atual, erro: msg, status: "FAILED", iniciado_em: new Date().toISOString() };
    const p = await store.atualizarPost(post.id, { publicacao: { ...post.publicacao, tiktok } });
    await logar(ctx, post, "tiktok", "erro", `TikTok recusou: ${msg}`);
    return p ?? post;
  }
}

// Chamado pelo ciclo: consulta o status dos posts de hoje que foram enviados ao TikTok e ainda não terminaram.
export async function atualizarStatusTikTok(ctx: Ctx, post: Post): Promise<Post> {
  const t = post.publicacao.tiktok;
  if (!t?.publish_id || t.status === "PUBLISH_COMPLETE" || t.status === "FAILED") return post;
  try {
    const token = await garantirTokenTikTok(ctx.store, ctx.conta);
    const s = await statusPublicacao(token, t.publish_id);
    const novo: PublicacaoTikTok = { ...t, status: s.status, erro: s.fail_reason ?? null, post_id: s.publicaly_available_post_id?.[0] ? String(s.publicaly_available_post_id[0]) : t.post_id ?? null, conferido_em: new Date().toISOString() };
    const p = await ctx.store.atualizarPost(post.id, { publicacao: { ...post.publicacao, tiktok: novo } });
    if (s.status === "PUBLISH_COMPLETE") await logar(ctx, post, "tiktok", "info", `TikTok publicou${novo.post_id ? ` (post ${novo.post_id})` : " (privado até a auditoria/moderação)"}.`);
    if (s.status === "FAILED") await logar(ctx, post, "tiktok", "erro", `TikTok falhou: ${s.fail_reason ?? "sem motivo"}`);
    return p ?? post;
  } catch (e) {
    await logar(ctx, post, "tiktok", "aviso", `Não consegui consultar o status no TikTok: ${(e as Error).message}`);
    return post;
  }
}
