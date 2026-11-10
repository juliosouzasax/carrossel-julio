// Gera CAPAS de exemplo (imagem pela IA + texto renderizado) para o Julio avaliar direção criativa.
//   npx tsx --env-file=.env.local scripts/capas-demo.ts
// Custa ~3 imagens de capa (qualidade alta). Não grava nada no banco.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configPadrao } from "../src/lib/config";
import { gerarImagem } from "../src/lib/openai";
import { promptImagem } from "../src/prompts";
import { dataUri } from "../src/lib/render/jpeg";
import { mesAnoDe, renderizarSlideJpeg } from "../src/lib/render/slides";
import type { Slide } from "../src/lib/types";

const IDEIAS: { arquivo: string; titulo: string; destaque: string; corpo: string; cena: string }[] = [
  {
    arquivo: "1-preco",
    titulo: "Dentista, o jeito que você fala o preço está matando a venda",
    destaque: "matando a venda",
    corpo: "→ o \"vou pensar\" nasce em 10 segundos da sua boca",
    cena: "A dentist in a white coat, mid-sentence, talking to a patient across a desk in a modern dental office — and a torrent of banknotes is flying out of his open mouth, bills spinning through the air and scattering over the desk and the floor. Photorealistic, cinematic side light, golden tones, shallow depth of field, the dentist's expression confident and oblivious. Surreal but shot like a real photo.",
  },
  {
    arquivo: "2-comissao",
    titulo: "Você está pagando sua equipe para encher a agenda de gente que não fecha",
    destaque: "não fecha",
    corpo: "→ comissão por agendamento = falta cara e orçamento parado",
    cena: "A dentist in scrubs standing at a clinic counter handing thick stacks of cash, one after another, to a line of young salespeople wearing phone headsets who hold out their hands; a wall calendar behind them is covered in sticky notes. Behind the dentist, the waiting room is empty. Photorealistic, dramatic warm light, slight wide-angle exaggeration, dark humor, money clearly the focal element.",
  },
  {
    arquivo: "3-ligacao",
    titulo: "Sua recepção liga para confirmar — e é por isso que o paciente falta",
    destaque: "o paciente falta",
    corpo: "→ a ligação precisa criar vontade, não lembrete",
    cena: "Inside a dental clinic reception, two receptionists on the phone with headsets, while behind them a crowd of patients is literally FLYING away out of a big open window into the sky like released balloons, coats and bags trailing, seen from inside the room. Photorealistic, late-afternoon light pouring through the window, dramatic and absurd at the same time, the empty chairs in the foreground.",
  },
];

async function main() {
  const cfg = configPadrao();
  const saida = path.join(process.cwd(), "out", "capas-demo");
  mkdirSync(saida, { recursive: true });
  await Promise.all(
    IDEIAS.map(async (ideia) => {
      const p = promptImagem({ cena: ideia.cena, cfg, ilustrativo: false, funcao: "capa" });
      const img = await gerarImagem({ modelo: cfg.modelos.imagem_capa, prompt: p.prompt, tamanho: cfg.imagens.tamanho, qualidade: cfg.imagens.qualidade_capa });
      const slide: Slide = { n: 1, papel: "capa", layout: "capa", titulo: ideia.titulo, corpo: ideia.corpo, destaque: ideia.destaque, imagem_idx: 0, hipotetico: false };
      const { jpeg } = await renderizarSlideJpeg(slide, { total: 7, identidade: cfg.identidade, imagemDataUri: dataUri(img.dados, "jpeg"), ilustrativo: false, mesAno: mesAnoDe(new Date().toISOString().slice(0, 10)) });
      const arq = path.join(saida, `${ideia.arquivo}.jpg`);
      writeFileSync(arq, jpeg);
      console.log("ok", arq);
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
