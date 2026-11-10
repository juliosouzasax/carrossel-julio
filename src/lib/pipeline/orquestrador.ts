import { randomUUID } from "node:crypto";
import { OrcamentoEstourado } from "../custo";
import { agoraSP, instanteSP, minutosDe, type AgoraSP } from "../tempo";
import type { Config } from "../config";
import type { Blobs, Store } from "../store/tipos";
import { STATUS_TERMINAIS, type Post, type StatusPost } from "../types";
import { historico, logar, type Ctx } from "./contexto";
import { executarImagens, regenerarImagem } from "./imagens";
import { backoffMs, executarPublicacao, type DepsPublicar, type ResultadoPublicar } from "./publicar";
import { executarPesquisa, pautaAtemporal, type ResultadoPesquisa } from "./pesquisa";
import { executarRender } from "./renderizar";
import { executarRecheck, executarRevisao } from "./revisao";
import { executarRoteiro } from "./roteiro";
import { validarRoteiro } from "./validacao";
import type { Recheck, Revisao } from "../types";

// Cada passo é injetável: os testes trocam por versões falsas (sem OpenAI/Instagram).
export type Passos = {
  pesquisa: (ctx: Ctx, post: Post) => Promise<ResultadoPesquisa>;
  roteiro: (ctx: Ctx, post: Post, correcoes?: string[]) => Promise<Post>;
  imagens: (ctx: Ctx, post: Post) => Promise<Post>;
  regenerar: (ctx: Ctx, post: Post, indice: number, cena?: string) => Promise<Post>;
  render: (ctx: Ctx, post: Post, somente?: number[]) => Promise<Post>;
  revisao: (ctx: Ctx, post: Post) => Promise<{ post: Post; revisao: Revisao }>;
  recheck: (ctx: Ctx, post: Post) => Promise<Recheck>;
  publicar: (ctx: Ctx, post: Post, deps?: DepsPublicar) => Promise<ResultadoPublicar>;
};

export const PASSOS_REAIS: Passos = {
  pesquisa: executarPesquisa,
  roteiro: executarRoteiro,
  imagens: executarImagens,
  regenerar: regenerarImagem,
  render: executarRender,
  revisao: executarRevisao,
  recheck: executarRecheck,
  publicar: executarPublicacao,
};

export type Opcoes = { passos?: Passos; depsPublicar?: DepsPublicar; forcar?: boolean };

const PRE_APROVACAO: StatusPost[] = ["novo", "pesquisando", "pesquisado", "roteirizado", "imagens_prontas", "renderizado", "em_revisao"];
const ehTerminal = (p: Post) => STATUS_TERMINAIS.includes(p.status);

export function criarCtx(store: Store, blobs: Blobs, cfg: Config, agora: AgoraSP, conta: string): Ctx {
  return { store, blobs, cfg, agora, conta };
}

// ---------------------------------------------------------------------------------------------------
// Janela de publicação (política de atraso): só publica entre o horário e o horário + janela.
export function estadoDaJanela(cfg: Config, agora: AgoraSP): "antes" | "dentro" | "depois" {
  const pub = minutosDe(cfg.horarios.publicacao);
  if (agora.minutos < pub) return "antes";
  if (agora.minutos <= pub + cfg.janela_publicacao_min) return "dentro";
  return "depois";
}

function liberadoPelo(cfg: Config, agora: AgoraSP, fase: "pesquisa" | "roteiro" | "recheck" | "publicacao"): boolean {
  return agora.minutos >= minutosDe(cfg.horarios[fase]);
}

async function marcar(ctx: Ctx, post: Post, status: StatusPost, motivo: string | null, nivel: "info" | "aviso" | "erro" = "aviso"): Promise<Post> {
  const atual = await ctx.store.atualizarPost(post.id, { status, motivo });
  await logar(ctx, post, "orquestrador", nivel, `Status → ${status}${motivo ? `: ${motivo}` : ""}`);
  return atual ?? { ...post, status, motivo };
}

