import { garantirOrcamento, registrarTexto } from "../custo";
import { responderJson } from "../openai";
import { capasRecentes, promptRoteiro } from "../../prompts";
import { SCHEMA_ROTEIRO } from "../../prompts/schemas";
import type { Pauta, Post, Roteiro } from "../types";
import { historico, logar, type Ctx } from "./contexto";
import { normalizarRoteiro, validarRoteiro } from "./validacao";
import { fotosReais } from "./imagens";

function semente(data: string): string {
  // Varia a estrutura de um dia para o outro de forma determinística (e explicável no painel).
  const formas = ["abrir com um dado e fechar com checklist", "abrir com uma pergunta e usar comparativo", "abrir com uma cena e usar lista de passos", "abrir com uma tese forte e usar frase em destaque", "abrir pelo erro comum e fechar com ação do dia seguinte"];
  const n = [...data].reduce((a, c) => a + c.charCodeAt(0), 0);
  return formas[n % formas.length];
}

// Gera (ou corrige) o roteiro. Se a validação em código reprovar, tenta UMA correção automática antes de seguir;
// o que sobrar de problema vai para a revisão, que decide.
export async function executarRoteiro(ctx: Ctx, post: Post, correcoes?: string[]): Promise<Post> {
  const { store, cfg } = ctx;
  if (!post.pauta) throw new Error("Post sem pauta: a pesquisa precisa rodar antes do roteiro.");
  const pauta: Pauta = post.pauta;
  const hist = await historico(ctx, post.id);
  let problemas = correcoes ?? [];
  let anterior: Roteiro | null = correcoes ? post.roteiro : null;
  let roteiro: Roteiro | null = null;

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    await garantirOrcamento(store, cfg);
    const reais = fotosReais(post).map((f) => ({ indice: f.indice, descricao: `${f.largura ?? "?"}x${f.altura ?? "?"}, ${f.credito ?? "fonte"}${f.origem_url ? ` — ${f.origem_url}` : ""}` }));
    const p = promptRoteiro({ cfg, dataHoje: ctx.agora.data, pauta, tipo: post.tipo_pauta, historico: hist, semente: semente(post.data), correcoes: problemas.length ? problemas : undefined, roteiroAnterior: anterior, fotosReais: reais });
    const { dados, resposta } = await responderJson<Roteiro>({ modelo: cfg.modelos.roteiro, instrucoes: p.instrucoes, entrada: p.entrada, schema: SCHEMA_ROTEIRO, raciocinio: cfg.raciocinio.roteiro, timeoutMs: 230_000 });
    await registrarTexto(store, cfg, post.id, tentativa === 0 && !correcoes ? "roteiro" : "roteiro_correcao", cfg.modelos.roteiro, resposta, p.versao);
    roteiro = normalizarRoteiro({ ...dados, prompt_version: p.versao, fonte_resumo_para_legenda: "" });
    // Capa com foto real pequena fica borrada (1080x1350 a partir de 1200x675): volta para a capa gerada.
    const capa = roteiro.slides[0];
    const fotoDaCapa = capa ? fotosReais(post).find((f) => f.indice === capa.imagem_idx) : undefined;
    if (fotoDaCapa && Math.min(fotoDaCapa.largura ?? 0, fotoDaCapa.altura ?? 0) < 1000) {
      roteiro = { ...roteiro, slides: roteiro.slides.map((s, i) => (i === 0 ? { ...s, imagem_idx: 0 } : s)) };
      await logar(ctx, post, "roteiro", "info", `Capa voltou para imagem gerada: a foto real ${fotoDaCapa.indice} tem só ${fotoDaCapa.largura}x${fotoDaCapa.altura}.`);
    }
    const falhas = validarRoteiro(roteiro, { tipo: post.tipo_pauta, cfg, pauta, fotosReais: reais.length, capasAnteriores: capasRecentes(hist) });
    if (!falhas.length) break;
    await logar(ctx, post, "roteiro", "aviso", `Validação em código encontrou ${falhas.length} problema(s); corrigindo.`, falhas);
    problemas = falhas;
    anterior = roteiro;
  }
  if (!roteiro) throw new Error("Roteiro não foi gerado.");

  const atual = await store.atualizarPost(post.id, {
    roteiro,
    slides: roteiro.slides,
    legenda: roteiro.legenda,
    status: "roteirizado",
    // Correção de texto reaproveita as imagens já geradas; roteiro novo mantém só as fotos reais das fontes.
    imagens_base: correcoes ? post.imagens_base : fotosReais(post),
    erro: null,
  });
  return atual ?? post;
}
