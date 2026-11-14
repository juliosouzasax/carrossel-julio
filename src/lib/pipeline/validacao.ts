import type { Config } from "../config";
import type { EstiloCapa, Pauta, Roteiro, Slide, TipoPauta } from "../types";
import { normalizar } from "../similaridade";

// Regras determinísticas sobre o roteiro. Rodam antes e depois da revisão por IA:
// prompt é pedido, código é garantia.

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/u;
const PROMESSA_DE_MATERIAL = /(comente\s+["“'“]?[\w\s]{1,20}["”']?\s+(e\s+)?(que\s+)?(eu\s+)?(te\s+)?(mando|envio|enviarei|mandarei)|te\s+(mando|envio)\s+(o|a|um|uma)\s+(pdf|material|planilha|ebook|e-book|checklist|modelo)|link\s+na\s+bio|baixe\s+(o|a|nosso)|material\s+gratuito|receba\s+(gratuitamente|de\s+gra[cç]a))/i;
const PROMESSA_DE_RESULTADO = /(garant(e|imos|ido)\s+(\w+\s+){0,3}(resultado|faturamento|lucro|aumento)|dobre\s+(seu|o)\s+faturamento|fature\s+\d|multiplique\s+(seu|o)\s+faturamento|resultado\s+garantido|100%\s+garantido)/i;
// Linguagem de ressalva que empobrece o card (vai para a apuração, não para o slide).
const DEFENSIVO = /(n[aã]o\s+(foi\s+)?verificad[ao]s?|n[aã]o\s+confirmad[ao]s?|n[aã]o\s+(é|são)\s+tratad[ao]s?\s+(aqui\s+)?como|segundo\s+as\s+mat[ée]rias\s+citadas|n[aã]o\s+(é|se\s+trata\s+de)\s+uma\s+avalia[cç][aã]o|informa[cç][oõ]es\s+semelhantes)/i;
const TEMPO_DE_NOTICIA =/\b(hoje|ontem|anteontem|nesta\s+semana|esta\s+semana|agora\s+h[aá]\s+pouco|acabou\s+de)\b/i;

export const LIMITES = {
  slidesMin: 6,
  slidesMax: 8,
  headlinePalavrasMin: 4,
  headlinePalavrasMax: 12,
  tituloCapa: 64,
  titulo: 120,
  corpo: 260,
  item: 70,
  itemColuna: 50,
  legenda: 2200,
  hashtags: 30,
  hashtagsRecomendado: 8,
};

export function contaPalavras(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}

export function contaHashtags(t: string): number {
  return (t.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

const DINHEIRO = /\b(money|cash|banknotes?|bills?|reais|coins?|dinheiro|notas)\b/i;
const HOMEM_JALECO = /\bdentist\b/i;
const PESSOA_DIFERENTE = /\b(female|woman|women|team|elderly|older|senior|receptionist|patient|hands only|no people|empty)\b/i;

// Três desenhos de capa em rodízio (pedido do Julio, 12/11: "as capas estão todas parecidas"; referências usam
// cartão claro com foto e capas só de tipografia). Escolhe o estilo que NÃO apareceu nas 2 últimas capas.
export const ESTILOS_CAPA: EstiloCapa[] = ["hiperbole", "caixa", "ironia", "cartao", "bloco", "tipografia", "repeticao"];
export const ESTILOS_SEM_IMAGEM: EstiloCapa[] = ["tipografia", "repeticao"];
// Escolhe o estilo que não apareceu nas 3 últimas capas, começando de um ponto diferente a cada post (semente)
// para a ordem não virar previsível.
export function proximoEstiloDaCapa(capasEstilosRecentes: string[], semente = 0): EstiloCapa {
  const ult = capasEstilosRecentes.slice(0, 3);
  const n = ESTILOS_CAPA.length;
  const inicio = ((semente % n) + n) % n;
  for (let i = 0; i < n; i++) {
    const e = ESTILOS_CAPA[(inicio + i) % n];
    if (!ult.includes(e)) return e;
  }
  return ESTILOS_CAPA[inicio];
}

// Gancho da headline (o que as referências fazem): número concreto, pergunta direta, ou fala com o leitor.
export function temGancho(h: string): boolean {
  return /\d/.test(h) || /\?/.test(h) || /\b(voc[êe]|sua|seu|dentista,|pare de|nunca|erro|segredo|por que|como|tod[oa]s?|quem|j[áa]|ningu[ée]m|sempre|ora[çc][ãa]o)\b/i.test(h);
}

// Capa não pode repetir o padrão das anteriores: dinheiro de novo, ou o mesmo "dentista homem" pela 4ª vez.
export function variedadeDaCapa(prompt: string, capasAnteriores: string[]): string[] {
  const p: string[] = [];
  const ult = capasAnteriores.slice(0, 3);
  if (!ult.length) return p;
  if (DINHEIRO.test(prompt) && ult.filter((c) => DINHEIRO.test(c)).length >= 2) p.push("A capa repete DINHEIRO como objeto da hipérbole (já usado nas últimas capas). Troque por outro objeto: pacientes, agenda, celular, relógio, cadeiras vazias, portas, fila, dentes gigantes…");
  if (HOMEM_JALECO.test(prompt) && !PESSOA_DIFERENTE.test(prompt) && ult.length >= 3 && ult.every((c) => HOMEM_JALECO.test(c) && !PESSOA_DIFERENTE.test(c))) p.push("Quarta capa seguida com um dentista homem como protagonista. Varie: female dentist, equipe, recepcionista, paciente, só mãos ou ninguém (cadeira/recepção vazia).");
  return p;
}

export function validarRoteiro(r: Roteiro, opc: { tipo: TipoPauta; cfg: Config; pauta?: Pauta | null; fotosReais?: number; capasAnteriores?: string[] }): string[] {
  const totalImagens = (opc.fotosReais ?? 0) + (r.prompts_imagens_extras ?? []).length; // índices válidos: 0..totalImagens
  const p: string[] = [];
  const s = r.slides ?? [];
  if (s.length < LIMITES.slidesMin || s.length > LIMITES.slidesMax) p.push(`O carrossel deve ter entre ${LIMITES.slidesMin} e ${LIMITES.slidesMax} slides (veio ${s.length}).`);
  if (!s.length) return p;
  if (s[0].layout !== "capa") p.push("O slide 1 precisa usar o layout 'capa'.");
  s.slice(1).forEach((x) => {
    if (x.layout === "capa") p.push(`Só o slide 1 pode usar o layout 'capa' (slide ${x.n}).`);
  });
  if (s[s.length - 1].layout === "capa") p.push("O último slide não pode ser a capa.");
  if ((r.headlines ?? []).length !== 5) p.push(`São necessárias exatamente 5 opções de headline (vieram ${(r.headlines ?? []).length}).`);
  const palavras = contaPalavras(r.headline_escolhida ?? "");
  if (palavras < LIMITES.headlinePalavrasMin || palavras > LIMITES.headlinePalavrasMax) p.push(`A headline escolhida deve ter de ${LIMITES.headlinePalavrasMin} a ${LIMITES.headlinePalavrasMax} palavras (tem ${palavras}).`);
  if (s[0].titulo.trim() !== (r.headline_escolhida ?? "").trim()) p.push("O título do slide 1 precisa ser exatamente a headline escolhida.");
  // Julio, 10/11/2026: a capa fala com o público pelo nome — "dentista" ou "clínica" — senão não direciona.
  if (!/dentista|cl[ií]nica/i.test(r.headline_escolhida ?? "")) p.push(`A headline precisa nomear o público: contenha "dentista(s)" ou "clínica(s)" (veio: "${r.headline_escolhida ?? ""}").`);

  s.forEach((x, i) => {
    if (x.n !== i + 1) p.push(`Numeração fora de sequência no slide ${i + 1} (veio n=${x.n}).`);
    const lim = x.layout === "capa" ? LIMITES.tituloCapa : LIMITES.titulo;
    if (!x.titulo?.trim()) p.push(`Slide ${x.n}: título vazio.`);
    if ((x.titulo ?? "").length > lim) p.push(`Slide ${x.n}: título com ${(x.titulo ?? "").length} caracteres (máx. ${lim}).`);
    if ((x.corpo ?? "").length > LIMITES.corpo) p.push(`Slide ${x.n}: texto com ${(x.corpo ?? "").length} caracteres (máx. ${LIMITES.corpo}).`);
    if (x.layout === "capa" && (x.corpo ?? "").length > 52) p.push("Slide 1: a subline da capa deve ter até 52 caracteres.");
    if (EMOJI.test(`${x.titulo} ${x.corpo} ${(x.itens ?? []).join(" ")}`)) p.push(`Slide ${x.n}: sem emojis nos slides.`);
    if (x.layout === "comparativo") {
      const c = x.colunas ?? [];
      if (c.length !== 2) p.push(`Slide ${x.n}: o comparativo precisa de exatamente 2 colunas.`);
      c.forEach((col) => {
        if (!col.itens?.length || col.itens.length > 4) p.push(`Slide ${x.n}: cada coluna do comparativo precisa de 1 a 4 itens.`);
        col.itens?.forEach((it) => it.length > LIMITES.itemColuna && p.push(`Slide ${x.n}: item de coluna longo demais ("${it.slice(0, 24)}…", máx. ${LIMITES.itemColuna}).`));
      });
    }
    if (x.layout === "lista" || x.layout === "checklist") {
      const it = x.itens ?? [];
      if (it.length < 3 || it.length > 5) p.push(`Slide ${x.n}: use de 3 a 5 itens (veio ${it.length}).`);
      it.forEach((t) => t.length > LIMITES.item && p.push(`Slide ${x.n}: item longo demais ("${t.slice(0, 24)}…", máx. ${LIMITES.item}).`));
    }
    if (x.layout === "dados") {
      if ((x.numeros ?? []).length !== 2) p.push(`Slide ${x.n}: o layout 'dados' precisa de exatamente 2 números.`);
      if (opc.tipo === "atemporal") p.push(`Slide ${x.n}: conteúdo atemporal não deve usar o layout 'dados' (não há fonte para números).`);
      if (!x.fonte_dado?.trim()) p.push(`Slide ${x.n}: o layout 'dados' exige fonte_dado.`);
    }
    if (["imagem", "foto", "foto_escura", "citacao"].includes(x.layout) && (x.imagem_idx === null || x.imagem_idx === undefined)) p.push(`Slide ${x.n}: layout '${x.layout}' sem imagem_idx.`);
    if (x.layout === "citacao" && !x.autor?.trim()) p.push(`Slide ${x.n}: o layout 'citacao' exige 'autor' (quem disse, e onde).`);
    if (x.rotulo && x.rotulo.length > 18) p.push(`Slide ${x.n}: rotulo com mais de 18 caracteres.`);
    if (DEFENSIVO.test(`${x.titulo} ${x.corpo}`)) p.push(`Slide ${x.n}: tom defensivo/jurídico dentro do slide ("${(DEFENSIVO.exec(`${x.titulo} ${x.corpo}`) ?? [""])[0]}"). Se o fato não está confirmado, não entra no slide; se está, afirme com a fonte.`);
    if (x.imagem_idx !== null && x.imagem_idx !== undefined && (x.imagem_idx < 0 || x.imagem_idx > totalImagens)) p.push(`Slide ${x.n}: imagem_idx ${x.imagem_idx} não existe (válidos: 0 a ${totalImagens} — ${opc.fotosReais ?? 0} foto(s) real(is) + ${(r.prompts_imagens_extras ?? []).length} extra(s) da IA).`);
    if (x.papel === "exemplo" && !x.hipotetico) p.push(`Slide ${x.n}: exemplo inventado deve ser marcado como hipotético (hipotetico = true).`);
    if (opc.tipo === "atemporal" && TEMPO_DE_NOTICIA.test(`${x.titulo} ${x.corpo}`)) p.push(`Slide ${x.n}: conteúdo atemporal não pode soar como notícia do dia (hoje/ontem/nesta semana).`);
    if (PROMESSA_DE_MATERIAL.test(`${x.titulo} ${x.corpo}`)) p.push(`Slide ${x.n}: não prometa material por mensagem ou link; essa entrega não existe.`);
    if (PROMESSA_DE_RESULTADO.test(`${x.titulo} ${x.corpo}`)) p.push(`Slide ${x.n}: remova promessa de resultado/faturamento.`);
  });

  // Mesma imagem em 3+ slides empobrece o carrossel (a referência varia a foto a cada card).
  const usoPorImagem = new Map<number, number[]>();
  s.forEach((x) => {
    if (x.imagem_idx !== null && x.imagem_idx !== undefined) usoPorImagem.set(x.imagem_idx, [...(usoPorImagem.get(x.imagem_idx) ?? []), x.n]);
  });
  for (const [idx, ns] of usoPorImagem) if (ns.length > 2) p.push(`A imagem ${idx} aparece em ${ns.length} slides (${ns.join(", ")}); use-a em no máximo 2 e peça imagens geradas (prompts_imagens_extras) para os demais.`);

  const legenda = r.legenda ?? "";
  if (legenda.length < 200) p.push("A legenda está curta demais (mín. 200 caracteres) — ela deve complementar o carrossel.");
  if (legenda.length > LIMITES.legenda) p.push(`A legenda passa de ${LIMITES.legenda} caracteres.`);
  if (contaHashtags(legenda) > LIMITES.hashtags) p.push(`A legenda passa de ${LIMITES.hashtags} hashtags.`);
  if (PROMESSA_DE_MATERIAL.test(legenda)) p.push("A legenda promete material/link que não existe.");
  for (const l of opc.cfg.identidade.cta_linhas ?? []) if (l && !normalizar(legenda).includes(normalizar(l))) p.push(`A legenda precisa terminar com a chamada fixa da conta; falta a linha "${l}".`);
  if (DEFENSIVO.test(legenda)) p.push(`A legenda tem tom defensivo ("${(DEFENSIVO.exec(legenda) ?? [""])[0]}"): conte o fato com a fonte, sem ressalvas de apuração.`);
  if (PROMESSA_DE_RESULTADO.test(legenda)) p.push("A legenda contém promessa de resultado/faturamento.");
  if (opc.tipo === "referencia") {
    // Julio, 10/11/2026: "não quero menção de nenhum deles nos posts". Os perfis de referência são pesquisa de bastidor.
    const perfis = (opc.cfg.tarde?.perfis ?? []).map((u) => u.toLowerCase());
    const textoTodo = [...s.map((x) => `${x.titulo} ${x.corpo} ${x.autor ?? ""} ${x.fonte_dado ?? ""} ${(x.itens ?? []).join(" ")}`), legenda].join("\n").toLowerCase();
    const normal = textoTodo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const u of perfis) if (normal.includes(u) || normal.includes(u.replace(/_/g, " "))) p.push(`Menção ao perfil de referência "${u}" não é permitida (slides ou legenda).`);
    if (/@[a-z0-9_.]{3,}/.test(normal)) p.push("Não cite perfis (@) no conteúdo do post das 18h.");
    if (/\b(reel|reels)\b|\b(views|visualiza[cç][oõ]es)\b|\bcurtidas\b|est[aá] (engajando|bombando|viralizando)/.test(normal)) p.push("Não fale de reel, views, curtidas ou 'está engajando': o post das 18h é na voz do mentor, sem citar a pesquisa.");
  }
  if (opc.tipo === "noticia" && opc.pauta?.fontes?.length) {
    const algumaFonte = opc.pauta.fontes.some((f) => legenda.toLowerCase().includes(f.dominio.toLowerCase()));
    if (!algumaFonte) p.push("A legenda precisa citar as fontes (domínio de pelo menos uma fonte da pauta).");
  }
  if (!temGancho(r.headline_escolhida ?? "")) p.push("A headline não tem gancho: use um número concreto (R$, %, x vezes, dias), uma pergunta direta, ou fale com o leitor (\"Dentista, …\", \"sua clínica…\", \"você…\").");
  const estiloCapa = s[0]?.estilo ?? "hiperbole";
  if (!r.prompt_imagem_capa?.trim() && !ESTILOS_SEM_IMAGEM.includes(estiloCapa)) p.push("Falta o prompt da imagem da capa.");
  // Só acusa quando o prompt PEDE texto na cena ("with text", "showing the headline"); "room for the headline" / "no text" / "text-free" são o uso certo.
  const pc = r.prompt_imagem_capa ?? "";
  if (/\b(with|showing|displaying|featuring|reads?|reading|written|include|including)\b[^.]{0,30}\b(text|letters|caption|headline|words|typography)\b/i.test(pc) && !/\b(no|without|free of)\b[^.]{0,12}\b(text|letters|words|typography)\b|text-free|room for|space for|clean (area|space)/i.test(pc)) {
    // o gerador recebe "sem texto" por regra fixa; aqui só avisamos se o prompt pedir texto na cena
    p.push("O prompt da capa parece pedir texto dentro da imagem; os textos são aplicados por código.");
  }
  if (opc.capasAnteriores?.length && !ESTILOS_SEM_IMAGEM.includes(estiloCapa)) p.push(...variedadeDaCapa(pc, opc.capasAnteriores));
  if (!["salvar", "compartilhar", "comentar", "seguir"].includes(r.chamada_final)) p.push("chamada_final inválida.");
  return p;
}

// Verificações sobre os arquivos já renderizados (para a revisão).
export function validarRender(slides: Slide[]): string[] {
  const p: string[] = [];
  for (const s of slides) {
    if (!s.url) p.push(`Slide ${s.n} sem imagem renderizada.`);
    if ((s.bytes ?? 0) > 8 * 1024 * 1024) p.push(`Slide ${s.n} passa de 8 MB.`);
  }
  return p;
}

export function normalizarRoteiro(r: Roteiro): Roteiro {
  const slides: Slide[] = (r.slides ?? []).map((s, i) => ({
    ...s,
    n: i + 1,
    titulo: (s.titulo ?? "").trim(),
    corpo: (s.corpo ?? "").trim(),
    destaque: s.destaque?.trim() || null,
    itens: (s.itens ?? []).map((x) => x.trim()).filter(Boolean),
    colunas: s.colunas ?? [],
    numeros: s.numeros ?? [],
    fonte_dado: s.fonte_dado?.trim() || null,
    rotulo: s.rotulo?.trim() || null,
    autor: s.autor?.trim() || null,
    estilo: i === 0 ? (s.estilo ?? null) : null,
    imagem_idx: s.imagem_idx ?? null,
  }));
  return { ...r, slides, legenda: (r.legenda ?? "").trim() };
}

export const mesmoTexto = (a: string, b: string) => normalizar(a) === normalizar(b);
