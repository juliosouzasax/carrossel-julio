import { clienteInstagram, ErroInstagram, garantirConta, imagemPublicaOk, type ClienteIG } from "../instagram";
import { instanteSP } from "../tempo";
import type { Post, Publicacao } from "../types";
import { logar, type Ctx } from "./contexto";
import { publicarPostNoTikTok } from "./tiktokPublicar";

export type DepsPublicar = {
  cliente?: ClienteIG;
  verificarImagem?: (url: string) => Promise<{ ok: boolean; motivo?: string }>;
  esperar?: (ms: number) => Promise<void>;
};

export type ResultadoPublicar = { resultado: "publicado" | "simulado" | "aguardando" | "falhou"; post: Post; mensagem: string };

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function alt(post: Post, n: number): string {
  const s = post.slides.find((x) => x.n === n);
  return s ? `${s.titulo}. ${s.corpo}`.replace(/\s+/g, " ").trim().slice(0, 1000) : "";
}

// Procura, nas mídias recentes, um post com a MESMA legenda publicado depois do início desta tentativa.
// É a conferência anti-duplicidade: depois de timeout ou erro desconhecido, nunca republicamos sem olhar antes.
export async function acharPublicadoRecente(cliente: ClienteIG, legenda: string, desdeISO: string | null): Promise<{ id: string; permalink: string | null } | null> {
  const lista = await cliente.recentes();
  const desde = desdeISO ? new Date(desdeISO).getTime() - 5 * 60_000 : Date.now() - 24 * 3600_000;
  const alvo = norm(legenda);
  const achada = lista.find((m) => new Date(m.timestamp).getTime() >= desde && norm(m.caption) === alvo);
  return achada ? { id: achada.id, permalink: achada.permalink } : null;
}

export function backoffMs(tentativas: number): number {
  return Math.min(10 * 60_000, 60_000 * 2 ** Math.max(0, tentativas - 1)); // 1, 2, 4, 8, 10 min
}

async function salvar(ctx: Ctx, post: Post, pub: Publicacao, extra: Partial<Post> = {}): Promise<Post> {
  return (await ctx.store.atualizarPost(post.id, { publicacao: pub, ...extra })) ?? { ...post, publicacao: pub, ...extra };
}

