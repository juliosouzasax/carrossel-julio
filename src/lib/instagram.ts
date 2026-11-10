import { cifrar, decifrar } from "./crypto";
import { env, graphVersion, sanitizar } from "./env";
import type { Ctx } from "./pipeline/contexto";
import type { ContaIG } from "./types";

// Instagram API com Login do Instagram (host graph.instagram.com).
// Permissões necessárias no token: instagram_business_basic e instagram_business_content_publish.
const HOST = "https://graph.instagram.com";

export class ErroInstagram extends Error {
  constructor(mensagem: string, public code: number | null, public subcode: number | null, public http: number | null, public retentavel: boolean) {
    super(mensagem);
    this.name = "ErroInstagram";
  }
}

// Erros que normalmente passam sozinhos (rede, servidor, limite de taxa, mídia ainda sendo baixada/processada).
const SUBCODES_RETENTAVEIS = new Set([2207001, 2207003, 2207008, 2207027, 2207032]);
const CODES_RETENTAVEIS = new Set([1, 2, 4, 17, 32, 613]);

export function classificarErro(http: number | null, code: number | null, subcode: number | null): boolean {
  if (code === 190) return false; // token inválido/expirado
  if (subcode !== null && [2207042, 2207004, 2207005, 2207009, 2207010, 2207050, 2207051, 2207040].includes(subcode)) return false; // limite diário, formato, proporção, legenda, conta restrita
  if (subcode !== null && SUBCODES_RETENTAVEIS.has(subcode)) return true;
  if (code !== null && CODES_RETENTAVEIS.has(code)) return true;
  return http === null || http >= 500;
}

async function req(token: string, metodo: "GET" | "POST", caminho: string, params: Record<string, string | undefined> = {}, timeoutMs = 60_000): Promise<any> {
  const url = new URL(`${HOST}/${graphVersion()}/${caminho.replace(/^\//, "")}`);
  const corpo = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) (metodo === "GET" ? url.searchParams : corpo).set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(metodo === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: metodo === "POST" ? corpo : undefined,
      signal: ctrl.signal,
    });
    const txt = await r.text();
    let j: any = null;
    try {
      j = JSON.parse(txt);
    } catch {
      /* não-JSON */
    }
    if (!r.ok || j?.error) {
      const e = j?.error ?? {};
      const code = typeof e.code === "number" ? e.code : null;
      const sub = typeof e.error_subcode === "number" ? e.error_subcode : null;
      throw new ErroInstagram(`Instagram: ${sanitizar(String(e.error_user_msg ?? e.message ?? txt.slice(0, 200)))} (http ${r.status}, code ${code}, subcode ${sub})`, code, sub, r.status, classificarErro(r.status, code, sub));
    }
    return j;
  } catch (e) {
    if (e instanceof ErroInstagram) throw e;
    // Timeout/queda de rede: o resultado é DESCONHECIDO (a Meta pode ter processado). Quem chama precisa conferir antes de repetir.
    throw new ErroInstagram(`Instagram: ${(e as Error).name === "AbortError" ? "tempo esgotado" : sanitizar((e as Error).message)}`, null, null, null, true);
  } finally {
    clearTimeout(timer);
  }
}

