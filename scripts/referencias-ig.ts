// Importa para referencias_ig um JSON coletado pelo Chrome (dados/referencias-ig-AAAA-MM-DD.json).
//   npx tsx --env-file=.env.local scripts/referencias-ig.ts dados/referencias-ig-2026-11-10.json
// Formato: { coletado_em, posts: [{ username, codigo, tipo?, views?, likes?, comentarios?, data?, legenda? }] }
import { readFileSync } from "node:fs";
import { SupabaseStore } from "../src/lib/store/supabase";
import type { ReferenciaIG } from "../src/lib/types";

async function main() {
  const arq = process.argv[2];
  if (!arq) throw new Error("Informe o arquivo JSON.");
  const j = JSON.parse(readFileSync(arq, "utf8")) as { coletado_em?: string; posts: Array<Record<string, unknown>> };
  const coletado_em = j.coletado_em ?? new Date().toISOString();
  const rows: ReferenciaIG[] = j.posts.map((p) => {
    const tipo = (p.tipo as string) === "post" ? "post" : "reel";
    return {
      username: String(p.username),
      codigo: String(p.codigo),
      url: `https://www.instagram.com/${tipo === "reel" ? "reel" : "p"}/${p.codigo}/`,
      tipo,
      views: p.views === undefined ? null : Number(p.views),
      likes: p.likes === undefined ? null : Number(p.likes),
      comentarios: p.comentarios === undefined ? null : Number(p.comentarios),
      data_post: (p.data as string) ?? null,
      legenda: (p.legenda as string) ?? null,
      coletado_em,
    };
  });
  const store = new SupabaseStore();
  const n = await store.salvarReferencias(rows);
  const porPerfil = rows.reduce<Record<string, number>>((a, r) => ((a[r.username] = (a[r.username] ?? 0) + 1), a), {});
  console.log(`Gravadas ${n} referências:`, porPerfil);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
