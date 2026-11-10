import { z } from "zod";
import { minutosDe } from "./tempo";

const hhmm = z.string().refine((v) => {
  try {
    minutosDe(v);
    return true;
  } catch {
    return false;
  }
}, "Use o formato HH:MM");

const preco = z.object({ entrada: z.number(), saida: z.number(), cache: z.number() });

export const ConfigSchema = z.object({
  // O sistema nasce DESLIGADO e em modo de teste: nada é publicado até você ativar no painel.
  ativo: z.boolean().default(false),
  pausado_global: z.boolean().default(false),
  modo: z.enum(["automatico", "manual"]).default("manual"),
  modo_teste: z.boolean().default(true),

  horarios: z
    .object({
      pesquisa: hhmm.default("09:00"),
      roteiro: hhmm.default("09:30"),
      prazo_revisao: hhmm.default("11:30"),
      recheck: hhmm.default("11:45"),
      publicacao: hhmm.default("12:00"),
    })
    .default({}),
  // Política para atraso: só publica até N minutos depois do horário. Passou disso, registra e avisa no painel.
  janela_publicacao_min: z.number().int().min(0).max(240).default(30),
  dias_ativos: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),

  modelos: z
    .object({
      pesquisa: z.string().default("gpt-6.1-sol"),
      roteiro: z.string().default("gpt-6.1-sol"),
      revisao: z.string().default("gpt-6.1-sol"),
      recheck: z.string().default("gpt-6.1-terra"),
      imagem_capa: z.string().default("gpt-image-2.5-sunburst"),
      imagem_extra: z.string().default("gpt-image-2.5-flare"),
    })
    .default({}),
  // Esforço de raciocínio por etapa. Vazio = não envia o parâmetro.
  raciocinio: z
    .object({
      pesquisa: z.string().default("medium"),
      roteiro: z.string().default("medium"),
      revisao: z.string().default("medium"),
      recheck: z.string().default("low"),
    })
    .default({}),
  busca: z
    .object({
      contexto: z.enum(["low", "medium", "high"]).default("medium"),
      pais: z.string().default("BR"),
    })
    .default({}),

  imagens: z
    .object({
      tamanho: z.string().default("1024x1536"),
      qualidade_capa: z.string().default("high"),
      qualidade_extra: z.string().default("medium"),
      // Uma imagem por slide de história (capa + até 6 de apoio): é o que dá o peso visual de referência.
      max_por_post: z.number().int().min(1).max(8).default(7),
      // Usar a foto de divulgação das matérias (com crédito) antes de gerar por IA. Autorizado pelo dono da conta em 09/11/2026.
      fotos_reais: z.boolean().default(true),
      max_fotos_reais: z.number().int().min(0).max(4).default(3),
    })
    .default({}),

  limites: z
    .object({
      custo_dia_usd: z.number().default(3),
      custo_mes_usd: z.number().default(60),
      max_imagens_dia: z.number().int().default(16),
      max_regeneracoes_por_post: z.number().int().default(4),
      max_revisoes: z.number().int().default(2),
      max_tentativas_etapa: z.number().int().default(3),
    })
    .default({}),

  // Preços em USD por 1 milhão de tokens (doc da OpenAI lida em 09/11/2026). Edite se mudarem.
  precos: z
    .object({
      modelos: z.record(preco).default({
        "gpt-6-astra": { entrada: 10, saida: 50, cache: 1 },
        "gpt-6.1-sol": { entrada: 2, saida: 10, cache: 0.1 },
        "gpt-6.1-terra": { entrada: 1, saida: 5, cache: 0.05 },
        "gpt-6-luna": { entrada: 0.1, saida: 0.5, cache: 0.01 },
      }),
      modelo_desconhecido: preco.default({ entrada: 10, saida: 50, cache: 1 }), // conservador
      busca_web_por_mil: z.number().default(10),
      imagem_entrada_texto: z.number().default(5),
      imagem_entrada_imagem: z.number().default(8),
      imagem_saida: z.number().default(30),
      // Usado só quando a API não devolve o uso (estimativa conservadora por qualidade).
      imagem_fallback_usd: z.record(z.number()).default({ low: 0.02, medium: 0.06, high: 0.2 }),
    })
    .default({}),

  // Estilo visual: estrutura e tipografia inspiradas em carrosséis editoriais (manchete condensada gigante,
  // frases-tese em serifa, cards alternando fundo escuro e claro), nas cores da identidade do Julio.
  identidade: z
    .object({
      escuro: z.string().default("#101014"),
      capa_escura: z.string().default("#0B0B0D"),
      claro: z.string().default("#F4F1EA"),
      texto_no_escuro: z.string().default("#F4F1EA"),
      texto_no_claro: z.string().default("#101014"),
      dourado: z.string().default("#C9A24B"), // destaque sobre fundo escuro
      dourado_no_claro: z.string().default("#A67C1E"), // mesmo dourado, mais fechado, para ter contraste no claro
      creme_serifa: z.string().default("#F5EFC9"),
      apagado_no_escuro: z.string().default("#9A958A"),
      apagado_no_claro: z.string().default("#6F6A5E"),
      cartao_escuro: z.string().default("#181820"),
      kicker_esquerda: z.string().default("Powered by Prime 90D"),
      kicker_centro: z.string().default("@juliosouza_costa"),
      assinatura: z.string().default("Julio Souza"),
      conta: z.string().default("@juliosouza_costa"),
      // Vazio = não escreve nada na capa gerada por IA (decisão do Julio, 09/11/2026). Foto real continua com crédito.
      rotulo_ilustracao: z.string().default(""),
      // Fechamento FIXO do carrossel (último slide e fim da legenda). O redator não reescreve isto.
      cta_linhas: z.array(z.string()).default(["Salve esse post", "Encaminhe para um dentista ou dono de clínica", "Me chame no direct para elevar seu faturamento"]),
      estilo_imagem: z
        .string()
        .default(
          "fotografia editorial de revista, realista e premium; o assunto da notícia em primeiro plano (produto, lugar, objeto, cena), nunca uma metáfora genérica; luz de cinema, contraste alto, cores naturais com tons quentes e dourados discretos; composição limpa",
        ),
    })
    .default({}),

  conteudo: z
    .object({
      exigir_duas_fontes: z.boolean().default(true), // fatos centrais em 2 fontes independentes
      nota_minima: z.number().default(6.5), // abaixo disso a pauta cai para conteúdo atemporal
      similaridade_maxima: z.number().default(0.5), // acima disso é tratado como assunto repetido
      dias_de_historico: z.number().int().default(60),
      // Se a checagem final de atualidade (11:45) falhar por erro técnico: "bloquear" (padrão, mais seguro) ou "publicar".
      se_recheck_falhar: z.enum(["bloquear", "publicar"]).default("bloquear"),
      publico: z
        .string()
        .default(
          "Dentistas, principalmente donos de clínica, no Brasil. Autor: Julio Souza, empresário e mentor de dentistas.",
        ),
      areas: z
        .array(z.string())
        .default([
          "captação de pacientes",
          "atendimento e conversão pelo WhatsApp",
          "avaliações, agendamentos e faltas",
          "follow-up de orçamentos",
          "gestão, liderança e processos",
          "experiência do paciente",
          "inteligência artificial e produtividade",
          "posicionamento, reputação e crescimento sustentável",
        ]),
      // Cole aqui o que você admira nos perfis de referência (formatos, tom, tipos de pauta).
      referencias_estilo: z
        .string()
        .default(
          "Perfis de referência de posicionamento (sem cópia de conteúdo): @annysoouto (vendas e estrutura comercial para clínicas), @fabioavelarmkt (marketing para dentistas), @rinovack (gestão e marketing em saúde), @ilaflavia (gestão, vendas, equipe e lucro de clínicas).",
        ),
      evitar: z
        .string()
        .default(
          "tragédias, mortes e sofrimento como gancho; boatos; acusações sem prova; polarização política gratuita; orientação clínica; promessa de resultado de tratamento ou de faturamento",
        ),
    })
    .default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export function configPadrao(): Config {
  return ConfigSchema.parse({});
}

export function mesclarConfig(atual: unknown, patch: unknown): Config {
  const base = (atual && typeof atual === "object" ? atual : {}) as Record<string, unknown>;
  const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  return ConfigSchema.parse(profundo(base, p));
}

function profundo(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) {
      out[k] = profundo(a[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else out[k] = v;
  }
  return out;
}

export function horariosEmMinutos(c: Config) {
  const h = c.horarios;
  return {
    pesquisa: minutosDe(h.pesquisa),
    roteiro: minutosDe(h.roteiro),
    prazo_revisao: minutosDe(h.prazo_revisao),
    recheck: minutosDe(h.recheck),
    publicacao: minutosDe(h.publicacao),
  };
}
