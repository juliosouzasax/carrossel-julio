import { describe, expect, it } from "vitest";
import { OrcamentoEstourado } from "../src/lib/custo";
import { avancar, estadoDaJanela, executarAcao, tick } from "../src/lib/pipeline/orquestrador";
import { agoraSP, instanteSP } from "../src/lib/tempo";
import { BlobsFalsos, CONTA, DATA, ctxEm, em, novoStore, passosFalsos, postPronto, roteiroFalso, pautaFalsa } from "./helpers";

async function rodarAte(ctx: Awaited<ReturnType<typeof ctxEm>>, id: string, passos: ReturnType<typeof passosFalsos>, max = 40) {
  let post = (await ctx.store.getPost(id))!;
  for (let i = 0; i < max; i++) {
    const r = await avancar(ctx, post, { passos });
    post = r.post;
    if (r.acao.startsWith("nada")) break;
  }
  return post;
}

describe("horários e janela", () => {
  it("America/Sao_Paulo: 12:00 em SP é 15:00 UTC", () => {
    expect(instanteSP(DATA, "12:00").toISOString()).toBe("2026-11-09T15:00:00.000Z");
    expect(agoraSP(new Date("2026-11-09T02:30:00Z")).data).toBe("2026-11-08"); // 23:30 de domingo em SP
  });
  it("estado da janela de publicação", async () => {
    const cfg = await (await ctxEm(novoStore(), "12:00")).store.getConfig();
    expect(estadoDaJanela(cfg, em("11:59"))).toBe("antes");
    expect(estadoDaJanela(cfg, em("12:00"))).toBe("dentro");
    expect(estadoDaJanela(cfg, em("12:30"))).toBe("dentro");
    expect(estadoDaJanela(cfg, em("12:31"))).toBe("depois");
  });
});

describe("tick (agendador)", () => {
  it("antes das 09:00 não cria o post do dia; às 09:00 cria UM só, mesmo com vários ciclos", async () => {
    const store = novoStore();
    await store.saveConfig({ ativo: true, modo_teste: false, modo: "automatico" });
    const chamadas: Record<string, number> = {};
    const passos = passosFalsos(chamadas);
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("08:59"), passos });
    expect(await store.listarPosts({ kinds: ["dia"] })).toHaveLength(0);
    for (let i = 0; i < 4; i++) await tick(store, new BlobsFalsos(), CONTA, { agora: em("09:00"), passos });
    expect(await store.listarPosts({ kinds: ["dia"] })).toHaveLength(1);
    expect(chamadas.pesquisa).toBe(1);
  });

  it("desligado: não cria nada", async () => {
    const store = novoStore();
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("10:00"), passos: passosFalsos({}) });
    expect(await store.listarPosts()).toHaveLength(0);
  });

  it("dia desmarcado nos dias ativos não cria post", async () => {
    const store = novoStore();
    await store.saveConfig({ ativo: true, dias_ativos: [2, 3] }); // segunda (1) fora
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("10:00"), passos: passosFalsos({}) });
    expect(await store.listarPosts({ kinds: ["dia"] })).toHaveLength(0);
  });

  it("segue o cronograma: pesquisa 09:00, roteiro só 09:30, publica só 12:00", async () => {
    const store = novoStore();
    await store.saveConfig({ ativo: true, modo_teste: false, modo: "automatico" });
    const ch: Record<string, number> = {};
    const passos = passosFalsos(ch);
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("09:05"), passos });
    expect(ch.pesquisa).toBe(1);
    expect(ch.roteiro ?? 0).toBe(0);
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("09:31"), passos });
    expect(ch.roteiro).toBe(1);
    expect(ch.revisao).toBe(1);
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("11:46"), passos }); // checagem final liberada
    expect(ch.recheck).toBe(1);
    expect(ch.publicar ?? 0).toBe(0); // ainda não deu 12:00
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("12:00"), passos });
    expect(ch.publicar).toBe(1);
  });
});