// ---------------------------------------------------------------------------------------------------
// Plano B quando não há conteúdo seguro: 1) usa um post reserva pronto; 2) tema atemporal; 3) suspende.
export async function acionarFallback(ctx: Ctx, post: Post, motivo: string): Promise<Post> {
  const { store } = ctx;
  const usos = post.tentativas["fallback"] ?? 0;
  const base = { tentativas: { ...post.tentativas, fallback: usos + 1 }, erro: null, proxima_tentativa_em: null };
  if (usos >= 2 || (usos >= 1 && post.tipo_pauta === "atemporal")) {
    await logar(ctx, post, "fallback", "erro", `Sem conteúdo seguro (${motivo}). Nada será publicado hoje.`);
    const s = await store.atualizarPost(post.id, { ...base, status: "suspenso", motivo: `Sem conteúdo seguro para hoje: ${motivo}` });
    return s ?? post;
  }

  if (usos === 0 && post.kind !== "reserva") {
    const reserva = await store.reservaPronta(ctx.conta);
    if (reserva?.roteiro) {
      // O reaproveitado passa de novo por render e revisão (a data de hoje entra no kicker e a revisão é independente).
      await store.atualizarPost(reserva.id, { status: "usada", motivo: `Aproveitado no post de ${post.data}` });
      const atual = await store.atualizarPost(post.id, {
        ...base,
        pauta: reserva.pauta,
        tipo_pauta: reserva.tipo_pauta,
        justificativa: `Plano B (${motivo}): usado o post reserva de ${reserva.data}.`,
        roteiro: reserva.roteiro,
        slides: reserva.slides.map((s) => ({ ...s, url: null, storage_path: null, bytes: null })),
        legenda: reserva.legenda,
        imagens_base: reserva.imagens_base,
        revisoes: [],
        recheck: null,
        status: "imagens_prontas",
        motivo: null,
      });
      await logar(ctx, post, "fallback", "aviso", `Plano B: post reserva de ${reserva.data} adotado (${motivo}).`);
      return atual ?? post;
    }
  }

  const hist = await historico(ctx, post.id);
  const atual = await store.atualizarPost(post.id, {
    ...base,
    pauta: pautaAtemporal(hist, ctx.agora.data, ctx.cfg),
    tipo_pauta: "atemporal",
    justificativa: `Conteúdo atemporal escolhido porque: ${motivo}.`,
    roteiro: null,
    slides: [],
    legenda: "",
    imagens_base: [],
    revisoes: [],
    recheck: null,
    status: "pesquisado",
    motivo: null,
  });
  await logar(ctx, post, "fallback", "aviso", `Plano B: tema atemporal (${motivo}).`);
  return atual ?? post;
}

