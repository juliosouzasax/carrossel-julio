// Tipos compartilhados por todo o sistema.

export type StatusPost =
  | "novo"
  | "pesquisando"
  | "pesquisado"
  | "roteirizado"
  | "imagens_prontas"
  | "renderizado"
  | "em_revisao"
  | "aguardando_aprovacao" // modo manual: revisão automática passou, falta o seu OK
  | "aprovado" // revisão passou (e OK dado, no modo manual)
  | "pronto" // checagem final de atualidade feita; aguardando o horário
  | "publicando"
  | "publicado"
  | "simulado" // modo de teste: tudo rodou, nada foi publicado
  | "usada" // post reserva que já foi aproveitado em outro dia
  | "reprovado"
  | "suspenso"
  | "cancelado"
  | "falhou"
  | "perdeu_janela";

// dia = post das 12h (notícia do mundo); tarde = post das 18h (tema tirado do que engaja nos perfis de referência);
// reserva = plano B pronto; teste = nunca publica.
export type KindPost = "dia" | "tarde" | "reserva" | "teste";

export const STATUS_TERMINAIS: StatusPost[] = [
  "publicado",
  "simulado",
  "usada",
  "reprovado",
  "suspenso",
  "cancelado",
  "falhou",
  "perdeu_janela",
];

export type Fonte = {
  titulo: string;
  url: string;
  dominio: string;
  publicado_em?: string | null; // data da publicação da fonte, se a pesquisa trouxe
  verificada?: "ok" | "inacessivel" | "nao_verificada";
};

export type NotasPauta = {
  atualidade: number;
  gancho: number;
  relevancia: number;
  confiabilidade: number;
  originalidade: number;
};

export type Pauta = {
  titulo: string;
  o_que_aconteceu: string;
  data_acontecimento: string; // AAAA-MM-DD ou texto livre se incerto
  data_publicacao: string;
  fontes: Fonte[];
  evidencias_de_atencao: string; // o que prova que está em alta (sem inventar números)
  em_alta_comprovado: boolean; // false = só notícia recente
  conexao_com_clinica: string;
  riscos: string;
  desenvolvimento_novo_sobre_tema_recente: boolean;
  notas: NotasPauta;
  // calculados em código
  trechos?: { url: string; dominio: string; texto: string }[]; // texto das matérias (dado não confiável), base dos fatos do roteiro
  fontes_independentes?: number;
  nota_final?: number;
  descartada_por?: string | null;
};

// referencia = pauta tirada dos posts mais engajados dos perfis de referência (post das 18h).
export type TipoPauta = "noticia" | "atemporal" | "referencia";

// Um post de um perfil de referência, coletado pelo Chrome do Julio e gravado em referencias_ig.
export type ReferenciaIG = {
  username: string;
  codigo: string; // shortcode do Instagram
  url: string;
  tipo: "reel" | "post";
  views: number | null;
  likes: number | null;
  comentarios: number | null;
  data_post: string | null; // AAAA-MM-DD
  legenda: string | null;
  coletado_em: string;
};

export type Slide = {
  n: number;
  papel: "capa" | "contexto" | "aprendizado" | "aplicacao" | "exemplo" | "acao" | "fechamento" | "extra";
  layout: "capa" | "foto" | "foto_escura" | "citacao" | "tese" | "texto" | "imagem" | "destaque" | "lista" | "comparativo" | "checklist" | "dados" | "cta";
  titulo: string;
  corpo: string;
  destaque: string | null; // palavras do título destacadas em dourado
  rotulo?: string | null; // etiqueta curta de seção (ex.: "MARKETING", "CONSUMO", "GESTÃO")
  autor?: string | null; // layout citacao: quem disse (nome e cargo/veículo)
  // Campos estruturados, usados só por alguns layouts (nos demais ficam vazios):
  itens?: string[]; // lista / checklist (uma linha curta por item)
  colunas?: { titulo: string; itens: string[] }[]; // comparativo "X vs Y" (2 colunas)
  numeros?: { valor: string; rotulo: string }[]; // dados (2 cartões)
  fonte_dado?: string | null; // fonte citada discretamente no slide de dados
  imagem_idx: number | null; // índice em Post.imagens_base
  hipotetico: boolean;
  url?: string | null;
  storage_path?: string | null;
  bytes?: number | null;
};

