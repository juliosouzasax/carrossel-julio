// Renderiza os 7 estilos de capa com uma imagem-base local, para conferir o desenho sem gastar imagem.
//   npx tsx scripts/_demo-estilos-capa.ts <imagem.jpg> <saida/>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { configPadrao } from "../src/lib/config";
import { dataUri, dimensoesJpeg } from "../src/lib/render/jpeg";
import { mesAnoDe, renderizarSlideJpeg } from "../src/lib/render/slides";
import type { Slide } from "../src/lib/types";
async function main() {
  const [img, out] = process.argv.slice(2);
  mkdirSync(out, { recursive: true });
  const cfg = configPadrao();
  const buf = readFileSync(img);
  const dim = dimensoesJpeg(buf);
  const casos: { estilo: Slide["estilo"]; titulo: string; destaque: string; corpo: string }[] = [
    { estilo: "cartao", titulo: "Seu paciente faltou hoje? Isso custou R$ 800 à clínica", destaque: "R$ 800", corpo: "A maioria das clínicas nem percebe o tamanho desse rombo." },
    { estilo: "tipografia", titulo: "3 formas de fechar mais na clínica sem dar desconto", destaque: "sem dar desconto", corpo: "" },
    { estilo: "hiperbole", titulo: "Dentista, sua recepção está esvaziando a agenda", destaque: "esvaziando a agenda", corpo: "Horário marcado não é venda" },
    { estilo: "caixa", titulo: "A Shopee pagou R$ 20 de cupom. Sua clínica dá R$ 2 mil de desconto", destaque: "R$ 2 mil de desconto", corpo: "" },
    { estilo: "bloco", titulo: "O Nubank cortou 40% da fila. E a recepção da sua clínica?", destaque: "40% da fila", corpo: "" },
    { estilo: "ironia", titulo: "A cada ano o fim de ano fica pior para a clínica", destaque: "fica pior", corpo: "Novembro decide dezembro" },
    { estilo: "repeticao", titulo: "Dentista, sua agenda vazia tem um culpado: o orçamento sem follow-up", destaque: "agenda vazia", corpo: "" },
  ];
  for (const c of casos) {
    const slide: Slide = { n: 1, papel: "capa", layout: "capa", titulo: c.titulo, corpo: c.corpo, destaque: c.destaque, imagem_idx: 0, hipotetico: false, estilo: c.estilo, rotulo: c.estilo === "caixa" || c.estilo === "bloco" ? "Negócios" : null };
    const ctx = { total: 7, identidade: cfg.identidade, imagemDataUri: c.estilo === "tipografia" || c.estilo === "repeticao" ? null : dataUri(buf, "jpeg"), imagemLargura: dim?.largura, imagemAltura: dim?.altura, ilustrativo: false, mesAno: mesAnoDe("2026-11-12") };
    const r = await renderizarSlideJpeg(slide, ctx);
    writeFileSync(`${out}/capa-${c.estilo}.jpg`, r.jpeg);
    console.log(c.estilo, r.largura, r.altura);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
