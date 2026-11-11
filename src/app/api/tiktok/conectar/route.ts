// Inicia a conexão com o TikTok (Login Kit). Só logado no painel. O estado anti-CSRF vai num cookie assinado.
import { randomBytes } from "node:crypto";
import { exigirApi } from "@/lib/auth";
import { env } from "@/lib/env";
import { tiktokConfigurado, urlAutorizacao } from "@/lib/tiktok";

export async function GET(req: Request) {
  const negado = await exigirApi();
  if (negado) return negado;
  if (!tiktokConfigurado()) return Response.json({ ok: false, mensagem: "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET não configurados na Vercel." }, { status: 503 });
  const base = (env("APP_URL") || new URL(req.url).origin).replace(/\/$/, "");
  const redirect = `${base}/api/tiktok/callback`;
  const state = randomBytes(16).toString("hex");
  return new Response(null, {
    status: 303,
    headers: { Location: urlAutorizacao(redirect, state), "Set-Cookie": `tt_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900` },
  });
}
