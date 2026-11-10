import { env } from "@/lib/env";
import { igualSeguro } from "@/lib/crypto";
import { tick } from "@/lib/pipeline/orquestrador";
import { getBlobs, getStore } from "@/lib/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// A Vercel chama esta rota a cada minuto com "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  const segredo = env("CRON_SECRET");
  const enviado = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!segredo || !enviado || !igualSeguro(enviado, segredo)) return Response.json({ ok: false, mensagem: "Não autorizado." }, { status: 401 });
  try {
    const r = await tick(getStore(), getBlobs(), env("IG_CONTA") || "juliosouza_costa");
    return Response.json(r);
  } catch (e) {
    return Response.json({ ok: false, mensagem: (e as Error).message }, { status: 500 });
  }
}