describe("conteúdo reprovado nunca é publicado", () => {
  it("revisão reprova sempre → plano B (atemporal) → reprova de novo → suspenso, sem publicar", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "11:00");
    const ch: Record<string, number> = {};
    const passos = passosFalsos(ch, {
      revisao: async (c, post) => {
        ch.revisao = (ch.revisao ?? 0) + 1;
        const rev = { tentativa: post.revisoes.length + 1, aprovado: false, itens: [], resumo: "dado errado", correcoes_pedidas: ["corrigir"], problemas_de_imagem: false, checagens_de_codigo: [], em: new Date().toISOString() };
        return { post: (await c.store.atualizarPost(post.id, { revisoes: [...post.revisoes, rev], status: "em_revisao" }))!, revisao: rev };
      },
    });
    const { post } = await store.criarPost({ conta: CONTA, data: DATA, kind: "dia", status: "novo", modo: "automatico" });
    const fim = await rodarAte(ctx, post.id, passos, 80);
    expect(fim.status).toBe("suspenso");
    expect(fim.motivo).toMatch(/Sem conteúdo seguro/);
    expect(ch.publicar ?? 0).toBe(0);
    expect(fim.tipo_pauta).toBe("atemporal");
  });

  it("checagem final diz que o assunto não vale mais → não publica e cai no plano B", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "11:50");
    const ch: Record<string, number> = {};
    const passos = passosFalsos(ch, { recheck: async () => ({ em: "", ainda_valido: false, houve_novo_desenvolvimento: true, resumo: "desmentido", fontes_novas: [] }) });
    const post = await postPronto(store, { status: "aprovado" });
    const r = await avancar(ctx, post, { passos });
    expect(r.post.status).not.toBe("pronto");
    expect(r.post.tipo_pauta).toBe("atemporal");
    expect(ch.publicar ?? 0).toBe(0);
  });

  it("falha técnica da checagem final com política 'bloquear' → plano B; com 'publicar' → segue", async () => {
    for (const [politica, esperado] of [["bloquear", "atemporal"], ["publicar", "noticia"]] as const) {
      const store = novoStore();
      const ctx = await ctxEm(store, "11:50", { conteudo: { se_recheck_falhar: politica } });
      const passos = passosFalsos({}, { recheck: async () => { throw new Error("API fora do ar"); } });
      let post = await postPronto(store, { status: "aprovado", tentativas: { recheck: 2 } });
      post = (await avancar(ctx, post, { passos })).post;
      expect(post.tipo_pauta).toBe(esperado);
      if (politica === "publicar") expect(post.status).toBe("pronto");
    }
  });
});

describe("modo manual", () => {
  it("para em 'aguardando_aprovacao' e só segue depois do OK", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "10:00", { modo: "manual" });
    const ch: Record<string, number> = {};
    const passos = passosFalsos(ch);
    const { post } = await store.criarPost({ conta: CONTA, data: DATA, kind: "dia", status: "novo", modo: "manual" });
    const parado = await rodarAte(ctx, post.id, passos);
    expect(parado.status).toBe("aguardando_aprovacao");
    expect(ch.publicar ?? 0).toBe(0);
    const ok = await executarAcao(store, new BlobsFalsos(), CONTA, post.id, { tipo: "aprovar" });
    expect(ok.post?.status).toBe("aprovado");
  });
});

describe("política de atraso", () => {
  it("passou da janela sem estar pronto → perdeu_janela, não publica", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:45");
    const ch: Record<string, number> = {};
    const post = await postPronto(store);
    const r = await avancar(ctx, post, { passos: passosFalsos(ch) });
    expect(r.post.status).toBe("perdeu_janela");
    expect(ch.publicar ?? 0).toBe(0);
  });
  it("dentro da janela (12:20) ainda publica", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:20");
    const ch: Record<string, number> = {};
    const r = await avancar(ctx, await postPronto(store), { passos: passosFalsos(ch) });
    expect(ch.publicar).toBe(1);
    expect(r.acao).toMatch(/publicado/);
  });
  it("antes das 12:00 espera", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "11:59");
    const ch: Record<string, number> = {};
    await avancar(ctx, await postPronto(store), { passos: passosFalsos(ch) });
    expect(ch.publicar ?? 0).toBe(0);
  });
  it("dia anterior aberto é encerrado e não publica", async () => {
    const store = novoStore();
    await store.saveConfig({ ativo: true, modo_teste: false });
    const ontem = await store.criarPost({ conta: CONTA, data: "2026-11-08", kind: "dia", status: "pronto", modo: "automatico" });
    const ch: Record<string, number> = {};
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("09:00"), passos: passosFalsos(ch) });
    expect((await store.getPost(ontem.post.id))!.status).toBe("perdeu_janela");
    expect(ch.publicar ?? 0).toBe(0);
  });
});

