import type { Config } from "../config";
import { garantirOrcamento, registrarTexto } from "../custo";
import { responder, responderJson } from "../openai";
import { dominioDe, dominioRaiz, jaccard, maisParecido } from "../similaridade";
import type { Fonte, ImagemBase, NotasPauta, Pauta, Post } from "../types";
import { creditoDaFoto, materialDasFontes, type FotoFonte } from "../fotosDasFontes";
import { promptEstruturar, promptPesquisa, TEMAS_ATEMPORAIS, type ItemHistorico } from "../../prompts";
import { SCHEMA_CANDIDATOS } from "../../prompts/schemas";
import { historico, logar, type Ctx } from "./contexto";

export function normalizarUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) x.searchParams.delete(k);
    return `${x.protocol}//${x.hostname.replace(/^www\./, "").toLowerCase()}${x.pathname.replace(/\/$/, "")}${x.search}`;
  } catch {
    return u.trim();
  }
}

export function notaFinal(n: NotasPauta, emAlta: boolean, penalidade = 0): number {
  // Relevância e confiabilidade pesam mais, como pedido: priorizar o que é útil e confiável.
  const base = 0.3 * n.relevancia + 0.3 * n.confiabilidade + 0.15 * n.atualidade + 0.15 * n.gancho + 0.1 * n.originalidade;
  return Math.max(0, Math.min(10, base + (emAlta ? 0.3 : 0) - penalidade));
}

export function rankear(cands: Pauta[], opc: { historico: ItemHistorico[]; cfg: Config }): { candidatos: Pauta[]; escolhido: number | null } {
  const { cfg } = opc;
  const titulos = opc.historico.map((h) => h.titulo);
  const out = cands.map((c) => {
    const raizes = new Set(c.fontes.filter((f) => f.verificada !== "inacessivel").map((f) => dominioRaiz(f.url)).filter(Boolean));
    const inacessiveis = c.fontes.filter((f) => f.verificada === "inacessivel").length;
    const nota = notaFinal(c.notas, c.em_alta_comprovado, inacessiveis > 0 ? 1 : 0);
    let descartada: string | null = null;
    if (cfg.conteudo.exigir_duas_fontes && raizes.size < 2) descartada = `fato central com ${raizes.size} fonte(s) independente(s); exigem-se 2`;
    const par = maisParecido(c.titulo, titulos);
    if (!descartada && par.score >= cfg.conteudo.similaridade_maxima && !c.desenvolvimento_novo_sobre_tema_recente) descartada = `repete assunto recente ("${par.com}")`;
    if (!descartada && nota < cfg.conteudo.nota_minima) descartada = `nota final ${nota.toFixed(1)} abaixo do mínimo ${cfg.conteudo.nota_minima}`;
    return { ...c, fontes_independentes: raizes.size, nota_final: Number(nota.toFixed(2)), descartada_por: descartada };
  });
  let escolhido: number | null = null;
  out.forEach((c, i) => {
    if (c.descartada_por) return;
    if (escolhido === null || (c.nota_final ?? 0) > (out[escolhido].nota_final ?? 0)) escolhido = i;
  });
  return { candidatos: out, escolhido };
}

