// Amostra da capa do post das 18h no molde da Academia (estilo "ironia"), com a headline de hoje. Não grava no banco.
//   npx tsx --env-file=.env.local scripts/_demo-capa-tarde.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configPadrao } from "../src/lib/config";
import { gerarImagem } from "../src/lib/openai";
import { promptImagem } from "../src/prompts";
import { dataUri } from "../src/lib/render/jpeg";
import { mesAnoDe, renderizarSlideJpeg } from "../src/lib/render/slides";
import type { Slide } from "../src/lib/types";

async function main() {
  const cfg = configPadrao();
  const saida = path.join(process.cwd(), "out", "capa-tarde-demo");
  mkdirSync(saida, { recursive: true });
  const cena = "A calm, elegant female dentist in a white coat sits in a leather armchair in the middle of her dental clinic waiting room, sipping coffee with sunglasses on, perfectly composed — while every chair around her is EMPTY and dozens of appointment-book pages and torn calendar sheets rain down from the ceiling like confetti. Bright, slightly overexposed morning daylight, cool neutral colors, magazine cover framing, she looks straight at the camera. Lower third of the frame darker and uncluttered.";
  const p = promptImagem({ cena, cfg, ilustrativo: false, funcao: "capa" });
  const img = await gerarImagem({ modelo: cfg.modelos.imagem_capa, prompt: p.prompt, tamanho: cfg.imagens.tamanho, qualidade: cfg.imagens.qualidade_capa });
  const slide: Slide = { n: 1, papel: "capa", layout: "capa", estilo: "ironia", titulo: "A cada mês que passa a agenda da sua clínica fica com mais buracos", corpo: "", destaque: "mais buracos", rotulo: "Gestão", imagem_idx: 0, hipotetico: false };
  const { jpeg } = await renderizarSlideJpeg(slide, { total: 7, identidade: cfg.identidade, imagemDataUri: dataUri(img.dados, "jpeg"), ilustrativo: false, mesAno: mesAnoDe(new Date().toISOString()) });
  const arq = path.join(saida, "capa-tarde.jpg");
  writeFileSync(arq, jpeg);
  console.log("ok", arq);
}
main().catch((e) => { console.error(e); process.exit(1); });
