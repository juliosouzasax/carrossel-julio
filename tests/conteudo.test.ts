import { describe, expect, it } from "vitest";
import { configPadrao } from "../src/lib/config";
import { normalizarUrl, notaFinal, rankear } from "../src/lib/pipeline/pesquisa";
import { validarRoteiro } from "../src/lib/pipeline/validacao";
import { dimensoesJpeg } from "../src/lib/render/jpeg";
import { mesAnoDe, renderizarSlideJpeg, ALTURA, LARGURA } from "../src/lib/render/slides";
import { jaccard } from "../src/lib/similaridade";
import { pautaFalsa, roteiroFalso } from "./helpers";

const cfg = configPadrao();

describe("escolha da pauta", () => {
  it("normaliza URL (www, utm, barra final)", () => {
    expect(normalizarUrl("https://www.A.com/x/?utm_source=z&id=1#h")).toBe("https://a.com/x?id=1");
  });
  it("exige 2 fontes independentes (mesmo domínio raiz conta como uma)", () => {
    const p = pautaFalsa();
    p.fontes = [{ titulo: "1", url: "https://g1.globo.com/a", dominio: "g1.globo.com", verificada: "ok" }, { titulo: "2", url: "https://oglobo.globo.com/b", dominio: "oglobo.globo.com", verificada: "ok" }];
    const r = rankear([p], { historico: [], cfg });
    expect(r.escolhido).toBeNull();
    expect(r.candidatos[0].descartada_por).toMatch(/fonte/);
  });
  it("descarta assunto repetido dos últimos 60 dias e nota baixa; escolhe a melhor entre as válidas", () => {
    const boa = pautaFalsa("Novo recurso do WhatsApp para atendimento de clínicas");
    const repetida = pautaFalsa("Novo recurso do WhatsApp para atendimento de clínicas");
    const fraca = { ...pautaFalsa("Outro assunto qualquer"), notas: { atualidade: 3, gancho: 3, relevancia: 3, confiabilidade: 3, originalidade: 3 } };
    const ok = pautaFalsa("Instagram muda o alcance dos Reels");
    const r = rankear([repetida, fraca, ok], { historico: [{ data: "2026-11-01", titulo: boa.titulo, headline: "x", layouts: [] }], cfg });
    expect(r.candidatos[0].descartada_por).toMatch(/repete/);
    expect(r.candidatos[1].descartada_por).toMatch(/nota/);
    expect(r.escolhido).toBe(2);
  });
  it("fonte inacessível pesa na nota", () => {
    const n = pautaFalsa().notas;
    expect(notaFinal(n, true, 1)).toBeLessThan(notaFinal(n, true, 0));
  });
  it("similaridade", () => {
    expect(jaccard("novo recurso whatsapp clínicas", "novo recurso whatsapp clínicas")).toBe(1);
    expect(jaccard("a b c", "x y z")).toBe(0);
  });
});

describe("validação do roteiro (código, não prompt)", () => {
  const base = () => {
    const r = roteiroFalso();
    r.headline_escolhida = "Quatro palavras na headline";
    r.slides[0].titulo = r.headline_escolhida;
    r.slides[0].corpo = "subline curta";
    r.legenda = "Muitas clínicas perdem pacientes por demora na resposta e por falta de processo no atendimento. Neste carrossel mostramos três ajustes simples para organizar a rotina da recepção, medir o tempo de resposta e reduzir faltas. Salve esse post\nEncaminhe para um dentista ou dono de clínica\nMe chame no direct para elevar seu faturamento\n\n#odontologia #gestaodeclinicas #dentista #atendimento #marketingodontologico";
    return r;
  };
  it("roteiro válido passa", () => {
    expect(validarRoteiro(base(), { tipo: "atemporal", cfg })).toEqual([]);
  });
  it("bloqueia promessa de material que o sistema não entrega", () => {
    const r = base();
    r.legenda = "Comente QUERO que eu te mando o PDF";
    expect(validarRoteiro(r, { tipo: "atemporal", cfg }).join(" ")).toMatch(/promess|material|entreg/i);
  });
  it("bloqueia promessa de resultado e emoji nos slides", () => {
    const r = base();
    r.slides[2].corpo = "Dobre seu faturamento em 30 dias 🚀";
    const falhas = validarRoteiro(r, { tipo: "atemporal", cfg }).join(" ");
    expect(falhas).toMatch(/emoji/i);
    expect(falhas).toMatch(/promess|garant|resultado|faturamento/i);
  });
  it("conteúdo atemporal não pode usar 'hoje/ontem' como se fosse notícia", () => {
    const r = base();
    r.slides[1].corpo = "Hoje saiu uma novidade importante";
    expect(validarRoteiro(r, { tipo: "atemporal", cfg }).join(" ")).toMatch(/hoje|not[ií]cia|atemporal/i);
  });
  it("número de slides fora de 6 a 8 é reprovado", () => {
    const r = base();
    r.slides = r.slides.slice(0, 4);
    expect(validarRoteiro(r, { tipo: "atemporal", cfg }).join(" ")).toMatch(/entre 6 e 8/);
  });
});

describe("renderização", () => {
  it("gera JPEG 1080x1350 (4:5) para a capa e para um slide de texto", async () => {
    const r = roteiroFalso();
    for (const s of [r.slides[0], r.slides[1]]) {
      const { jpeg, largura, altura } = await renderizarSlideJpeg(s, { total: 6, identidade: cfg.identidade, imagemDataUri: null, ilustrativo: false, mesAno: mesAnoDe("2026-11-09") });
      expect([largura, altura]).toEqual([LARGURA, ALTURA]);
      expect(dimensoesJpeg(jpeg)).toEqual({ largura: 1080, altura: 1350 });
      expect(jpeg.length).toBeLessThan(8 * 1024 * 1024);
    }
  }, 60_000);
});
