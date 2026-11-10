import { exigirApi } from "@/lib/auth";
import { env } from "@/lib/env";
import { criarPostEspecial } from "@/lib/pipeline/orquestrador";
import { getStore } from "@/lib/store";

export async function POST(req: Request) {
  const negado = await exigirApi();
  if (negado) return negado;
  const { tipo } = (await req.json()) as { tipo: "teste" | "reserva" };
  if (tipo !== "teste" && tipo !== "reserva") return Response.json({ ok: false, mensagem: "Tipo inválido." }, { status: 400 });
  const post = await criarPostEspecial(getStore(), env("IG_CONTA") || "juliosouza_costa", tipo);
  return Response.json({ ok: true, id: post.id, mensagem: tipo === "teste" ? "Teste criado: o próximo ciclo (até 1 min) executa tudo sem publicar." : "Reserva criada: será preparada e revisada nos próximos ciclos." });
}