describe("falhas de API e plano B", () => {
  it("erro numa etapa: conta tentativa, agenda nova tentativa com espera e não repete imediatamente", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "09:10");
    const ch: Record<string, number> = {};
    const passos = passosFalsos(ch, { pesquisa: async () => { ch.pesquisa = (ch.pesquisa ?? 0) + 1; throw new Error("OpenAI 500"); } });
    const { post } = await store.criarPost({ conta: CONTA, data: DATA, kind: "dia", status: "novo", modo: "automatico" });
    const r1 = await avancar(ctx, post, { passos });
    expect(r1.post.proxima_tentativa_em).toBeTruthy();
    expect(r1.post.tentativas.pesquisando).toBe(1);
    const r2 = await avancar(ctx, r1.post, { passos });
    expect(r2.acao).toMatch(/aguardando nova tentativa/);
    expect(ch.pesquisa).toBe(1);
  });

  it("estourou o limite de custo: não gasta mais, não derruba o post", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "09:10");
    const passos = passosFalsos({}, { pesquisa: async () => { throw new OrcamentoEstourado("limite diário"); } });
    const { post } = await store.criarPost({ conta: CONTA, data: DATA, kind: "dia", status: "novo", modo: "automatico" });
    const r = await avancar(ctx, post, { passos });
    expect(r.acao).toMatch(/custo/);
    expect(r.post.status).not.toBe("falhou");
  });

  it("pesquisa sem pauta: adota o post reserva pronto (e o marca como usado)", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "09:10");
    const r = roteiroFalso();
    const reserva = (await store.criarPost({ conta: CONTA, data: "2026-11-01", kind: "reserva", status: "aprovado", modo: "automatico", tipo_pauta: "atemporal", pauta: pautaFalsa("Reserva"), roteiro: r, slides: r.slides, legenda: r.legenda })).post;
    const passos = passosFalsos({}, { pesquisa: async () => ({ tipo: "sem_pauta" as const, motivo: "nada passou nos critérios" }) });
    const { post } = await store.criarPost({ conta: CONTA, data: DATA, kind: "dia", status: "novo", modo: "automatico" });
    const res = await avancar(ctx, post, { passos });
    expect(res.post.status).toBe("imagens_prontas"); // vai renderizar e revisar de novo
    expect(res.post.pauta?.titulo).toBe("Reserva");
    expect((await store.getPost(reserva.id))!.status).toBe("usada");
  });

  it("pesquisa sem pauta e sem reserva: usa tema atemporal (nunca como notícia)", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "09:10");
    const passos = passosFalsos({}, { pesquisa: async () => ({ tipo: "sem_pauta" as const, motivo: "sem fontes" }) });
    const { post } = await store.criarPost({ conta: CONTA, data: DATA, kind: "dia", status: "novo", modo: "automatico" });
    const res = await avancar(ctx, post, { passos });
    expect(res.post.tipo_pauta).toBe("atemporal");
    expect(res.post.status).toBe("pesquisado");
    expect(res.post.pauta?.fontes).toHaveLength(0);
  });
});

