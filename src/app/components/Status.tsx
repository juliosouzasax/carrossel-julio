import type { StatusPost } from "@/lib/types";

const ROTULO: Record<StatusPost, [string, string]> = {
  novo: ["Novo", ""], pesquisando: ["Pesquisando", ""], pesquisado: ["Pauta escolhida", ""], roteirizado: ["Roteiro pronto", ""],
  imagens_prontas: ["Imagens prontas", ""], renderizado: ["Slides prontos", ""], em_revisao: ["Em revisão", "aviso"],
  aguardando_aprovacao: ["Aguardando seu OK", "aviso"], aprovado: ["Aprovado", "ok"], pronto: ["Pronto p/ publicar", "ok"],
  publicando: ["Publicando", "aviso"], publicado: ["Publicado", "ok"], simulado: ["Simulado (não publicou)", "ok"], usada: ["Reserva usada", ""],
  reprovado: ["Reprovado", "erro"], suspenso: ["Suspenso", "erro"], cancelado: ["Cancelado", "erro"], falhou: ["Falhou", "erro"], perdeu_janela: ["Perdeu a janela", "erro"],
};

export function Status({ s }: { s: StatusPost }) {
  const [t, c] = ROTULO[s] ?? [s, ""];
  return <span className={`pill ${c}`}>{t}</span>;
}
