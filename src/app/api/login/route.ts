import { COOKIE } from "@/lib/auth";
import { assinarSessao, igualSeguro } from "@/lib/crypto";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const form = await req.formData();
  const senha = String(form.get("senha") ?? "");
  const esperada = env("PANEL_PASSWORD");
  if (!esperada || !igualSeguro(senha, esperada)) {
    await new Promise((r) => setTimeout(r, 800)); // freia tentativa em série
    return Response.redirect(new URL("/login?erro=1", req.url), 303);
  }
  const cookie = `${COOKIE}=${assinarSessao()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  return new Response(null, { status: 303, headers: { Location: new URL("/", req.url).toString(), "Set-Cookie": cookie } });
}
