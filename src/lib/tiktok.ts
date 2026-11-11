// TikTok Content Posting API (carrossel de fotos) + Login Kit (OAuth web). Escrito contra a documentação de 11/2026:
//   authorize: https://www.tiktok.com/v2/auth/authorize/   token: POST https://open.tiktokapis.com/v2/oauth/token/
//   publicar fotos: POST https://open.tiktokapis.com/v2/post/publish/content/init/ (source PULL_FROM_URL, até 35 JPEG/WebP ≤1080p ≤20MB)
//   status: POST https://open.tiktokapis.com/v2/post/publish/status/fetch/
// Access token dura 2h; refresh token 180 dias e ROTACIONA a cada renovação. Sem auditoria do app, todo post sai privado (SELF_ONLY).
import { cifrar, decifrar } from "./crypto";
import { env, sanitizar } from "./env";
import type { ContaIG } from "./types";
import type { Store } from "./store/tipos";

const API = "https://open.tiktokapis.com/v2";
export const ESCOPOS_TIKTOK = "user.info.basic,video.publish";

export type TokensTikTok = { access: string; refresh: string; access_expira: string; refresh_expira: string; open_id: string };
export type PrivacidadeTikTok = "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";

export class ErroTikTok extends Error {
  constructor(msg: string, public codigo: string | null, public http: number | null) {
    super(sanitizar(msg));
  }
}

export function tiktokConfigurado(): boolean {
  return !!env("TIKTOK_CLIENT_KEY") && !!env("TIKTOK_CLIENT_SECRET");
}

export function urlAutorizacao(redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY", { obrigatoria: true }), response_type: "code", scope: ESCOPOS_TIKTOK, redirect_uri: redirectUri, state });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokensTikTok> {
  const r = await fetch(`${API}/oauth/token/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY", { obrigatoria: true }), client_secret: env("TIKTOK_CLIENT_SECRET", { obrigatoria: true }), ...body }) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || !j.access_token) throw new ErroTikTok(`TikTok token: ${r.status} ${String(j.error_description ?? j.error ?? JSON.stringify(j)).slice(0, 300)}`, String(j.error ?? ""), r.status);
  const agora = Date.now();
  return {
    access: String(j.access_token),
    refresh: String(j.refresh_token),
    access_expira: new Date(agora + Number(j.expires_in ?? 7200) * 1000).toISOString(),
    refresh_expira: new Date(agora + Number(j.refresh_expires_in ?? 15_552_000) * 1000).toISOString(),
    open_id: String(j.open_id ?? ""),
  };
}

export const trocarCodigo = (code: string, redirectUri: string) => tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
export const renovarTokens = (refresh: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });

// Os tokens ficam na mesma tabela ig_conta (chave "tiktok:<conta>"), cifrados num JSON, para não exigir migração.
const chaveDe = (conta: string) => `tiktok:${conta}`;

export async function salvarTokens(store: Store, conta: string, t: TokensTikTok, nome?: string | null): Promise<void> {
  const atual = await store.getConta(chaveDe(conta));
  const c: ContaIG = { chave: chaveDe(conta), ig_user_id: t.open_id || atual?.ig_user_id || null, username: nome ?? atual?.username ?? null, token_cifrado: cifrar(JSON.stringify(t)), token_expira_em: t.refresh_expira, token_renovado_em: new Date().toISOString(), ultimo_erro: null };
  await store.salvarConta(c);
}

export async function contaTikTok(store: Store, conta: string): Promise<{ tokens: TokensTikTok; conta: ContaIG } | null> {
  const c = await store.getConta(chaveDe(conta));
  if (!c?.token_cifrado) return null;
  try {
    return { tokens: JSON.parse(decifrar(c.token_cifrado)) as TokensTikTok, conta: c };
  } catch {
    return null;
  }
}

// Devolve um access token válido (renova quando faltam < 10 min). Lança ErroTikTok se não há conta ou o refresh venceu.
export async function garantirTokenTikTok(store: Store, conta: string): Promise<string> {
  const c = await contaTikTok(store, conta);
  if (!c) throw new ErroTikTok("TikTok não conectado: abra /api/tiktok/conectar logado no painel.", "nao_conectado", null);
  const { tokens } = c;
  if (new Date(tokens.access_expira).getTime() - Date.now() > 10 * 60_000) return tokens.access;
  if (new Date(tokens.refresh_expira).getTime() < Date.now()) throw new ErroTikTok("O acesso ao TikTok venceu (refresh token de 180 dias); reconecte em /api/tiktok/conectar.", "refresh_vencido", null);
  const novos = await renovarTokens(tokens.refresh);
  await salvarTokens(store, conta, { ...novos, open_id: novos.open_id || tokens.open_id });
  return novos.access;
}

async function chamar<T>(token: string, caminho: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${caminho}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string; log_id?: string } };
  const code = j.error?.code ?? (r.ok ? "ok" : String(r.status));
  if (!r.ok || code !== "ok") throw new ErroTikTok(`TikTok ${caminho}: ${code} ${j.error?.message ?? ""} (log ${j.error?.log_id ?? "-"})`, code, r.status);
  return j.data as T;
}

export type CreatorInfo = { creator_username?: string; creator_nickname?: string; privacy_level_options?: PrivacidadeTikTok[]; comment_disabled?: boolean; max_video_post_duration_sec?: number };
export const creatorInfo = (token: string) => chamar<CreatorInfo>(token, "/post/publish/creator_info/query/", {});

export async function publicarFotos(token: string, p: { titulo: string; descricao: string; urls: string[]; capaIndice?: number; privacidade: PrivacidadeTikTok; desabilitarComentarios?: boolean; autoMusica?: boolean }): Promise<{ publish_id: string }> {
  if (!p.urls.length || p.urls.length > 35) throw new ErroTikTok(`TikTok aceita de 1 a 35 fotos (vieram ${p.urls.length}).`, "fotos", null);
  return chamar<{ publish_id: string }>(token, "/post/publish/content/init/", {
    post_info: { title: p.titulo.slice(0, 90), description: p.descricao.slice(0, 4000), privacy_level: p.privacidade, disable_comment: !!p.desabilitarComentarios, auto_add_music: !!p.autoMusica, brand_content_toggle: false, brand_organic_toggle: false },
    source_info: { source: "PULL_FROM_URL", photo_cover_index: p.capaIndice ?? 0, photo_images: p.urls },
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
  });
}

export type StatusTikTok = { status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED"; fail_reason?: string; publicaly_available_post_id?: number[]; downloaded_bytes?: number };
export const statusPublicacao = (token: string, publishId: string) => chamar<StatusTikTok>(token, "/post/publish/status/fetch/", { publish_id: publishId });

// O TikTok só puxa foto de domínio/prefixo verificado no portal; os slides moram no Supabase, então saem pelo nosso domínio.
export function urlDaMidiaNoNossoDominio(storagePath: string): string {
  const base = env("APP_URL") || "https://carrossel-julio.vercel.app";
  return `${base.replace(/\/$/, "")}/api/midia/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}