export type StatusContainer = { codigo: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED"; detalhe?: string };
export type MidiaRecente = { id: string; caption: string | null; permalink: string | null; timestamp: string };

export interface ClienteIG {
  limite(): Promise<{ usado: number; total: number }>;
  criarItem(imageUrl: string, altText?: string): Promise<string>;
  statusContainer(id: string): Promise<StatusContainer>;
  criarCarrossel(ids: string[], legenda: string): Promise<string>;
  publicar(containerId: string): Promise<string>;
  detalhe(mediaId: string): Promise<{ permalink: string | null; timestamp: string | null }>;
  recentes(): Promise<MidiaRecente[]>;
}

export function clienteInstagram(token: string, igId: string): ClienteIG {
  return {
    async limite() {
      const j = await req(token, "GET", `${igId}/content_publishing_limit`, { fields: "quota_usage,config" });
      const d = j?.data?.[0] ?? j;
      return { usado: Number(d?.quota_usage ?? 0), total: Number(d?.config?.quota_total ?? 50) };
    },
    async criarItem(imageUrl, altText) {
      const j = await req(token, "POST", `${igId}/media`, { image_url: imageUrl, is_carousel_item: "true", alt_text: altText?.slice(0, 1000) });
      return String(j.id);
    },
    async statusContainer(id) {
      const j = await req(token, "GET", id, { fields: "status_code,status" });
      return { codigo: j.status_code, detalhe: j.status };
    },
    async criarCarrossel(ids, legenda) {
      const j = await req(token, "POST", `${igId}/media`, { media_type: "CAROUSEL", children: ids.join(","), caption: legenda });
      return String(j.id);
    },
    async publicar(containerId) {
      const j = await req(token, "POST", `${igId}/media_publish`, { creation_id: containerId }, 90_000);
      return String(j.id);
    },
    async detalhe(mediaId) {
      const j = await req(token, "GET", mediaId, { fields: "permalink,timestamp" });
      return { permalink: j.permalink ?? null, timestamp: j.timestamp ?? null };
    },
    async recentes() {
      const j = await req(token, "GET", `${igId}/media`, { fields: "id,caption,permalink,timestamp", limit: "12" });
      return (j?.data ?? []) as MidiaRecente[];
    },
  };
}

// ----------------------------------------------------------------- token e conta
export async function perfil(token: string): Promise<{ igId: string; username: string; tipo: string | null }> {
  const j = await req(token, "GET", "me", { fields: "user_id,username,account_type" });
  return { igId: String(j.user_id ?? j.id), username: String(j.username ?? ""), tipo: j.account_type ?? null };
}

export async function renovarToken(token: string): Promise<{ token: string; expiraEm: Date }> {
  // Endpoint de renovação do token de longa duração (precisa ter 24h+ e ainda estar válido).
  const url = new URL(`${HOST}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token); // forma já validada em produção no CRM (lib/instagramLogin.ts)
  const r = await fetch(url);
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new ErroInstagram(`Instagram: não consegui renovar o token (${sanitizar(String(j?.error?.message ?? r.status))})`, j?.error?.code ?? null, null, r.status, false);
  return { token: String(j.access_token), expiraEm: new Date(Date.now() + Number(j.expires_in ?? 5_184_000) * 1000) };
}

const DIA = 86_400_000;

// Devolve o token em uso. Na primeira vez, semeia a partir de IG_ACCESS_TOKEN (cifrando no banco).
// Renova sozinho quando faltam menos de 20 dias (o token dura 60).
export async function garantirConta(ctx: Ctx): Promise<{ token: string; igId: string; conta: ContaIG }> {
  let conta = await ctx.store.getConta(ctx.conta);
  if (!conta?.token_cifrado) {
    const semente = env("IG_ACCESS_TOKEN");
    if (!semente) throw new ErroInstagram("Instagram não conectado: configure IG_ACCESS_TOKEN (veja o README).", null, null, null, false);
    const p = await perfil(semente);
    conta = { chave: ctx.conta, ig_user_id: p.igId, username: p.username, token_cifrado: cifrar(semente), token_expira_em: new Date(Date.now() + 60 * DIA).toISOString(), token_renovado_em: new Date().toISOString(), ultimo_erro: null };
    await ctx.store.salvarConta(conta);
  }
  let token = decifrar(conta.token_cifrado!);
  const expira = conta.token_expira_em ? new Date(conta.token_expira_em).getTime() : 0;
  const renovadoEm = conta.token_renovado_em ? new Date(conta.token_renovado_em).getTime() : 0;
  if (expira - Date.now() < 20 * DIA && Date.now() - renovadoEm > DIA) {
    try {
      const n = await renovarToken(token);
      token = n.token;
      conta = { ...conta, token_cifrado: cifrar(n.token), token_expira_em: n.expiraEm.toISOString(), token_renovado_em: new Date().toISOString(), ultimo_erro: null };
      await ctx.store.salvarConta(conta);
    } catch (e) {
      conta = { ...conta, ultimo_erro: (e as Error).message };
      await ctx.store.salvarConta(conta);
      if (expira < Date.now()) throw e;
    }
  }
  if (!conta.ig_user_id) {
    const p = await perfil(token);
    conta = { ...conta, ig_user_id: p.igId, username: p.username };
    await ctx.store.salvarConta(conta);
  }
  return { token, igId: conta.ig_user_id!, conta };
}

// Confere se a URL da imagem é pública e devolve JPEG (a Meta baixa por URL).
export async function imagemPublicaOk(url: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!/^https:\/\//i.test(url)) return { ok: false, motivo: "URL não é https pública" };
  if (/[^\x20-\x7E]/.test(url)) return { ok: false, motivo: "URL com caracteres fora do ASCII" };
  try {
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1023" } });
    if (!(r.status === 200 || r.status === 206)) return { ok: false, motivo: `HTTP ${r.status}` };
    const tipo = r.headers.get("content-type") ?? "";
    if (!/image\/jpe?g/i.test(tipo)) return { ok: false, motivo: `tipo ${tipo || "desconhecido"} (a Meta só aceita JPEG)` };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: sanitizar((e as Error).message) };
  }
}
