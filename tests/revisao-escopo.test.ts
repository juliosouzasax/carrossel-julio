import { describe, expect, it } from "vitest";
import { configPadrao } from "../src/lib/config";
import { filtrarPedidosForaDoEscopo } from "../src/lib/pipeline/revisao";

// Pedidos REAIS do revisor em 10/11/2026 (reprovou 3x e derrubou a pauta do Pix para o plano B).
const base = {
  aprovado: false,
  resumo: "Não publicar com a promessa de elevar faturamento no slide 7 e na legenda.",
  problemas_de_imagem: false,
  itens: [
    { criterio: "fatos_e_fontes", ok: true, problema: null, gravidade: "observacao" as const },
    { criterio: "coerencia_visual", ok: false, problema: "Slide 1: falta o rótulo legível de “Imagem ilustrativa” na capa.", gravidade: "ajuste" as const },
    { criterio: "afirmacoes_enganosas", ok: false, problema: "Slide 7 e legenda: “Me chame no direct para elevar seu faturamento” é promessa de faturamento.", gravidade: "bloqueante" as const },
  ],
  correcoes_pedidas: [
    "Slide 1: inserir na arte um rótulo legível de “Imagem ilustrativa”.",
    "Slide 7: remover “Me chame no direct para elevar seu faturamento”. Manter as chamadas para salvar e encaminhar.",
    "Legenda: excluir a frase de faturamento ao final.",
  ],
};

describe("revisor não manda no CTA fixo nem no rótulo desligado", () => {
  it("descarta os pedidos fora do escopo e aprova quando só sobrava isso", () => {
    const r = filtrarPedidosForaDoEscopo(base, configPadrao());
    expect(r.correcoes_pedidas).toEqual([]);
    expect(r.ignorados.length).toBeGreaterThanOrEqual(3);
    expect(r.itens.every((i) => i.ok)).toBe(true);
    expect(r.aprovado).toBe(true);
  });

  it("mantém reprovação quando há problema real junto", () => {
    const r = filtrarPedidosForaDoEscopo(
      { ...base, itens: [...base.itens, { criterio: "fatos_e_fontes", ok: false, problema: "Slide 3: o número 320 milhões não está nas fontes (319,7).", gravidade: "bloqueante" }], correcoes_pedidas: [...base.correcoes_pedidas, "Slide 3: corrigir 320 milhões para 319,7 milhões."] },
      configPadrao(),
    );
    expect(r.aprovado).toBe(false);
    expect(r.correcoes_pedidas).toEqual(["Slide 3: corrigir 320 milhões para 319,7 milhões."]);
  });

  it("com rótulo configurado, pedido de rótulo continua valendo", () => {
    const cfg = configPadrao();
    cfg.identidade.rotulo_ilustracao = "Ilustração";
    const r = filtrarPedidosForaDoEscopo({ ...base, itens: [base.itens[1]], correcoes_pedidas: [base.correcoes_pedidas[0]] }, cfg);
    expect(r.correcoes_pedidas.length).toBe(1);
    expect(r.aprovado).toBe(false);
  });
});
