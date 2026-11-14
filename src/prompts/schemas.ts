// Esquemas JSON (modo estrito da OpenAI: todas as propriedades obrigatórias, sem propriedades extras).
type J = Record<string, unknown>;
const str: J = { type: "string" };
const num: J = { type: "number" };
const bool: J = { type: "boolean" };
const int: J = { type: "integer" };
const arr = (items: J): J => ({ type: "array", items });
const obj = (props: Record<string, J>): J => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const nulavel = (t: J): J => ({ anyOf: [t, { type: "null" }] });
const en = (vals: string[]): J => ({ type: "string", enum: vals });

export const SCHEMA_CANDIDATOS = {
  nome: "candidatos_de_pauta",
  schema: obj({
    candidatos: arr(
      obj({
        titulo: str,
        o_que_aconteceu: str,
        data_acontecimento: str,
        data_publicacao: str,
        fontes: arr(obj({ titulo: str, url: str, publicado_em: nulavel(str) })),
        evidencias_de_atencao: str,
        em_alta_comprovado: bool,
        conexao_com_clinica: str,
        riscos: str,
        desenvolvimento_novo_sobre_tema_recente: bool,
        notas: obj({ atualidade: num, gancho: num, relevancia: num, confiabilidade: num, originalidade: num }),
      }),
    ),
  }),
};

const SLIDE = obj({
  n: int,
  papel: en(["capa", "contexto", "aprendizado", "aplicacao", "exemplo", "acao", "fechamento", "extra"]),
  layout: en(["capa", "foto", "foto_escura", "citacao", "tese", "texto", "imagem", "destaque", "lista", "comparativo", "checklist", "dados", "cta"]),
  titulo: str,
  corpo: str,
  destaque: nulavel(str),
  rotulo: nulavel(str),
  autor: nulavel(str),
  itens: arr(str),
  colunas: arr(obj({ titulo: str, itens: arr(str) })),
  numeros: arr(obj({ valor: str, rotulo: str })),
  fonte_dado: nulavel(str),
  hipotetico: bool,
  imagem_idx: nulavel(int),
  estilo: nulavel(en(["hiperbole", "cartao", "tipografia", "caixa", "bloco", "repeticao", "ironia"])),
});

export const SCHEMA_ROTEIRO = {
  nome: "roteiro_do_carrossel",
  schema: obj({
    headlines: arr(str),
    headline_escolhida: str,
    porque_esta_headline: str,
    slides: arr(SLIDE),
    legenda: str,
    chamada_final: en(["salvar", "compartilhar", "comentar", "seguir"]),
    prompt_imagem_capa: str,
    prompts_imagens_extras: arr(str),
    ilustrativo: bool,
  }),
};

export const SCHEMA_REVISAO = {
  nome: "revisao_do_carrossel",
  schema: obj({
    aprovado: bool,
    itens: arr(obj({ criterio: str, ok: bool, problema: nulavel(str), gravidade: en(["bloqueante", "ajuste", "observacao"]) })),
    resumo: str,
    correcoes_pedidas: arr(str),
    problemas_de_imagem: bool,
  }),
};

export const SCHEMA_RECHECK = {
  nome: "checagem_final_de_atualidade",
  schema: obj({ ainda_valido: bool, houve_novo_desenvolvimento: bool, resumo: str, fontes_novas: arr(str) }),
};

export const SCHEMA_REFERENCIAS = {
  nome: "candidatos_por_referencia",
  schema: obj({
    candidatos: arr(
      obj({
        titulo: str,
        o_que_aconteceu: str,
        evidencias_de_atencao: str,
        conexao_com_clinica: str,
        riscos: str,
        codigos: arr(str),
        notas: obj({ atualidade: num, gancho: num, relevancia: num, confiabilidade: num, originalidade: num }),
      }),
    ),
  }),
};
