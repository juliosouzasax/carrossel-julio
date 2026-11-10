// Pesquisa do post das 18h: em vez da web, a base é o que está ENGAJANDO nos perfis de referência
// (annysoouto, fabioavelarmkt, rinovack, ilaflavia). Os posts deles são coletados pelo Chrome do Julio
// (scripts/referencias-ig.ts) e ficam em referencias_ig; aqui o modelo lê os mais fortes e escolhe UM tema.
import { garantirOrcamento, registrarTexto } from "../custo";
import { responderJson } from "../openai";
import { promptReferencias } from "../../prompts";
import { SCHEMA_REFERENCIAS } from "../../prompts/schemas";
import type { Pauta, Post, ReferenciaIG } from "../types";
import { historico, logar, type Ctx } from "./contexto";
import { rankear, justificativaDaEscolha, type ResultadoPesquisa } from "./pesquisa";

export type ReferenciaPontuada = ReferenciaIG & { forca: number };

// Força do post dentro do PRÓPRIO perfil: views em relação à mediana do perfil (um reel de 300 mil num perfil
// que faz 5 mil vale mais do que 300 mil num perfil que faz 3 milhões). Comentários pesam por cima.
export function pontuarReferencias(rows: ReferenciaIG[]): ReferenciaPontuada[] {
  const porPerfil = new Map<string, number[]>();
  for (const r of rows) if (r.views) porPerfil.set(r.username, [...(porPerfil.get(r.username) ?? []), r.views]);
  const mediana = new Map<string, number>();
  for (const [u, vs] of porPerfil) {
    const s = [...vs].sort((a, b) => a - b);
    mediana.set(u, s[Math.floor(s.length / 2)] || 1);
  }
  return rows
    .map((r) => {
      const base = r.views ? Math.log10(Math.max(1, r.views / (mediana.get(r.username) ?? 1))) : 0;
      const engaj = (r.comentarios ?? 0) * 0.02 + (r.likes ?? 0) * 0.001;
      return { ...r, forca: Number((base + Math.min(1.5, Math.log10(1 + engaj))).toFixed(3)) };
    })
    .sort((a, b) => b.forca - a.forca);
}

type BrutoReferencia = {
  titulo: string;
  o_que_aconteceu: string;
  evidencias_de_atencao: string;
  conexao_com_clinica: string;
  riscos: string;
  codigos: string[]; // posts de referência que sustentam o tema (username/codigo)
  notas: Pauta["notas"];
};

export async function executarPesquisaReferencias(ctx: Ctx, post: Post): Promise<ResultadoPesquisa> {
  const { store, cfg } = ctx;
  const desde = new Date(Date.now() - cfg.tarde.dias_de_coleta * 86400_000).toISOString();
  const rows = await store.listarReferencias({ desdeColetaISO: desde, usernames: cfg.tarde.perfis });
  if (!rows.length) {
    await logar(ctx, post, "pesquisa", "aviso", "Nenhuma referência coletada dos perfis (referencias_ig vazia no período).");
    return { tipo: "sem_pauta", motivo: "não há posts de referência coletados; rode scripts/referencias-ig.ts" };
  }
  const pontuadas = pontuarReferencias(rows);
  const comLegenda = pontuadas.filter((r) => (r.legenda ?? "").trim().length >= 20).slice(0, 40);
  if (!comLegenda.length) return { tipo: "sem_pauta", motivo: "as referências coletadas não têm legenda legível" };

  await garantirOrcamento(store, cfg);
  const hist = await historico(ctx, post.id);
  const p = promptReferencias({ cfg, dataHoje: ctx.agora.data, referencias: comLegenda, historico: hist });
  const { dados, resposta } = await responderJson<{ candidatos: BrutoReferencia[] }>({ modelo: cfg.modelos.roteiro, instrucoes: p.instrucoes, entrada: p.entrada, schema: SCHEMA_REFERENCIAS, raciocinio: cfg.raciocinio.pesquisa, timeoutMs: 180_000 });
  await registrarTexto(store, cfg, post.id, "pesquisa_referencias", cfg.modelos.roteiro, resposta, p.versao);

  const porChave = new Map<string, ReferenciaPontuada>(comLegenda.map((r) => [`${r.username}/${r.codigo}`, r]));
  const cands: Pauta[] = (dados.candidatos ?? []).slice(0, 5).map((c) => {
    const refs = c.codigos.map((k) => porChave.get(k)).filter((r): r is ReferenciaPontuada => !!r);
    return {
      titulo: c.titulo,
      o_que_aconteceu: c.o_que_aconteceu,
      data_acontecimento: ctx.agora.data,
      data_publicacao: ctx.agora.data,
      fontes: refs.map((r) => ({ titulo: `@${r.username} · ${r.tipo} · ${fmt(r.views)} views · ${fmt(r.likes)} curtidas · ${fmt(r.comentarios)} comentários`, url: r.url, dominio: "instagram.com", publicado_em: r.data_post, verificada: "ok" as const })),
      evidencias_de_atencao: c.evidencias_de_atencao,
      em_alta_comprovado: refs.length > 0,
      conexao_com_clinica: c.conexao_com_clinica,
      riscos: c.riscos,
      desenvolvimento_novo_sobre_tema_recente: false,
      notas: c.notas,
      trechos: refs.map((r) => ({ url: r.url, dominio: `@${r.username}`, texto: `[${fmt(r.views)} views, ${fmt(r.likes)} curtidas, ${fmt(r.comentarios)} comentários, ${r.data_post ?? "data não lida"}] ${r.legenda ?? ""}` })),
    };
  });
  // Referência não exige duas fontes independentes (todas são instagram.com); só repetição e nota mínima valem.
  const { candidatos, escolhido } = rankear(cands, { historico: hist, cfg: { ...cfg, conteudo: { ...cfg.conteudo, exigir_duas_fontes: false } } });
  const justificativa = escolhido !== null ? justificativaDaEscolha(candidatos[escolhido], candidatos) : `Nenhum tema passou. ${candidatos.map((c) => `"${c.titulo}": ${c.descartada_por ?? "ok"}`).join(" | ")}`;
  await store.salvarCandidatos({ post_id: post.id, data: post.data, candidatos, escolhido, justificativa, texto_bruto_pesquisa: resposta.texto.slice(0, 60_000) });
  if (escolhido === null) return { tipo: "sem_pauta", motivo: justificativa.slice(0, 600) };
  const pauta = candidatos[escolhido];
  await logar(ctx, post, "pesquisa", "info", `Tema das 18h escolhido a partir de ${pauta.fontes.length} post(s) de referência: "${pauta.titulo}".`);
  const atual = await store.atualizarPost(post.id, { pauta, justificativa, tipo_pauta: "referencia", status: "pesquisado", erro: null, imagens_base: [] });
  return { tipo: "ok", post: atual ?? post };
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "?";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(".", ",")} mil`;
  return String(n);
}
