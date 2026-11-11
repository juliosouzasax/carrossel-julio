// Serve um arquivo do bucket público de slides pelo NOSSO domínio (sem redirect), para o TikTok poder puxar as fotos
// de um prefixo de URL verificado no portal deles. Só caminhos do bucket "carrosseis"; nada mais é exposto.
import { SupabaseBlobs } from "@/lib/store/supabase";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ caminho: string[] }> }) {
  const { caminho } = await ctx.params;
  const rel = caminho.map(decodeURIComponent).join("/");
  if (!rel || rel.includes("..") || !/\.(jpe?g|png|webp)$/i.test(rel)) return new Response("Não encontrado", { status: 404 });
  const buf = await new SupabaseBlobs().get(rel);
  if (!buf) return new Response("Não encontrado", { status: 404 });
  const tipo = /\.png$/i.test(rel) ? "image/png" : /\.webp$/i.test(rel) ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=86400, immutable", "Content-Length": String(buf.length) } });
}