export function justificativaDaEscolha(c: Pauta, todas: Pauta[]): string {
  const n = c.notas;
  const rejeitadas = todas.filter((x) => x !== c && x.descartada_por).map((x) => `"${x.titulo}": ${x.descartada_por}`);
  return [
    `Escolhida por nota final ${c.nota_final?.toFixed(1)} (relevância ${n.relevancia}, confiabilidade ${n.confiabilidade}, atualidade ${n.atualidade}, gancho ${n.gancho}, originalidade ${n.originalidade}).`,
    `${c.fontes_independentes} fonte(s) independente(s). ${c.em_alta_comprovado ? "Há evidência de atenção." : "É notícia recente; não há prova de que esteja em alta."}`,
    `Conexão: ${c.conexao_com_clinica}`,
    rejeitadas.length ? `Descartadas: ${rejeitadas.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function verificarUrl(url: string): Promise<Fonte["verificada"]> {
  const tentar = async (metodo: "HEAD" | "GET") => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      const r = await fetch(url, { method: metodo, redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; verificador-de-fontes)", ...(metodo === "GET" ? { Range: "bytes=0-2048" } : {}) } });
      return r.status;
    } finally {
      clearTimeout(t);
    }
  };
  try {
    let s = await tentar("HEAD");
    if (s === 405 || s === 403 || s === 400) s = await tentar("GET");
    if (s >= 200 && s < 400) return "ok";
    if (s === 401 || s === 403 || s === 429) return "nao_verificada"; // proteção anti-robô: neutro
    return "inacessivel";
  } catch {
    return "inacessivel";
  }
}

export async function verificarFontes(cands: Pauta[]): Promise<void> {
  await Promise.all(
    cands.flatMap((c) =>
      c.fontes.slice(0, 4).map(async (f) => {
        f.verificada = await verificarUrl(f.url);
      }),
    ),
  );
}

type BrutoCandidato = Omit<Pauta, "fontes" | "fontes_independentes" | "nota_final" | "descartada_por"> & { fontes: { titulo: string; url: string; publicado_em: string | null }[] };

export type ResultadoPesquisa = { tipo: "ok"; post: Post } | { tipo: "sem_pauta"; motivo: string };

export async function executarPesquisa(ctx: Ctx, post: Post): Promise<ResultadoPesquisa> {
  const { store, cfg } = ctx;
  await garantirOrcamento(store, cfg);
  const hist = await historico(ctx, post.id);
  const p1 = promptPesquisa(cfg, ctx.agora.data, hist);

  // 1) Pesquisa na web (texto livre, com citações reais).
  const r1 = await responder({ modelo: cfg.modelos.pesquisa, instrucoes: p1.instrucoes, entrada: p1.entrada, busca: cfg.busca, raciocinio: cfg.raciocinio.pesquisa, timeoutMs: 230_000 });
  await registrarTexto(store, cfg, post.id, "pesquisa", cfg.modelos.pesquisa, r1, p1.versao);

  const permitidas = new Map<string, { url: string; titulo: string }>();
  for (const c of r1.citacoes) permitidas.set(normalizarUrl(c.url), { url: c.url, titulo: c.titulo });
  for (const u of r1.fontes_consultadas) if (!permitidas.has(normalizarUrl(u))) permitidas.set(normalizarUrl(u), { url: u, titulo: dominioDe(u) });
  if (!permitidas.size) {
    await logar(ctx, post, "pesquisa", "aviso", "A busca não devolveu nenhuma fonte citável.");
    return { tipo: "sem_pauta", motivo: "a busca na web não retornou fontes" };
  }

  // 2) Estruturação (sem ferramentas: nada do que veio da web consegue acionar ação alguma).
  await garantirOrcamento(store, cfg);
  const p2 = promptEstruturar(r1.texto, [...permitidas.values()], ctx.agora.data);
  const { dados, resposta } = await responderJson<{ candidatos: BrutoCandidato[] }>({ modelo: cfg.modelos.roteiro, instrucoes: p2.instrucoes, entrada: p2.entrada, schema: SCHEMA_CANDIDATOS, raciocinio: "low", timeoutMs: 120_000 });
  await registrarTexto(store, cfg, post.id, "pesquisa_estrutura", cfg.modelos.roteiro, resposta, p2.versao);

  // 3) Só vale URL que a busca realmente devolveu (anti-alucinação) — o resto é descartado em código.
  const cands: Pauta[] = (dados.candidatos ?? []).slice(0, 5).map((c) => ({
    ...c,
    fontes: c.fontes
      .filter((f) => permitidas.has(normalizarUrl(f.url)))
      .map((f) => ({ titulo: f.titulo || permitidas.get(normalizarUrl(f.url))!.titulo, url: permitidas.get(normalizarUrl(f.url))!.url, dominio: dominioDe(f.url), publicado_em: f.publicado_em, verificada: "nao_verificada" as const })),
  }));
  await verificarFontes(cands);

  const { candidatos, escolhido } = rankear(cands, { historico: hist, cfg });
  const justificativa = escolhido !== null ? justificativaDaEscolha(candidatos[escolhido], candidatos) : `Nenhum candidato passou nos critérios. ${candidatos.map((c) => `"${c.titulo}": ${c.descartada_por ?? "ok"}`).join(" | ")}`;
  await store.salvarCandidatos({ post_id: post.id, data: post.data, candidatos, escolhido, justificativa, texto_bruto_pesquisa: r1.texto.slice(0, 60_000) });

  if (escolhido === null) return { tipo: "sem_pauta", motivo: justificativa.slice(0, 600) };
  const { imagens_base, pauta } = await materialDaPauta(ctx, post, candidatos[escolhido]);
  const atual = await store.atualizarPost(post.id, { pauta, justificativa, tipo_pauta: "noticia", status: "pesquisado", erro: null, imagens_base });
  return { tipo: "ok", post: atual ?? post };
}

// Lê as matérias da pauta escolhida: o TEXTO vira base de fatos para o roteiro e a revisão; as fotos de divulgação
// viram imagens-base de índice 1..k (a capa gerada fica no 0; extras da IA vêm depois).
export async function materialDaPauta(ctx: Ctx, post: Post, pauta: Pauta): Promise<{ imagens_base: ImagemBase[]; pauta: Pauta }> {
  if (!pauta.fontes.length) return { imagens_base: [], pauta };
  const { fotos, trechos } = await materialDasFontes(pauta.fontes, ctx.cfg.imagens.fotos_reais ? ctx.cfg.imagens.max_fotos_reais : 0).catch(() => ({ fotos: [] as FotoFonte[], trechos: [] }));
  const comTrechos: Pauta = { ...pauta, trechos };
  if (trechos.length) await logar(ctx, post, "pesquisa", "info", `Texto de ${trechos.length} matéria(s) lido para o roteiro (${trechos.map((t) => `${t.dominio}: ${t.texto.length} chars`).join(", ")}).`);
  else await logar(ctx, post, "pesquisa", "aviso", "Não consegui ler o texto de nenhuma fonte; o roteiro terá só o resumo da pesquisa.");
  const out: ImagemBase[] = [];
  for (const [i, f] of fotos.entries()) {
    const caminho = `${post.data}/${post.id}/fonte-${i + 1}-${Date.now().toString(36)}.jpg`;
    const { url } = await ctx.blobs.put(caminho, f.jpeg, "image/jpeg");
    out.push({ indice: i + 1, funcao: "fonte", prompt: `Foto da matéria: ${f.pagina}`, storage_path: caminho, url, bytes: f.jpeg.length, modelo: "fonte", credito: creditoDaFoto(f), largura: f.largura, altura: f.altura, origem_url: f.url });
  }
  if (out.length) await logar(ctx, post, "pesquisa", "info", `${out.length} foto(s) de divulgação obtida(s) das fontes (${out.map((o) => `${o.largura}x${o.altura}`).join(", ")}).`);
  return { imagens_base: out, pauta: comTrechos };
}

// Conteúdo atemporal: nunca é apresentado como notícia do dia (o roteiro recebe tipo = "atemporal").
export function pautaAtemporal(hist: ItemHistorico[], dataHoje: string, cfg: Config): Pauta {
  const titulos = hist.map((h) => h.titulo);
  let melhor = TEMAS_ATEMPORAIS[0];
  let menor = 2;
  for (const t of TEMAS_ATEMPORAIS) {
    const s = Math.max(0, ...titulos.map((x) => jaccard(t, x)));
    if (s < menor) {
      menor = s;
      melhor = t;
    }
  }
  void cfg;
  return {
    titulo: melhor,
    o_que_aconteceu: "Tema atemporal da rotina de uma clínica, sem vínculo com um acontecimento específico.",
    data_acontecimento: dataHoje,
    data_publicacao: dataHoje,
    fontes: [],
    evidencias_de_atencao: "Não se aplica (conteúdo atemporal).",
    em_alta_comprovado: false,
    conexao_com_clinica: "Diretamente a rotina da clínica.",
    riscos: "Não apresentar como notícia nem citar datas.",
    desenvolvimento_novo_sobre_tema_recente: false,
    notas: { atualidade: 0, gancho: 5, relevancia: 8, confiabilidade: 8, originalidade: 5 },
    fontes_independentes: 0,
    nota_final: 0,
    descartada_por: null,
  };
}