// ---------------------------------------------------------------------------------------------------
// Avança UM passo. Devolve o post atualizado e o que foi feito ("nada" = aguardando horário ou ação humana).
export async function avancar(ctx: Ctx, postInicial: Post, op: Opcoes = {}): Promise<{ post: Post; acao: string }> {
  const passos = op.passos ?? PASSOS_REAIS;
  const { cfg, agora } = ctx;
  let post = postInicial;
  if (ehTerminal(post)) return { post, acao: "nada (post encerrado)" };
  if (post.pausado) return { post, acao: "nada (pausado)" };
  if (post.proxima_tentativa_em && new Date(post.proxima_tentativa_em).getTime() > Date.now() && !op.forcar) return { post, acao: "nada (aguardando nova tentativa)" };

  const dia = post.kind === "dia" && !op.forcar;

  try {
    // ---- Política de atraso: passou da janela e ainda não publicou → não publica fora de hora.
    if (dia && post.status !== "publicando" && estadoDaJanela(cfg, agora) === "depois") {
      post = await marcar(ctx, post, "perdeu_janela", `Passou de ${cfg.horarios.publicacao} + ${cfg.janela_publicacao_min} min sem estar pronto; não publicamos fora do horário.`, "erro");
      return { post, acao: "perdeu a janela" };
    }
    if (dia && post.status === "publicando" && estadoDaJanela(cfg, agora) === "depois" && !post.publicacao.container_carrossel_id) {
      post = await marcar(ctx, post, "perdeu_janela", "Atraso na publicação além da janela permitida (nenhum container criado).", "erro");
      return { post, acao: "perdeu a janela" };
    }

    // ---- Prazo de revisão: se até lá o post não foi aprovado, aciona o plano B uma única vez.
    if (dia && PRE_APROVACAO.includes(post.status) && agora.minutos >= minutosDe(cfg.horarios.prazo_revisao) && !post.tentativas["prazo"]) {
      post = await ctx.store.atualizarPost(post.id, { tentativas: { ...post.tentativas, prazo: 1 } }).then((p) => p ?? post);
      post = await acionarFallback(ctx, post, `o conteúdo não estava aprovado até o prazo de revisão (${cfg.horarios.prazo_revisao})`);
      return { post, acao: "plano B por prazo de revisão" };
    }

    switch (post.status) {
      case "novo":
      case "pesquisando": {
        if (dia && !liberadoPelo(cfg, agora, "pesquisa")) return { post, acao: `nada (pesquisa só a partir de ${cfg.horarios.pesquisa})` };
        post = (await ctx.store.atualizarPost(post.id, { status: "pesquisando" })) ?? post;
        const r = await passos.pesquisa(ctx, post);
        if (r.tipo === "ok") return { post: r.post, acao: "pesquisa concluída" };
        post = await acionarFallback(ctx, post, r.motivo);
        return { post, acao: "pesquisa sem pauta → plano B" };
      }
      case "pesquisado": {
        if (dia && !liberadoPelo(cfg, agora, "roteiro")) return { post, acao: `nada (roteiro só a partir de ${cfg.horarios.roteiro})` };
        post = await passos.roteiro(ctx, post);
        return { post, acao: "roteiro gerado" };
      }
      case "roteirizado": {
        post = await passos.imagens(ctx, post);
        return { post, acao: "imagens geradas" };
      }
      case "imagens_prontas": {
        post = await passos.render(ctx, post);
        return { post, acao: "slides renderizados" };
      }
      case "renderizado": {
        const r = await passos.revisao(ctx, post);
        return { post: r.post, acao: r.revisao.aprovado ? "revisão aprovou" : "revisão reprovou" };
      }
      case "em_revisao": {
        const ultima = post.revisoes[post.revisoes.length - 1];
        if (!ultima) {
          post = (await ctx.store.atualizarPost(post.id, { status: "renderizado" })) ?? post;
          return { post, acao: "sem revisão registrada; refazendo" };
        }
        if (ultima.aprovado) {
          const manual = post.kind === "dia" && post.modo === "manual";
          post = await marcar(ctx, post, manual ? "aguardando_aprovacao" : "aprovado", null, "info");
          return { post, acao: manual ? "aguardando seu OK" : "aprovado" };
        }
        if (post.revisoes.length > cfg.limites.max_revisoes) {
          post = await acionarFallback(ctx, post, `a revisão reprovou ${post.revisoes.length} vezes: ${ultima.resumo}`);
          return { post, acao: "revisão esgotada → plano B" };
        }
        // Correção guiada pelos pedidos do revisor; imagem regenerada só se o revisor apontou problema nela.
        if (ultima.problemas_de_imagem && (post.tentativas["regen_imagem"] ?? 0) < cfg.limites.max_regeneracoes_por_post) {
          try {
            post = await passos.regenerar(ctx, post, 0);
          } catch (e) {
            if (e instanceof OrcamentoEstourado) throw e;
            await logar(ctx, post, "revisao", "aviso", `Não consegui regenerar a capa: ${(e as Error).message}`);
          }
        }
        post = await passos.roteiro(ctx, post, ultima.correcoes_pedidas);
        return { post, acao: "texto corrigido após a revisão" };
      }
      case "aguardando_aprovacao":
        return { post, acao: "nada (aguardando aprovação humana)" };
      case "aprovado": {
        if (post.kind === "reserva") return { post, acao: "nada (reserva pronta)" };
        if (dia && !liberadoPelo(cfg, agora, "recheck")) return { post, acao: `nada (checagem final só a partir de ${cfg.horarios.recheck})` };
        let rc: Recheck;
        try {
          rc = await passos.recheck(ctx, post);
        } catch (e) {
          if (e instanceof OrcamentoEstourado) throw e;
          const n = (post.tentativas["recheck"] ?? 0) + 1;
          if (n < cfg.limites.max_tentativas_etapa) throw e; // cai no tratamento de erro com backoff
          if (cfg.conteudo.se_recheck_falhar === "publicar") {
            await logar(ctx, post, "recheck", "aviso", `Checagem final falhou ${n}x (${(e as Error).message}); política configurada: publicar mesmo assim.`);
            rc = { em: new Date().toISOString(), ainda_valido: true, houve_novo_desenvolvimento: false, resumo: "Checagem final indisponível; publicando conforme a política configurada.", fontes_novas: [] };
          } else {
            post = await acionarFallback(ctx, post, `a checagem final de atualidade falhou ${n}x e a política é bloquear (${(e as Error).message})`);
            return { post, acao: "checagem final indisponível → plano B" };
          }
        }
        if (!rc.ainda_valido) {
          post = (await ctx.store.atualizarPost(post.id, { recheck: rc })) ?? post;
          post = await acionarFallback(ctx, post, `a checagem final indicou que o assunto deixou de ser válido: ${rc.resumo}`);
          return { post, acao: "checagem final reprovou → plano B" };
        }
        if (rc.houve_novo_desenvolvimento) await logar(ctx, post, "recheck", "aviso", `Houve novo desenvolvimento; confira o conteúdo. ${rc.resumo}`);
        post = await marcar(ctx, (await ctx.store.atualizarPost(post.id, { recheck: rc })) ?? post, "pronto", null, "info");
        return { post, acao: "checagem final ok; pronto para publicar" };
      }
      case "pronto":
      case "publicando": {
        if (post.kind === "reserva") return { post, acao: "nada (reserva)" };
        if (dia && post.status === "pronto" && estadoDaJanela(cfg, agora) === "antes") return { post, acao: `nada (publica às ${cfg.horarios.publicacao})` };
        const r = await passos.publicar(ctx, post, op.depsPublicar);
        return { post: r.post, acao: `publicação: ${r.resultado}` };
      }
      default:
        return { post, acao: "nada" };
    }
  } catch (e) {
    return tratarErro(ctx, post, e);
  }
}