export type Roteiro = {
  headlines: string[]; // as 5 opções
  headline_escolhida: string;
  porque_esta_headline: string;
  slides: Slide[];
  legenda: string;
  chamada_final: "salvar" | "compartilhar" | "comentar" | "seguir";
  prompt_imagem_capa: string;
  prompts_imagens_extras: string[];
  fonte_resumo_para_legenda: string;
  ilustrativo: boolean; // true quando a imagem representa um acontecimento real
  prompt_version?: string;
};

export type ImagemBase = {
  indice: number;
  funcao: "capa" | "extra" | "fonte"; // fonte = foto real tirada da matéria (com crédito)
  prompt: string; // na foto real: descrição/origem
  storage_path: string;
  url: string;
  bytes: number;
  modelo: string; // na foto real: "fonte"
  credito?: string | null;
  largura?: number | null;
  altura?: number | null;
  origem_url?: string | null;
};

export type ItemRevisao = {
  criterio: string;
  ok: boolean;
  problema: string | null;
  gravidade: "bloqueante" | "ajuste" | "observacao";
};

export type Revisao = {
  tentativa: number;
  aprovado: boolean;
  itens: ItemRevisao[];
  resumo: string;
  correcoes_pedidas: string[];
  problemas_de_imagem: boolean;
  checagens_de_codigo: string[]; // falhas encontradas pelas verificações programáticas
  em: string;
};

export type Recheck = {
  em: string;
  ainda_valido: boolean;
  houve_novo_desenvolvimento: boolean;
  resumo: string;
  fontes_novas: string[];
};

export type Publicacao = {
  programada_para?: string | null; // ISO
  container_ids?: string[];
  container_carrossel_id?: string | null;
  media_id?: string | null;
  permalink?: string | null;
  confirmada_em?: string | null; // quando a API confirmou
  tentativas?: number;
  ultimo_erro?: string | null;
  simulada?: boolean;
  publicacao_iniciada_em?: string | null; // marca antes do media_publish: base da conferência anti-duplicidade
};

export type Post = {
  id: string;
  conta: string; // chave da conta (ex.: "juliosouza_costa")
  data: string; // AAAA-MM-DD (America/Sao_Paulo)
  kind: KindPost;
  status: StatusPost;
  modo: "automatico" | "manual";
  pausado: boolean;
  tipo_pauta: TipoPauta;
  pauta: Pauta | null;
  justificativa: string | null;
  roteiro: Roteiro | null;
  slides: Slide[];
  legenda: string;
  imagens_base: ImagemBase[];
  revisoes: Revisao[];
  recheck: Recheck | null;
  publicacao: Publicacao;
  tentativas: Record<string, number>; // por etapa
  proxima_tentativa_em: string | null;
  erro: string | null;
  motivo: string | null; // motivo de suspensão/reprovação/cancelamento
  criado_em: string;
  atualizado_em: string;
};

export type Candidatos = {
  id: string;
  post_id: string;
  data: string;
  candidatos: Pauta[];
  escolhido: number | null;
  justificativa: string | null;
  texto_bruto_pesquisa: string | null;
  criado_em: string;
};

export type UsoRegistro = {
  id?: string;
  post_id: string | null;
  etapa: string;
  provedor: "openai" | "meta";
  modelo: string;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_cache: number;
  imagens: number;
  buscas_web: number;
  custo_usd: number;
  prompt_version?: string | null;
  criado_em?: string;
};

export type LogNivel = "info" | "aviso" | "erro";

export type LogRegistro = {
  id?: string;
  post_id: string | null;
  etapa: string;
  nivel: LogNivel;
  mensagem: string;
  detalhe?: unknown;
  criado_em?: string;
};

export type ContaIG = {
  chave: string;
  ig_user_id: string | null;
  username: string | null;
  token_cifrado: string | null;
  token_expira_em: string | null;
  token_renovado_em: string | null;
  ultimo_erro: string | null;
};
