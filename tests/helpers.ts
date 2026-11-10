import { MemoriaStore } from "../src/lib/store/memoria";
import type { Blobs } from "../src/lib/store/tipos";
import type { ClienteIG } from "../src/lib/instagram";
import { ErroInstagram } from "../src/lib/instagram";
import type { Passos } from "../src/lib/pipeline/orquestrador";
import { criarCtx } from "../src/lib/pipeline/orquestrador";
import { agoraSP } from "../src/lib/tempo";
import type { Pauta, Post, Roteiro, Slide } from "../src/lib/types";

export const CONTA = "teste";
export const DATA = "2026-11-09"; // segunda-feira

// 12:00 em São Paulo = 15:00 UTC.
export const em = (hhmm: string, data = DATA) => agoraSP(new Date(`${data}T${hhmm}:00-03:00`));

export class BlobsFalsos implements Blobs {
  async put(caminho: string) {
    return { url: `https://exemplo.test/${caminho}` };
  }
  async get() {
    return Buffer.from("x");
  }
}

export function novoStore() {
  return new MemoriaStore();
}

export function slides(n = 6): Slide[] {
  return Array.from({ length: n }, (_, i) => ({
    n: i + 1,
    papel: i === 0 ? "capa" : "aprendizado",
    layout: i === 0 ? "capa" : "texto",
    titulo: `Título ${i + 1}`,
    corpo: `Corpo do slide ${i + 1}`,
    destaque: null,
    imagem_idx: i === 0 ? 0 : null,
    hipotetico: false,
    url: `https://exemplo.test/${DATA}/slide-${i + 1}.jpg`,
  })) as Slide[];
}

export function roteiroFalso(): Roteiro {
  return {
    headlines: ["a", "b", "c", "d", "e"],
    headline_escolhida: "Headline de teste",
    porque_esta_headline: "teste",
    slides: slides(),
    legenda: "Legenda de teste #dentista",
    chamada_final: "salvar",
    prompt_imagem_capa: "cena",
    prompts_imagens_extras: [],
    fonte_resumo_para_legenda: "",
    ilustrativo: false,
  };
}

export function pautaFalsa(titulo = "Assunto de teste"): Pauta {
  return {
    titulo,
    o_que_aconteceu: "Algo aconteceu.",
    data_acontecimento: DATA,
    data_publicacao: DATA,
    fontes: [
      { titulo: "A", url: "https://a.com/x", dominio: "a.com", verificada: "ok" },
      { titulo: "B", url: "https://b.org/y", dominio: "b.org", verificada: "ok" },
    ],
    evidencias_de_atencao: "x",
    em_alta_comprovado: true,
    conexao_com_clinica: "x",
    riscos: "x",
    desenvolvimento_novo_sobre_tema_recente: false,
    notas: { atualidade: 9, gancho: 9, relevancia: 9, confiabilidade: 9, originalidade: 9 },
  };
}

// Passos falsos: cada um só move o status, sem OpenAI. "sobrescreve" troca passos específicos.
export function passosFalsos(chamadas: Record<string, number>, sobrescreve: Partial<Passos> = {}): Passos {
  const cont = (k: string) => (chamadas[k] = (chamadas[k] ?? 0) + 1);
  return {
    pesquisa: async (ctx, post) => {
      cont("pesquisa");
      const p = await ctx.store.atualizarPost(post.id, { pauta: pautaFalsa(), tipo_pauta: "noticia", status: "pesquisado", justificativa: "j" });
      return { tipo: "ok", post: p! };
    },
    roteiro: async (ctx, post) => {
      cont("roteiro");
      const r = roteiroFalso();
      return (await ctx.store.atualizarPost(post.id, { roteiro: r, slides: r.slides.map((s) => ({ ...s, url: null })), legenda: r.legenda, status: "roteirizado" }))!;
    },
    imagens: async (ctx, post) => {
      cont("imagens");
      return (await ctx.store.atualizarPost(post.id, { status: "imagens_prontas" }))!;
    },
    regenerar: async (_c, post) => {
      cont("regenerar");
      return post;
    },
    render: async (ctx, post) => {
      cont("render");
      return (await ctx.store.atualizarPost(post.id, { slides: slides(), status: "renderizado" }))!;
    },
    revisao: async (ctx, post) => {
      cont("revisao");
      const rev = { tentativa: post.revisoes.length + 1, aprovado: true, itens: [], resumo: "ok", correcoes_pedidas: [], problemas_de_imagem: false, checagens_de_codigo: [], em: new Date().toISOString() };
      const p = await ctx.store.atualizarPost(post.id, { revisoes: [...post.revisoes, rev], status: "em_revisao" });
      return { post: p!, revisao: rev };
    },
    recheck: async () => {
      cont("recheck");
      return { em: new Date().toISOString(), ainda_valido: true, houve_novo_desenvolvimento: false, resumo: "ok", fontes_novas: [] };
    },
    publicar: async (_c, post) => {
      cont("publicar");
      return { resultado: "publicado", post, mensagem: "ok" };
    },
    ...sobrescreve,
  };
}

export type Espiao = { chamadas: Record<string, number> } & ClienteIG;

// Cliente do Instagram falso. "recentes" é o que "já existe" no perfil.
export function clienteFalso(opc: { publicarFalha?: Error | "timeout-mas-publicou"; recentes?: { id: string; caption: string | null; permalink: string | null; timestamp: string }[] } = {}): Espiao {
  const chamadas: Record<string, number> = {};
  const cont = (k: string) => (chamadas[k] = (chamadas[k] ?? 0) + 1);
  const recentes = opc.recentes ?? [];
  return {
    chamadas,
    async limite() { cont("limite"); return { usado: 0, total: 50 }; },
    async criarItem() { cont("criarItem"); return `item${chamadas.criarItem}`; },
    async statusContainer() { cont("status"); return { codigo: "FINISHED" as const }; },
    async criarCarrossel() { cont("criarCarrossel"); return "carrossel1"; },
    async publicar() {
      cont("publicar");
      if (opc.publicarFalha === "timeout-mas-publicou") {
        recentes.push({ id: "m1", caption: "Legenda de teste #dentista", permalink: "https://instagram.com/p/x", timestamp: new Date().toISOString() });
        throw new ErroInstagram("Instagram: tempo esgotado", null, null, null, true);
      }
      if (opc.publicarFalha) throw opc.publicarFalha;
      return "m1";
    },
    async detalhe() { cont("detalhe"); return { permalink: "https://instagram.com/p/x", timestamp: new Date().toISOString() }; },
    async recentes() { cont("recentes"); return recentes; },
  };
}

export async function postPronto(store: MemoriaStore, extra: Partial<Post> = {}): Promise<Post> {
  const r = roteiroFalso();
  const { post } = await store.criarPost({
    conta: CONTA, data: DATA, kind: "dia", status: "pronto", modo: "automatico",
    roteiro: r, slides: r.slides, legenda: r.legenda, pauta: pautaFalsa(), ...extra,
  });
  return post;
}

export async function ctxEm(store: MemoriaStore, hhmm: string, cfgPatch: unknown = {}) {
  await store.saveConfig({ ativo: true, modo_teste: false, modo: "automatico", ...(cfgPatch as object) });
  return criarCtx(store, new BlobsFalsos(), await store.getConfig(), em(hhmm), CONTA);
}
