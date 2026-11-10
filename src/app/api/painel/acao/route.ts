import { exigirApi } from "@/lib/auth";
import { env } from "@/lib/env";
import { executarAcao, type Acao } from "@/lib/pipeline/orquestrador";
import { getBlobs, getStore } from "@/lib/store";

export const maxDuration = 300;

export async function POST(req: Request) {
  const negado = await exigirApi();
  if (negado) return negado;
  const { postId, acao } = (await req.json()) as { postId: string; acao: Acao };
  if (!postId || !acao?.tipo) return Response.json({ ok: false, mensagem: "Pedido inválido." }, { status: 400 });
  try {
    const r = await executarAcao(getStore(), getBlobs(), env("IG_CONTA") || "juliosouza_costa", postId, acao);
    return Response.json({ ok: r.ok, mensagem: r.mensagem });
  } catch (e) {
    return Response.json({ ok: false, mensagem: (e as Error).message }, { status: 500 });
  }
}