async function tratarErro(ctx: Ctx, post: Post, e: unknown): Promise<{ post: Post; acao: string }> {
  const msg = (e as Error).message ?? String(e);
  if (e instanceof OrcamentoEstourado) {
    const p = await ctx.store.atualizarPost(post.id, { erro: msg, proxima_tentativa_em: new Date(Date.now() + 3600_000).toISOString() });
    await logar(ctx, post, "custo", "erro", `Limite de custo: ${msg}`);
    return { post: p ?? post, acao: "limite de custo atingido" };
  }
  const chave = post.status;
  const n = (post.tentativas[chave] ?? 0) + 1;
  await logar(ctx, post, chave, "erro", `Falha (tentativa ${n}/${ctx.cfg.limites.max_tentativas_etapa}): ${msg}`);
  if (n >= ctx.cfg.limites.max_tentativas_etapa) {
    const base = (await ctx.store.atualizarPost(post.id, { tentativas: { ...post.tentativas, [chave]: n }, erro: msg })) ?? post;
    const p = await acionarFallback(ctx, base, `a etapa "${chave}" falhou ${n} vezes: ${msg}`);
    return { post: p, acao: `etapa ${chave} esgotou tentativas → plano B` };
  }
  const p = await ctx.store.atualizarPost(post.id, { tentativas: { ...post.tentativas, [chave]: n }, erro: msg, proxima_tentativa_em: new Date(Date.now() + backoffMs(n)).toISOString() });
  return { post: p ?? post, acao: `erro na etapa ${chave}; nova tentativa em breve` };
}

