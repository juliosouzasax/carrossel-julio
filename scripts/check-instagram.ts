// Confere o token do Instagram SEM publicar nada (só leituras): perfil, cota de publicação e tipo da conta.
//   npm run check:instagram
import { env } from "../src/lib/env";
import { clienteInstagram, perfil } from "../src/lib/instagram";

async function main() {
  const token = env("IG_ACCESS_TOKEN");
  if (!token) {
    console.error("IG_ACCESS_TOKEN não configurado. Veja o README, seção Instagram.");
    process.exitCode = 1;
    return;
  }
  const p = await perfil(token);
  console.log(`Conta: @${p.username} (id ${p.igId}) — tipo: ${p.tipo ?? "?"}`);
  if (p.tipo && !/BUSINESS|MEDIA_CREATOR/i.test(p.tipo)) console.log("ATENÇÃO: a publicação pela API exige conta profissional (Business ou Creator).");
  const c = clienteInstagram(token, p.igId);
  const lim = await c.limite();
  console.log(`Cota de publicação nas últimas 24h: ${lim.usado}/${lim.total}`);
  const rec = await c.recentes();
  console.log(`Últimas mídias lidas: ${rec.length}. A permissão de leitura funciona.`);
  console.log("Nada foi publicado.");
}
main().catch((e) => { console.error("Erro:", (e as Error).message); process.exitCode = 1; });
