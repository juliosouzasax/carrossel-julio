// Renderiza a arte do story a partir de uma capa já renderizada (JPEG 1080x1350), para conferir o desenho.
//   npx tsx scripts/_demo-story.ts <capa.jpg> <saida.jpg>
import { readFileSync, writeFileSync } from "node:fs";
import { configPadrao } from "../src/lib/config";
import { dataUri } from "../src/lib/render/jpeg";
import { mesAnoDe } from "../src/lib/render/slides";
import { renderizarStoryJpeg } from "../src/lib/render/story";
async function main() {
  const [capa, out] = process.argv.slice(2);
  const cfg = configPadrao();
  const r = await renderizarStoryJpeg({
    identidade: cfg.identidade,
    chamada: cfg.story.chamada,
    instrucao: cfg.story.instrucao,
    headline: "Por que o paciente da sua clínica confirma na quinta e some na sexta?",
    destaque: "some na sexta",
    totalSlides: 8,
    capaDataUri: capa && capa !== "-" ? dataUri(readFileSync(capa), "jpeg") : null,
    mesAno: mesAnoDe("2026-11-15"),
  });
  writeFileSync(out, r.jpeg);
  console.log(out, r.largura, r.altura);
}
main().catch((e) => { console.error(e); process.exit(1); });
