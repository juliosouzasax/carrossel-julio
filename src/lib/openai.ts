import { env, envObrigatoria, sanitizar } from "./env";
import type { Config } from "./config";

// Cliente enxuto da OpenAI (fetch direto, sem SDK) para a Responses API e a API de imagens.
// Os nomes de modelo vêm da configuração; nada é fixo aqui.

export type UsoApi = { tokens_entrada: number; tokens_saida: number; tokens_cache: number };

export type RespostaTexto = {
  texto: string;
  citacoes: { url: string; titulo: string }[]; // url_citation das anotações
  fontes_consultadas: string[]; // web_search_call.action.sources (quando disponível)
  buscas: number;
  uso: UsoApi;
  id: string | null;
};

export class ErroOpenAI extends Error {
  constructor(mensagem: string, public status: number | null, public retentavel: boolean) {
    super(mensagem);
  }
}

function base(): string {
  return (env("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chamar(caminho: string, corpo: unknown, timeoutMs: number, tentativas = 3): Promise<any> {
  let ultimo: ErroOpenAI | null = null;
  for (let i = 0; i < tentativas; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(`${base()}${caminho}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${envObrigatoria("OPENAI_API_KEY")}` },
        body: JSON.stringify(corpo),
        signal: ctrl.signal,
      });
      const txt = await r.text();
      let json: any = null;
      try {
        json = JSON.parse(txt);
      } catch {
        /* resposta não-JSON */
      }
      if (r.ok) return json;
      const msg = sanitizar(json?.error?.message ?? txt.slice(0, 300));
      const retentavel = r.status === 429 || r.status >= 500;
      ultimo = new ErroOpenAI(`OpenAI ${r.status}: ${msg}`, r.status, retentavel);
      if (!retentavel) throw ultimo;
    } catch (e) {
      if (e instanceof ErroOpenAI && !e.retentavel) throw e;
      if (!(e instanceof ErroOpenAI)) ultimo = new ErroOpenAI(`OpenAI: ${(e as Error).name === "AbortError" ? "tempo esgotado" : sanitizar((e as Error).message)}`, null, true);
    } finally {
      clearTimeout(timer);
    }
    if (i < tentativas - 1) await dormir(1500 * 2 ** i + Math.floor(Math.random() * 400)); // espera progressiva
  }
  throw ultimo ?? new ErroOpenAI("OpenAI: falha desconhecida", null, true);
}

export type ParamsTexto = {
  modelo: string;
  instrucoes: string;
  entrada: string | unknown[]; // texto ou lista de itens (com input_image)
  busca?: { contexto: "low" | "medium" | "high"; pais: string } | null;
  schema?: { nome: string; schema: object } | null; // saída estruturada estrita
  raciocinio?: string; // vazio = não envia
  maxSaida?: number;
  timeoutMs?: number;
};

export async function responder(p: ParamsTexto): Promise<RespostaTexto> {
  const corpo: Record<string, unknown> = {
    model: p.modelo,
    instructions: p.instrucoes,
    input: typeof p.entrada === "string" ? p.entrada : p.entrada,
    store: false,
  };
  if (p.maxSaida) corpo.max_output_tokens = p.maxSaida;
  if (p.raciocinio) corpo.reasoning = { effort: p.raciocinio };
  if (p.busca) {
    corpo.tools = [
      {
        type: "web_search",
        search_context_size: p.busca.contexto,
        user_location: { type: "approximate", country: p.busca.pais, timezone: "America/Sao_Paulo" },
      },
    ];
    corpo.include = ["web_search_call.action.sources"];
  }
  // A documentação não descreve web_search combinado com saída estruturada; por isso as duas coisas
  // nunca vão na mesma chamada neste projeto (a pesquisa é uma chamada, a estruturação é outra).
  if (p.schema) corpo.text = { format: { type: "json_schema", name: p.schema.nome, strict: true, schema: p.schema.schema } };

  const j = await chamar("/responses", corpo, p.timeoutMs ?? 230_000);
  if (j?.status === "failed" || j?.error) throw new ErroOpenAI(`OpenAI: ${sanitizar(j?.error?.message ?? "resposta com falha")}`, null, false);

  let texto = "";
  const citacoes: { url: string; titulo: string }[] = [];
  const consultadas: string[] = [];
  let buscas = 0;
  for (const item of j?.output ?? []) {
    if (item.type === "web_search_call") {
      buscas++;
      for (const s of item.action?.sources ?? []) if (s?.url) consultadas.push(String(s.url));
    }
    if (item.type === "message") {
      for (const c of item.content ?? []) {
        if (c.type === "output_text") {
          texto += c.text ?? "";
          for (const a of c.annotations ?? []) if (a.type === "url_citation" && a.url) citacoes.push({ url: String(a.url), titulo: String(a.title ?? "") });
        }
        if (c.type === "refusal") throw new ErroOpenAI(`OpenAI recusou a solicitação: ${sanitizar(String(c.refusal ?? ""))}`, null, false);
      }
    }
  }
  if (j?.status === "incomplete" && !texto) throw new ErroOpenAI(`OpenAI: resposta incompleta (${j?.incomplete_details?.reason ?? "motivo desconhecido"})`, null, true);
  const u = j?.usage ?? {};
  return {
    texto: texto.trim(),
    citacoes,
    fontes_consultadas: consultadas,
    buscas,
    uso: {
      tokens_entrada: Number(u.input_tokens ?? 0),
      tokens_saida: Number(u.output_tokens ?? 0),
      tokens_cache: Number(u.input_tokens_details?.cached_tokens ?? 0),
    },
    id: j?.id ?? null,
  };
}