// ---------------------------------------------------------------------------------------------------
// Ciclo chamado pelo cron a cada minuto. Persistente: se a função for interrompida, o próximo ciclo continua.
export type ResultadoTick = { ok: boolean; mensagem: string; passos: { post: string; kind: string; acao: string }[] };

export async function tick(store: Store, blobs: Blobs, conta: string, op: Opcoes & { agora?: AgoraSP; inicio?: number; orcamentoMs?: number } = {}): Promise<ResultadoTick> {
  const cfg = await store.getConfig();
  const agora = op.agora ?? agoraSP();
  const dono = randomUUID();
  const executados: ResultadoTick["passos"] = [];
  // Desligado: o post do dia não é criado nem publicado, mas posts de TESTE continuam andando (não publicam nunca).
  const somenteTeste = !cfg.ativo || cfg.pausado_global;
  if (!(await store.obterLock("tick", 285, dono))) return { ok: true, mensagem: "Outro ciclo em andamento.", passos: [] };
  const ctx = criarCtx(store, blobs, cfg, agora, conta);
  const inicio = op.inicio ?? Date.now();
  const orcamento = op.orcamentoMs ?? 45_000; // só começa um passo novo se ainda sobrou folga na função

  try {
    // Posts "dia" de dias anteriores que ficaram abertos: encerra (não publicamos conteúdo velho).
    const desde = agora.data;
    if (!somenteTeste) {
    const antigos = await store.listarPosts({ ate: desde, kinds: ["dia"], limite: 20 });
    for (const p of antigos) if (p.data < agora.data && !ehTerminal(p) && p.status !== "publicando") await marcar(ctx, p, "perdeu_janela", "Dia encerrado sem publicação.", "erro");

    // Cria o post do dia quando chegar a hora da pesquisa.
    if (cfg.dias_ativos.includes(agora.diaDaSemana) && agora.minutos >= minutosDe(cfg.horarios.pesquisa)) {
      const { post: criado, criado: novo } = await store.criarPost({ conta, data: agora.data, kind: "dia", status: "novo", modo: cfg.modo });
      if (novo) await logar(ctx, criado, "orquestrador", "info", `Post do dia ${agora.data} criado.`);
    }

    }

    // Trabalha nos abertos: primeiro o do dia, depois testes e reservas.
    const abertos = (await store.listarPosts({ desde: agora.data, ate: agora.data, kinds: ["dia", "teste", "reserva"], limite: 30 })).filter((p) => !ehTerminal(p) && !p.pausado && (!somenteTeste || p.kind === "teste"));
    abertos.sort((a, b) => (a.kind === "dia" ? 0 : 1) - (b.kind === "dia" ? 0 : 1));
    // reservas/testes de dias anteriores também terminam de rodar
    const outros = (await store.listarPosts({ ate: agora.data, kinds: ["teste", "reserva"], limite: 30 })).filter((p) => p.data < agora.data && !ehTerminal(p) && !p.pausado && p.status !== "aprovado" && (!somenteTeste || p.kind === "teste"));
    for (const p of [...abertos, ...outros]) {
      let atual = p;
      for (let i = 0; i < 8; i++) {
        if (Date.now() - inicio > orcamento) break;
        const antes = atual.status + "|" + atual.atualizado_em;
        const r = await avancar(ctx, atual, op);
        atual = r.post;
        if (r.acao.startsWith("nada")) {
          if (i === 0) executados.push({ post: p.id, kind: p.kind, acao: r.acao });
          break;
        }
        executados.push({ post: p.id, kind: p.kind, acao: r.acao });
        if (ehTerminal(atual) || antes === atual.status + "|" + atual.atualizado_em) break;
      }
    }
    const aviso = somenteTeste ? " (sistema desligado/pausado: só posts de teste são processados)" : "";
    return { ok: true, mensagem: `Ciclo concluído (${executados.length} ação/ões)${aviso}.`, passos: executados };
  } finally {
    await store.liberarLock("tick", dono);
  }
}

