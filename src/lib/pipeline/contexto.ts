import type { Blobs, Store } from "../store/tipos";
import type { Config } from "../config";
import type { AgoraSP } from "../tempo";
import type { Post } from "../types";
import { somaDias } from "../tempo";
import type { ItemHistorico } from "../../prompts";

export type Ctx = {
  store: Store;
  blobs: Blobs;
  cfg: Config;
  agora: AgoraSP;
  conta: string;
};

export async function logar(ctx: Ctx, post: Post | null, etapa: string, nivel: "info" | "aviso" | "erro", mensagem: string, detalhe?: unknown) {
  await ctx.store.log({ post_id: post?.id ?? null, etapa, nivel, mensagem, detalhe });
}

// Últimos N dias de posts que já tiveram pauta e roteiro: base para não repetir assunto, headline e estrutura.
export async function historico(ctx: Ctx, ignorarPostId?: string): Promise<ItemHistorico[]> {
  const desde = somaDias(ctx.agora.data, -ctx.cfg.conteudo.dias_de_historico);
  const posts = await ctx.store.listarPosts({ desde, kinds: ["dia", "tarde", "reserva"], limite: 200 });
  return posts
    .filter((p) => p.id !== ignorarPostId && p.pauta && p.roteiro && !["cancelado", "reprovado"].includes(p.status))
    .map((p) => ({
      data: p.data,
      titulo: p.pauta!.titulo,
      headline: p.roteiro!.headline_escolhida,
      layouts: p.slides.map((s) => s.layout),
      capa: (p.roteiro!.prompt_imagem_capa ?? "").replace(/\s+/g, " ").slice(0, 220),
      capa_estilo: p.slides[0]?.estilo ?? "hiperbole",
    }));
}
