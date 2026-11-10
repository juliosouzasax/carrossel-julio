import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessaoValida } from "./crypto";

export const COOKIE = "painel_sessao";

export async function autenticado(): Promise<boolean> {
  try {
    return sessaoValida((await cookies()).get(COOKIE)?.value);
  } catch {
    return false;
  }
}

// Páginas: sem sessão, manda para o login.
export async function exigirPagina(): Promise<void> {
  if (!(await autenticado())) redirect("/login");
}

// Rotas de API do painel: sem sessão, 401.
export async function exigirApi(): Promise<Response | null> {
  return (await autenticado()) ? null : Response.json({ ok: false, mensagem: "Não autenticado." }, { status: 401 });
}