// Publica o carrossel. Pode ser chamada várias vezes (a cada tick): continua de onde parou, sem duplicar.
export async function executarPublicacao(ctx: Ctx, postInicial: Post, deps: DepsPublicar = {}): Promise<ResultadoPublicar> {
  const { cfg, store } = ctx;
  let post = postInicial;
  const esperar = deps.esperar ?? dormir;
  const verificarImagem = deps.verificarImagem ?? imagemPublicaOk;
  const programada = instanteSP(post.data, cfg.horarios.publicacao).toISOString();
  let pub: Publicacao = { ...post.publicacao, programada_para: post.publicacao.programada_para ?? programada };

  // ---- MODO DE TESTE (ou post de teste): executa tudo menos a publicação.
  if (cfg.modo_teste || post.kind === "teste") {
    pub = { ...pub, simulada: true, confirmada_em: null, media_id: null, permalink: null };
    post = await salvar(ctx, post, pub, { status: "simulado", motivo: "Modo de teste: nenhuma chamada de publicação foi feita ao Instagram." });
    await logar(ctx, post, "publicacao", "info", "SIMULAÇÃO: o post NÃO foi publicado (modo de teste).");
    return { resultado: "simulado", post, mensagem: "Simulado (modo de teste); nada foi publicado." };
  }

  // ---- Já publicado antes? (idempotência)
  if (pub.media_id && pub.confirmada_em) return { resultado: "publicado", post, mensagem: "Já estava publicado." };

  // ---- Trava de estado: só um executor por vez passa de 'pronto' para 'publicando'.
  if (post.status === "pronto") {
    const trav = await store.atualizarPost(post.id, { status: "publicando" }, ["pronto"]);
    if (!trav) return { resultado: "aguardando", post, mensagem: "Outra execução já está publicando." };
    post = trav;
  } else if (post.status !== "publicando") {
    return { resultado: "falhou", post, mensagem: `Status ${post.status} não permite publicar.` };
  }

  try {
    const conta = deps.cliente ? null : await garantirConta(ctx);
    const cliente = deps.cliente ?? clienteInstagram(conta!.token, conta!.igId);
    const legenda = post.legenda;

    // Se já houve tentativa em aberto, olhe o Instagram ANTES de qualquer nova chamada de criação/publicação.
    if (pub.container_carrossel_id || (pub.tentativas ?? 0) > 0) {
      const ja = await acharPublicadoRecente(cliente, legenda, pub.publicacao_iniciada_em ?? null);
      if (ja) {
        const d = await cliente.detalhe(ja.id).catch(() => ({ permalink: ja.permalink, timestamp: null }));
        pub = { ...pub, media_id: ja.id, permalink: d.permalink ?? ja.permalink, confirmada_em: d.timestamp ?? new Date().toISOString(), ultimo_erro: null };
        post = await salvar(ctx, post, pub, { status: "publicado", erro: null });
        await logar(ctx, post, "publicacao", "info", "Post já estava publicado no Instagram (confirmado antes de repetir).", { media_id: ja.id });
        return { resultado: "publicado", post, mensagem: `Publicado: ${pub.permalink ?? ja.id}` };
      }
    }

    // Cota diária da API.
    const lim = await cliente.limite();
    if (lim.usado >= lim.total) throw new ErroInstagram(`Limite diário de publicações da API atingido (${lim.usado}/${lim.total}).`, null, 2207042, null, false);

    // As imagens precisam estar públicas e em JPEG.
    for (const s of post.slides) {
      const v = await verificarImagem(s.url ?? "");
      if (!v.ok) throw new ErroInstagram(`Slide ${s.n}: imagem não acessível à Meta (${v.motivo}).`, null, 2207052, null, true);
    }

    // 1) Um container por slide (salvando o id de cada um: reinício não repete).
    const ids = [...(pub.container_ids ?? [])];
    for (let i = ids.length; i < post.slides.length; i++) {
      const id = await cliente.criarItem(post.slides[i].url!, alt(post, post.slides[i].n));
      ids.push(id);
      pub = { ...pub, container_ids: ids };
      post = await salvar(ctx, post, pub);
    }

    // 2) Espera cada item ficar pronto (até ~60s por rodada; se não der, continua no próximo tick).
    const limiteEspera = Date.now() + 60_000;
    for (const id of ids) {
      for (;;) {
        const st = await cliente.statusContainer(id);
        if (st.codigo === "FINISHED") break;
        if (st.codigo === "ERROR" || st.codigo === "EXPIRED") {
          pub = { ...pub, container_ids: [], container_carrossel_id: null };
          post = await salvar(ctx, post, pub);
          throw new ErroInstagram(`Container de slide em ${st.codigo}: ${st.detalhe ?? ""}`, null, 2207032, null, true);
        }
        if (Date.now() > limiteEspera) return await aguardar(ctx, post, pub, "Slides ainda sendo processados pela Meta; continuo no próximo ciclo.");
        await esperar(4000);
      }
    }

    // 3) Container do carrossel.
    let carrossel = pub.container_carrossel_id ?? null;
    if (!carrossel) {
      carrossel = await cliente.criarCarrossel(ids, legenda);
      pub = { ...pub, container_carrossel_id: carrossel };
      post = await salvar(ctx, post, pub);
    }
    for (;;) {
      const st = await cliente.statusContainer(carrossel);
      if (st.codigo === "FINISHED") break;
      if (st.codigo === "PUBLISHED") break;
      if (st.codigo === "ERROR" || st.codigo === "EXPIRED") {
        pub = { ...pub, container_ids: [], container_carrossel_id: null };
        post = await salvar(ctx, post, pub);
        throw new ErroInstagram(`Container do carrossel em ${st.codigo}: ${st.detalhe ?? ""}`, null, 2207032, null, true);
      }
      if (Date.now() > limiteEspera) return await aguardar(ctx, post, pub, "Carrossel ainda sendo processado; continuo no próximo ciclo.");
      await esperar(4000);
    }

    // 4) Publica. Marca o início ANTES: se der timeout, a conferência sabe de que horário olhar.
    pub = { ...pub, tentativas: (pub.tentativas ?? 0) + 1, publicacao_iniciada_em: new Date().toISOString() };
    post = await salvar(ctx, post, pub);
    let mediaId: string;
    try {
      mediaId = await cliente.publicar(carrossel);
    } catch (e) {
      // Timeout/erro: o resultado pode ter sido gravado mesmo assim. Confere ANTES de qualquer nova tentativa.
      const ja = await acharPublicadoRecente(cliente, legenda, pub.publicacao_iniciada_em ?? null).catch(() => null);
      if (!ja) throw e;
      mediaId = ja.id;
      await logar(ctx, post, "publicacao", "aviso", "media_publish deu erro, mas o post consta no Instagram; adotado sem republicar.", { erro: (e as Error).message });
    }

    // 5) Link do post e confirmação.
    const d = await cliente.detalhe(mediaId).catch(() => ({ permalink: null, timestamp: null }));
    pub = { ...pub, media_id: mediaId, permalink: d.permalink, confirmada_em: d.timestamp ?? new Date().toISOString(), ultimo_erro: null };
    post = await salvar(ctx, post, pub, { status: "publicado", erro: null });
    await logar(ctx, post, "publicacao", "info", "Publicado no Instagram.", { media_id: mediaId, permalink: d.permalink });
    post = await publicarPostNoTikTok(ctx, post); // espelho; nunca desfaz o Instagram
    return { resultado: "publicado", post, mensagem: `Publicado: ${d.permalink ?? mediaId}` };
  } catch (e) {
    const err = e as Error;
    const retentavel = e instanceof ErroInstagram ? e.retentavel : true;
    const tent = (pub.tentativas ?? 0) + (retentavel ? 0 : 1);
    pub = { ...pub, ultimo_erro: err.message };
    if (!retentavel || (post.tentativas["publicar"] ?? 0) + 1 >= cfg.limites.max_tentativas_etapa + 2) {
      post = await salvar(ctx, post, pub, { status: "falhou", erro: err.message });
      await logar(ctx, post, "publicacao", "erro", `Publicação falhou: ${err.message}`);
      return { resultado: "falhou", post, mensagem: err.message };
    }
    const n = (post.tentativas["publicar"] ?? 0) + 1;
    post = await salvar(ctx, post, pub, { erro: err.message, tentativas: { ...post.tentativas, publicar: n }, proxima_tentativa_em: new Date(Date.now() + backoffMs(Math.max(n, tent))).toISOString() });
    await logar(ctx, post, "publicacao", "aviso", `Erro temporário ao publicar (tentativa ${n}); nova tentativa em breve: ${err.message}`);
    return { resultado: "aguardando", post, mensagem: err.message };
  }
}

async function aguardar(ctx: Ctx, post: Post, pub: Publicacao, mensagem: string): Promise<ResultadoPublicar> {
  const atual = await salvar(ctx, post, pub);
  return { resultado: "aguardando", post: atual, mensagem };
}
