import type { Config } from "./config";
import type { Store } from "./store/tipos";
import { agoraSP, instanteSP } from "./tempo";
import { custoImagem, custoTexto, type ImagemGerada, type RespostaTexto } from "./openai";

export class OrcamentoEstourado extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "OrcamentoEstourado";
  }
}

export type Consumo = { custo_usd: number; imagens: number };

function inicioDoDia(): string {
  return instanteSP(agoraSP().data, "00:00").toISOString();
}
function inicioDoMes(): string {
  return instanteSP(`${agoraSP().data.slice(0, 7)}-01`, "00:00").toISOString();
}

export async function consumo(store: Store): Promise<{ dia: Consumo; mes: Consumo }> {
  const usos = await store.usoDesde(inicioDoMes());
  const corte = inicioDoDia();
  const soma = (l: typeof usos): Consumo => ({ custo_usd: l.reduce((a, u) => a + Number(u.custo_usd), 0), imagens: l.reduce((a, u) => a + u.imagens, 0) });
  return { dia: soma(usos.filter((u) => (u.criado_em ?? "") >= corte)), mes: soma(usos) };
}

// Chamada ANTES de cada operação paga. Lança OrcamentoEstourado se passar de algum limite.
export async function garantirOrcamento(store: Store, cfg: Config, opc?: { imagensNovas?: number }) {
  const c = await consumo(store);
  const l = cfg.limites;
  if (c.dia.custo_usd >= l.custo_dia_usd) throw new OrcamentoEstourado(`Limite diário de custo atingido (US$ ${c.dia.custo_usd.toFixed(2)} de US$ ${l.custo_dia_usd}).`);
  if (c.mes.custo_usd >= l.custo_mes_usd) throw new OrcamentoEstourado(`Limite mensal de custo atingido (US$ ${c.mes.custo_usd.toFixed(2)} de US$ ${l.custo_mes_usd}).`);
  if (opc?.imagensNovas && c.dia.imagens + opc.imagensNovas > l.max_imagens_dia) throw new OrcamentoEstourado(`Limite diário de imagens atingido (${c.dia.imagens} de ${l.max_imagens_dia}).`);
}

export async function registrarTexto(store: Store, cfg: Config, postId: string | null, etapa: string, modelo: string, r: RespostaTexto, promptVersion: string) {
  const custo = custoTexto(cfg, modelo, r.uso, r.buscas);
  await store.registrarUso({ post_id: postId, etapa, provedor: "openai", modelo, ...r.uso, imagens: 0, buscas_web: r.buscas, custo_usd: custo, prompt_version: promptVersion });
  return custo;
}

export async function registrarImagem(store: Store, cfg: Config, postId: string | null, etapa: string, modelo: string, img: ImagemGerada, qualidade: string, promptVersion: string) {
  const custo = custoImagem(cfg, img, qualidade);
  await store.registrarUso({ post_id: postId, etapa, provedor: "openai", modelo, tokens_entrada: img.tokens_texto + img.tokens_imagem_entrada, tokens_saida: img.tokens_saida, tokens_cache: 0, imagens: 1, buscas_web: 0, custo_usd: custo, prompt_version: promptVersion });
  return custo;
}