describe("ações do painel", () => {
  it("pausar impede avanço; retomar libera; cancelar encerra", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "10:00");
    const { post } = await store.criarPost({ conta: CONTA, data: DATA, kind: "dia", status: "pesquisado", modo: "automatico", pauta: pautaFalsa() });
    await executarAcao(store, ctx.blobs, CONTA, post.id, { tipo: "pausar" });
    const ch: Record<string, number> = {};
    const r = await avancar(ctx, (await store.getPost(post.id))!, { passos: passosFalsos(ch) });
    expect(r.acao).toMatch(/pausado/);
    await executarAcao(store, ctx.blobs, CONTA, post.id, { tipo: "retomar" });
    const c = await executarAcao(store, ctx.blobs, CONTA, post.id, { tipo: "cancelar" });
    expect(c.post?.status).toBe("cancelado");
    expect(ch.roteiro ?? 0).toBe(0);
  });
  it("não aprova quem não está aguardando aprovação", async () => {
    const store = novoStore();
    const post = await postPronto(store);
    const r = await executarAcao(store, new BlobsFalsos(), CONTA, post.id, { tipo: "aprovar" });
    expect(r.ok).toBe(false);
  });
});

describe("post das 18h (slot tarde)", () => {
  it("desligado por padrão: às 15:00 não nasce post 'tarde'", async () => {
    const store = novoStore();
    await store.saveConfig({ ativo: true, modo_teste: false, modo: "automatico" });
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("15:00"), passos: passosFalsos({}) });
    expect(await store.listarPosts({ kinds: ["tarde"] })).toHaveLength(0);
  });

  it("ligado: nasce às 15:00 (um só), pesquisa pelas referências, roteiro só 15:30, publica só 18:00; o das 12h não é afetado", async () => {
    const store = novoStore();
    await store.saveConfig({ ativo: true, modo_teste: false, modo: "automatico", tarde: { ativo: true } });
    const ch: Record<string, number> = {};
    const passos = passosFalsos(ch);
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("14:59"), passos });
    expect(await store.listarPosts({ kinds: ["tarde"] })).toHaveLength(0);
    for (let i = 0; i < 3; i++) await tick(store, new BlobsFalsos(), CONTA, { agora: em("15:00"), passos });
    const tardes = await store.listarPosts({ kinds: ["tarde"] });
    expect(tardes).toHaveLength(1);
    expect(ch.pesquisaReferencias).toBe(1);
    expect(tardes[0].tipo_pauta).toBe("referencia");
    expect(tardes[0].status).toBe("pesquisado"); // roteiro só às 15:30
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("15:30"), passos });
    for (let i = 0; i < 6; i++) await tick(store, new BlobsFalsos(), CONTA, { agora: em("15:31"), passos });
    let t = (await store.listarPosts({ kinds: ["tarde"] }))[0];
    expect(["aprovado", "pronto"]).toContain(t.status); // aprovado; checagem final só 17:45
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("17:45"), passos });
    t = (await store.listarPosts({ kinds: ["tarde"] }))[0];
    expect(t.status).toBe("pronto");
    const publicadosAntes = ch.publicar ?? 0; // o post das 12h já pode ter publicado neste store
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("17:59"), passos });
    expect(ch.publicar ?? 0).toBe(publicadosAntes); // 17:59: a tarde ainda não publica
    await tick(store, new BlobsFalsos(), CONTA, { agora: em("18:00"), passos });
    expect(ch.publicar).toBe(publicadosAntes + 1); // 18:00: publicou a tarde
  });

  it("a janela da tarde é a das 18h: às 18:31 sem estar pronto perde a janela", async () => {
    const store = novoStore();
    await store.saveConfig({ ativo: true, modo_teste: false, modo: "automatico", tarde: { ativo: true } });
    const { post } = await store.criarPost({ conta: CONTA, data: DATA, kind: "tarde", status: "roteirizado", modo: "automatico", tipo_pauta: "referencia", pauta: pautaFalsa() });
    const r = await avancar(await ctxEm(store, "18:31", { tarde: { ativo: true } }), post, { passos: passosFalsos({}) });
    expect(r.post.status).toBe("perdeu_janela");
    expect(estadoDaJanela(await store.getConfig(), em("12:10"), "tarde")).toBe("antes");
  });
});