// Resposta estruturada: o texto devolvido é JSON que respeita o schema.
export async function responderJson<T>(p: ParamsTexto & { schema: { nome: string; schema: object } }): Promise<{ dados: T; resposta: RespostaTexto }> {
  const resposta = await responder(p);
  try {
    return { dados: JSON.parse(resposta.texto) as T, resposta };
  } catch {
    throw new ErroOpenAI("OpenAI devolveu um JSON inválido para a etapa estruturada.", null, true);
  }
}

export type ImagemGerada = { dados: Buffer; tipo: "png" | "jpeg"; tokens_texto: number; tokens_imagem_entrada: number; tokens_saida: number; usouUso: boolean };

export async function gerarImagem(p: { modelo: string; prompt: string; tamanho: string; qualidade: string }): Promise<ImagemGerada> {
  const j = await chamar(
    "/images/generations",
    { model: p.modelo, prompt: p.prompt, size: p.tamanho, quality: p.qualidade, n: 1, output_format: "jpeg", output_compression: 92 },
    200_000,
    2,
  );
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new ErroOpenAI("A API de imagens não devolveu a imagem (sem b64_json).", null, false);
  const u = j?.usage ?? {};
  const usouUso = typeof u.output_tokens === "number";
  return {
    dados: Buffer.from(b64, "base64"),
    tipo: "jpeg",
    tokens_texto: Number(u.input_tokens_details?.text_tokens ?? 0),
    tokens_imagem_entrada: Number(u.input_tokens_details?.image_tokens ?? 0),
    tokens_saida: Number(u.output_tokens ?? 0),
    usouUso,
  };
}

export function custoTexto(cfg: Config, modelo: string, uso: UsoApi, buscas: number): number {
  const p = cfg.precos.modelos[modelo] ?? cfg.precos.modelo_desconhecido;
  const naoCache = Math.max(0, uso.tokens_entrada - uso.tokens_cache);
  const c = (naoCache * p.entrada + uso.tokens_cache * p.cache + uso.tokens_saida * p.saida) / 1_000_000;
  return c + (buscas * cfg.precos.busca_web_por_mil) / 1000;
}

export function custoImagem(cfg: Config, img: ImagemGerada, qualidade: string): number {
  if (img.usouUso) {
    return (img.tokens_texto * cfg.precos.imagem_entrada_texto + img.tokens_imagem_entrada * cfg.precos.imagem_entrada_imagem + img.tokens_saida * cfg.precos.imagem_saida) / 1_000_000;
  }
  return cfg.precos.imagem_fallback_usd[qualidade] ?? cfg.precos.imagem_fallback_usd.high ?? 0.2;
}

// Lista os modelos que a chave enxerga (usado em scripts/check-modelos.ts).
export async function listarModelos(): Promise<string[]> {
  const r = await fetch(`${base()}/models`, { headers: { Authorization: `Bearer ${envObrigatoria("OPENAI_API_KEY")}` } });
  if (!r.ok) throw new ErroOpenAI(`OpenAI ${r.status} ao listar modelos`, r.status, false);
  const j = (await r.json()) as { data?: { id: string }[] };
  return (j.data ?? []).map((m) => m.id).sort();
}
