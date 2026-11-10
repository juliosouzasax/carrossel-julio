import { exigirApi } from "@/lib/auth";
import { getStore } from "@/lib/store";

export async function GET() {
  const negado = await exigirApi();
  if (negado) return negado;
  return Response.json(await getStore().getConfig());
}

export async function POST(req: Request) {
  const negado = await exigirApi();
  if (negado) return negado;
  try {
    const cfg = await getStore().saveConfig(await req.json());
    return Response.json({ ok: true, config: cfg });
  } catch (e) {
    return Response.json({ ok: false, mensagem: `Configuração inválida: ${(e as Error).message}` }, { status: 400 });
  }
}