// ---------------------------------------------------------------------------------------------------
// Ações do painel.
export type Acao =
  | { tipo: "aprovar" }
  | { tipo: "pausar" }
  | { tipo: "retomar" }
  | { tipo: "cancelar"; motivo?: string }
  | { tipo: "reabrir" } // falhou/suspenso/perdeu_janela → volta para tentar de novo
  | { tipo: "regenerar_imagem"; indice: number; cena?: string }
  | { tipo: "editar"; slides?: { n: number; titulo?: string; corpo?: string; destaque?: string | null; itens?: string[] }[]; legenda?: string }
  | { tipo: "avancar" }; // roda um passo agora, ignorando os horários

export async function executarAcao(store: Store, blobs: Blobs, conta: string, postId: string, acao: Acao, op: Opcoes & { agora?: AgoraSP } = {}): Promise<{ ok: boolean; mensagem: string; post: Post | null }> {
  const cfg = await store.getConfig();
  const ctx = criarCtx(store, blobs, cfg, op.agora ?? agoraSP(), conta);
  const post = await store.getPost(postId);
  if (!post || post.conta !== conta) return { ok: false, mensagem: "Post não encontrado.", post: null };
  const passos = op.passos ?? PASSOS_REAIS;

  switch (acao.tipo) {
    case "aprovar": {
      if (post.status !== "aguardando_aprovacao") return { ok: false, mensagem: `Só dá para aprovar um post aguardando aprovação (status atual: ${post.status}).`, post };
      const p = await store.atualizarPost(post.id, { status: "aprovado", motivo: null }, ["aguardando_aprovacao"]);
      await logar(ctx, post, "painel", "info", "Aprovado manualmente no painel.");
      return { ok: !!p, mensagem: p ? "Aprovado. A checagem final e a publicação seguem no horário." : "O status mudou; atualize a tela.", post: p ?? post };
    }
    case "pausar": {
      const p = await store.atualizarPost(post.id, { pausado: true });
      await logar(ctx, post, "painel", "aviso", "Post pausado.");
      return { ok: true, mensagem: "Pausado: nada avança até você retomar.", post: p };
    }
    case "retomar": {
      const p = await store.atualizarPost(post.id, { pausado: false });
      await logar(ctx, post, "painel", "info", "Post retomado.");
      return { ok: true, mensagem: "Retomado.", post: p };
    }
    case "cancelar": {
      if (post.status === "publicado") return { ok: false, mensagem: "Já foi publicado; cancele no Instagram.", post };
      const p = await store.atualizarPost(post.id, { status: "cancelado", motivo: acao.motivo ?? "Cancelado no painel." });
      await logar(ctx, post, "painel", "aviso", "Post cancelado no painel.");
      return { ok: true, mensagem: "Cancelado: nada será publicado hoje.", post: p };
    }
    case "reabrir": {
      if (!["falhou", "suspenso", "perdeu_janela", "cancelado"].includes(post.status)) return { ok: false, mensagem: `Status ${post.status} não precisa ser reaberto.`, post };
      const destino: StatusPost = post.imagens_base.length && post.slides.length ? "imagens_prontas" : post.roteiro ? "roteirizado" : post.pauta ? "pesquisado" : "novo";
      const p = await store.atualizarPost(post.id, { status: destino, erro: null, motivo: null, proxima_tentativa_em: null, tentativas: {}, revisoes: [], pausado: false });
      await logar(ctx, post, "painel", "info", `Reaberto em "${destino}".`);
      return { ok: true, mensagem: `Reaberto; o próximo ciclo continua de "${destino}".`, post: p };
    }
    case "regenerar_imagem":
    case "editar":
    case "avancar": {
      const dono = randomUUID();
      if (!(await store.obterLock("tick", 285, dono))) return { ok: false, mensagem: "O sistema está ocupado com um ciclo agora. Tente de novo em 1 minuto.", post };
      try {
        if (acao.tipo === "avancar") {
          const r = await avancar(ctx, post, { ...op, forcar: true });
          return { ok: true, mensagem: r.acao, post: r.post };
        }
        if (acao.tipo === "regenerar_imagem") {
          if (ehTerminal(post) && post.status !== "simulado") return { ok: false, mensagem: "Post encerrado.", post };
          let p = await passos.regenerar(ctx, post, acao.indice, acao.cena);
          const usa = p.slides.filter((s) => s.imagem_idx === acao.indice || (s.layout === "capa" && acao.indice === 0)).map((s) => s.n);
          p = await passos.render(ctx, p, usa.length ? usa : undefined);
          p = (await store.atualizarPost(p.id, { status: "renderizado", revisoes: [], recheck: null })) ?? p;
          return { ok: true, mensagem: "Imagem regenerada e slides atualizados. A revisão roda de novo.", post: p };
        }
        // editar texto
        const slides = post.slides.map((s) => {
          const e = acao.slides?.find((x) => x.n === s.n);
          return e ? { ...s, ...(e.titulo !== undefined ? { titulo: e.titulo } : {}), ...(e.corpo !== undefined ? { corpo: e.corpo } : {}), ...(e.destaque !== undefined ? { destaque: e.destaque } : {}), ...(e.itens ? { itens: e.itens } : {}) } : s;
        });
        const legenda = acao.legenda ?? post.legenda;
        if (post.roteiro) {
          const falhas = validarRoteiro({ ...post.roteiro, slides, legenda }, { tipo: post.tipo_pauta, cfg, pauta: post.pauta });
          if (falhas.length) return { ok: false, mensagem: `Edição recusada pela validação: ${falhas.join(" | ")}`, post };
        }
        let p = (await store.atualizarPost(post.id, { slides, legenda, roteiro: post.roteiro ? { ...post.roteiro, slides, legenda } : null, status: "imagens_prontas", revisoes: [], recheck: null })) ?? post;
        p = await passos.render(ctx, p);
        await logar(ctx, p, "painel", "info", "Texto editado manualmente; slides renderizados de novo e a revisão roda outra vez.");
        return { ok: true, mensagem: "Texto salvo e slides renderizados. A revisão roda de novo.", post: p };
      } finally {
        await store.liberarLock("tick", dono);
      }
    }
  }
}

// Cria um post de teste (nunca publica) ou uma reserva atemporal. Os próximos ciclos fazem o resto.
export async function criarPostEspecial(store: Store, conta: string, tipo: "teste" | "reserva", op: { agora?: AgoraSP; atemporal?: boolean } = {}): Promise<Post> {
  const cfg = await store.getConfig();
  const agora = op.agora ?? agoraSP();
  const ctx = criarCtx(store, null as unknown as Blobs, cfg, agora, conta);
  const hist = await historico(ctx);
  const atemporal = tipo === "reserva" || op.atemporal;
  const { post } = await store.criarPost({
    conta,
    data: agora.data,
    kind: tipo,
    status: atemporal ? "pesquisado" : "novo",
    modo: "automatico",
    tipo_pauta: atemporal ? "atemporal" : "noticia",
    pauta: atemporal ? pautaAtemporal(hist, agora.data, cfg) : null,
    justificativa: atemporal ? "Conteúdo atemporal (reserva/teste)." : null,
  });
  await logar(ctx, post, "painel", "info", `Post de ${tipo} criado.`);
  return post;
}
