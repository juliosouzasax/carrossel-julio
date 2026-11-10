import { describe, expect, it } from "vitest";
import { ErroInstagram } from "../src/lib/instagram";
import { executarPublicacao } from "../src/lib/pipeline/publicar";
import { clienteFalso, ctxEm, novoStore, postPronto } from "./helpers";

const deps = (cliente: ReturnType<typeof clienteFalso>) => ({ cliente, verificarImagem: async () => ({ ok: true }), esperar: async () => {} });

describe("publicação no Instagram", () => {
  it("publica um carrossel completo e registra id e link", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:00");
    const post = await postPronto(store);
    const c = clienteFalso();
    const r = await executarPublicacao(ctx, post, deps(c));
    expect(r.resultado).toBe("publicado");
    expect(r.post.status).toBe("publicado");
    expect(r.post.publicacao.media_id).toBe("m1");
    expect(r.post.publicacao.permalink).toContain("instagram.com");
    expect(c.chamadas.criarItem).toBe(6);
    expect(c.chamadas.publicar).toBe(1);
  });

  it("não duplica: timeout no media_publish, mas o post já está no perfil → adota e NÃO republica", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:00");
    const post = await postPronto(store);
    const c = clienteFalso({ publicarFalha: "timeout-mas-publicou" });
    const r = await executarPublicacao(ctx, post, deps(c));
    expect(r.resultado).toBe("publicado");
    expect(c.chamadas.publicar).toBe(1);
    expect(r.post.publicacao.media_id).toBe("m1");
  });

  it("falha temporária: fica aguardando e, na próxima tentativa, reaproveita os containers (sem recriar)", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:00");
    const post = await postPronto(store);
    const falho = clienteFalso({ publicarFalha: new ErroInstagram("Instagram: 500", null, null, 500, true) });
    const r1 = await executarPublicacao(ctx, post, deps(falho));
    expect(r1.resultado).toBe("aguardando");
    expect(r1.post.status).toBe("publicando");
    expect(r1.post.proxima_tentativa_em).toBeTruthy();

    const ok = clienteFalso();
    const r2 = await executarPublicacao(ctx, r1.post, deps(ok));
    expect(r2.resultado).toBe("publicado");
    expect(ok.chamadas.criarItem ?? 0).toBe(0); // containers já existiam
    expect(ok.chamadas.criarCarrossel ?? 0).toBe(0);
    expect(ok.chamadas.recentes).toBeGreaterThanOrEqual(1); // conferiu o perfil antes de repetir
  });

  it("erro não retentável (limite diário) encerra como falhou", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:00");
    const post = await postPronto(store);
    const c = clienteFalso();
    c.limite = async () => ({ usado: 50, total: 50 });
    const r = await executarPublicacao(ctx, post, deps(c));
    expect(r.resultado).toBe("falhou");
    expect(c.chamadas.publicar ?? 0).toBe(0);
  });

  it("imagem inacessível à Meta impede a criação dos containers", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:00");
    const post = await postPronto(store);
    const c = clienteFalso();
    const r = await executarPublicacao(ctx, post, { ...deps(c), verificarImagem: async () => ({ ok: false, motivo: "HTTP 403" }) });
    expect(r.resultado).toBe("aguardando");
    expect(c.chamadas.criarItem ?? 0).toBe(0);
  });

  it("já publicado: não chama o Instagram de novo", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:00");
    const post = await postPronto(store, { status: "publicado", publicacao: { media_id: "m9", confirmada_em: new Date().toISOString() } });
    const c = clienteFalso();
    const r = await executarPublicacao(ctx, post, deps(c));
    expect(r.resultado).toBe("publicado");
    expect(Object.keys(c.chamadas)).toHaveLength(0);
  });

  it("duas execuções simultâneas: só uma publica", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:00");
    const post = await postPronto(store);
    const c = clienteFalso();
    const [a, b] = await Promise.all([executarPublicacao(ctx, post, deps(c)), executarPublicacao(ctx, post, deps(c))]);
    expect([a.resultado, b.resultado].filter((x) => x === "publicado")).toHaveLength(1);
    expect(c.chamadas.publicar).toBe(1);
  });

  it("MODO DE TESTE: simula e nunca chama o Instagram", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:00", { modo_teste: true });
    const post = await postPronto(store);
    const c = clienteFalso();
    const r = await executarPublicacao(ctx, post, deps(c));
    expect(r.resultado).toBe("simulado");
    expect(r.post.status).toBe("simulado");
    expect(Object.keys(c.chamadas)).toHaveLength(0);
  });

  it("post do tipo teste nunca publica, mesmo com o modo de teste desligado", async () => {
    const store = novoStore();
    const ctx = await ctxEm(store, "12:00", { modo_teste: false });
    const post = await postPronto(store, { kind: "teste" });
    const c = clienteFalso();
    const r = await executarPublicacao(ctx, post, deps(c));
    expect(r.resultado).toBe("simulado");
    expect(Object.keys(c.chamadas)).toHaveLength(0);
  });
});
