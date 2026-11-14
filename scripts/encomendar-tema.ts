// Encomenda um carrossel com TEMA dado pelo Julio (atemporal, sem fontes), no slot das 18h de uma data ou como reserva.
//   npx tsx --env-file=.env.local scripts/encomendar-tema.ts "<título>" "<o que o carrossel defende, em 2-4 frases>" [--data AAAA-MM-DD] [--reserva]
// O post nasce "pesquisado" e segue o pipeline normal (roteiro → imagens → revisão → aprovação no painel → publicação).
import { env } from "../src/lib/env";
import { SupabaseStore } from "../src/lib/store/supabase";
import { agoraSP } from "../src/lib/tempo";

async function main() {
  const args = process.argv.slice(2);
  const [titulo, tese] = args.filter((a) => !a.startsWith("--") && !/^\d{4}-\d{2}-\d{2}$/.test(a));
  if (!titulo || !tese) throw new Error("uso: titulo tese [--data AAAA-MM-DD] [--reserva]");
  const data = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? agoraSP().data;
  const kind = args.includes("--reserva") ? "reserva" : "tarde";
  const conta = env("IG_CONTA") || "juliosouza_costa";
  const store = new SupabaseStore();
  const { post, criado } = await store.criarPost({
    conta,
    data,
    kind,
    status: "pesquisado",
    modo: "automatico",
    tipo_pauta: "atemporal",
    pauta: {
      titulo,
      o_que_aconteceu: tese,
      data_acontecimento: data,
      data_publicacao: data,
      fontes: [],
      evidencias_de_atencao: "Tema encomendado pelo dono do perfil (dor recorrente do público).",
      em_alta_comprovado: false,
      conexao_com_clinica: "Diretamente a rotina e o crescimento da clínica.",
      riscos: "Não apresentar como notícia, não citar datas, não citar outros perfis nem programas de terceiros.",
      desenvolvimento_novo_sobre_tema_recente: false,
      notas: { atualidade: 0, gancho: 8, relevancia: 10, confiabilidade: 8, originalidade: 6 },
      fontes_independentes: 0,
      nota_final: 0,
      descartada_por: null,
    },
    justificativa: "Tema encomendado pelo Julio.",
  });
  console.log(criado ? "criado" : "JÁ EXISTIA (não alterado)", post.id, post.kind, post.data, post.status);
}
main().catch((e) => { console.error(e); process.exit(1); });
