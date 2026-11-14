// Gera 3 capas completas (imagem + renderização) para o Julio avaliar a direção criativa.
//   npx tsx --env-file=.env.local scripts/_capas-criativas.ts <saida/>
import { writeFileSync, mkdirSync } from "node:fs";
import { configPadrao } from "../src/lib/config";
import { gerarImagem } from "../src/lib/openai";
import { promptImagem } from "../src/prompts";
import { dataUri, dimensoesJpeg } from "../src/lib/render/jpeg";
import { mesAnoDe, renderizarSlideJpeg } from "../src/lib/render/slides";
import type { Slide } from "../src/lib/types";

const CASOS: { nome: string; estilo: Slide["estilo"]; funcao: "capa" | "extra"; titulo: string; destaque: string; corpo: string; rotulo: string; cena: string }[] = [
  {
    nome: "1-ironia",
    estilo: "ironia",
    funcao: "capa",
    titulo: "Oração da dentista para ninguém desmarcar na sexta",
    destaque: "ninguém desmarcar",
    corpo: "Amém, agenda cheia",
    rotulo: "Comportamento",
    cena: "Deadpan humor, magazine cover feel: a Brazilian female dentist in her 30s, white scrubs and gloves, eyes closed, hands pressed together in prayer, lit like a movie poster by a single window of cool morning light, standing in the middle of an EMPTY dental clinic reception — rows of empty chairs, a wall clock showing 8:05, a paper appointment book open on the counter. Slight overcast gray-blue palette, very shallow depth of field on her face, no money, no golden tones. Upper two thirds for the subject, lower third dark and clean.",
  },
  {
    nome: "2-bloco",
    estilo: "bloco",
    funcao: "extra",
    titulo: "O Nubank atende 100 milhões sem fila. E a recepção da sua clínica?",
    destaque: "sem fila",
    corpo: "",
    rotulo: "Negócios",
    cena: "Product shot on a clean light-gray seamless background: a purple Nubank credit card (official Nubank purple, the Nubank logo visible on the card) standing upright next to a smartphone showing a blank purple app screen; a small old-fashioned paper ticket dispenser with a curled queue ticket lying knocked over beside them. Soft studio daylight, slight top-down angle, crisp shadows, photorealistic, no people, no text other than the card logo.",
  },
  {
    nome: "3-caixa",
    estilo: "caixa",
    funcao: "extra",
    titulo: "Agenda vazia de segunda não é azar. É o WhatsApp da sua clínica",
    destaque: "o WhatsApp da sua clínica",
    corpo: "O paciente escreveu sexta. Ninguém respondeu.",
    rotulo: "Atendimento",
    cena: "Editorial documentary photo, bright white Monday-morning daylight: a calm middle-aged female dentist in scrubs sits in the empty dental chair of her own clinic, legs crossed, filing her nails, completely relaxed, while a receptionist in the blurred background stares at a ringing desk phone and a smartphone glowing with unread green WhatsApp notification bubbles on the counter. Clean mint-and-white clinic, wide shot from the doorway, natural colors, photorealistic, no money.",
  },
];

async function main() {
  const out = process.argv[2];
  mkdirSync(out, { recursive: true });
  const cfg = configPadrao();
  await Promise.all(
    CASOS.map(async (c) => {
      const p = promptImagem({ cena: c.cena, cfg, ilustrativo: false, funcao: c.funcao });
      const img = await gerarImagem({ modelo: cfg.modelos.imagem_capa, prompt: p.prompt, tamanho: cfg.imagens.tamanho, qualidade: cfg.imagens.qualidade_capa });
      writeFileSync(`${out}/${c.nome}-base.jpg`, img.dados);
      const dim = dimensoesJpeg(img.dados);
      const slide: Slide = { n: 1, papel: "capa", layout: "capa", titulo: c.titulo, corpo: c.corpo, destaque: c.destaque, imagem_idx: 0, hipotetico: false, estilo: c.estilo, rotulo: c.rotulo };
      const ctx = { total: 7, identidade: cfg.identidade, imagemDataUri: dataUri(img.dados, "jpeg"), imagemLargura: dim?.largura, imagemAltura: dim?.altura, ilustrativo: false, mesAno: mesAnoDe("2026-11-14") };
      const r = await renderizarSlideJpeg(slide, ctx);
      writeFileSync(`${out}/${c.nome}.jpg`, r.jpeg);
      console.log(c.nome, "ok", img.dados.length, "bytes");
    }),
  );
}
main().catch((e) => { console.error(e); process.exit(1); });
