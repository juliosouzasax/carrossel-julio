// Volta do TikTok com ?code&state. Troca o código por tokens e grava cifrado. Não exige o cookie de sessão do painel
// (o TikTok redireciona o navegador do Julio, que já estava logado), mas exige o state do cookie tt_state.
import { env } from "@/lib/env";
import { getStore } from "@/lib/store";
import { creatorInfo, salvarTokens, trocarCodigo } from "@/lib/tiktok";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const erro = u.searchParams.get("error");
  const cookie = req.headers.get("cookie") ?? "";
  const esperado = /(?:^|;\s*)tt_state=([a-f0-9]{32})/.exec(cookie)?.[1];
  if (erro) return Response.json({ ok: false, mensagem: `TikTok recusou: ${erro} ${u.searchParams.get("error_description") ?? ""}` }, { status: 400 });
  if (!code || !state || !esperado || state !== esperado) return Response.json({ ok: false, mensagem: "Estado inválido ou expirado; comece de novo em /api/tiktok/conectar." }, { status: 400 });
  const base = (env("APP_URL") || u.origin).replace(/\/$/, "");
  try {
    const tokens = await trocarCodigo(code, `${base}/api/tiktok/callback`);
    const conta = env("IG_CONTA") || "juliosouza_costa";
    let nome: string | null = null;
    try {
      const ci = await creatorInfo(tokens.access);
      nome = ci.creator_username ?? ci.creator_nickname ?? null;
    } catch {
      /* só informativo */
    }
    await salvarTokens(getStore(), conta, tokens, nome);
    return new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px"><h2>TikTok conectado${nome ? ` (@${nome})` : ""}.</h2><p>Pode fechar esta aba. <a href="/config">Voltar ao painel</a></p>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": "tt_state=; Path=/; Max-Age=0" } });
  } catch (e) {
    return Response.json({ ok: false, mensagem: (e as Error).message }, { status: 502 });
  }
}
