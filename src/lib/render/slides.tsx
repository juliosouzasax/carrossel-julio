import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import type { Slide } from "../types";
import type { Config } from "../config";
import { fontes } from "./fontes";
import { pngParaJpeg } from "./jpeg";

export const LARGURA = 1080;
export const ALTURA = 1350; // 4:5, dentro da faixa aceita pela Meta (4:5 a 1.91:1)
const MARGEM = 84; // margem segura lateral
const TOPO = 56;

export type ContextoRender = {
  total: number;
  identidade: Config["identidade"];
  imagemDataUri: string | null; // imagem-base SEM texto (gerada pela IA ou foto real da fonte)
  imagemLargura?: number | null; // dimensões reais da imagem-base (padrão 1024x1536 da IA)
  imagemAltura?: number | null;
  credito?: string | null; // "Foto: Divulgação / veículo" quando é foto real
  ilustrativo: boolean;
  mesAno: string; // ex.: "Novembro 2026"
};

// Encaixa a imagem numa caixa (como object-fit: cover), sem esticar, com o foco um pouco acima do centro.
function Imagem({ ctx, largura, altura, foco = 0.38 }: { ctx: ContextoRender; largura: number; altura: number; foco?: number }) {
  if (!ctx.imagemDataUri) return null;
  const iw = ctx.imagemLargura || 1024;
  const ih = ctx.imagemAltura || 1536;
  const escala = Math.max(largura / iw, altura / ih);
  const w = Math.ceil(iw * escala);
  const h = Math.ceil(ih * escala);
  return <img src={ctx.imagemDataUri} width={w} height={h} style={{ position: "absolute", left: Math.round((largura - w) / 2), top: -Math.round((h - altura) * foco) }} />;
}

function Credito({ texto, cor = "#A8A396" }: { texto: string | null | undefined; cor?: string }) {
  if (!texto) return null;
  return <div style={{ display: "flex", marginTop: 10, fontFamily: "Archivo", fontWeight: 500, fontSize: 19, color: cor }}>{texto}</div>;
}

type Tema = "claro" | "escuro";
type Paleta = { bg: string; fg: string; ouro: string; apagado: string; cartao: string; tema: Tema };

// Fundo claro ou escuro por tipo de slide (alternância no estilo editorial). A capa é sempre escura.
const TEMA_DO_LAYOUT: Record<Slide["layout"], Tema> = {
  capa: "escuro",
  foto: "claro",
  foto_escura: "escuro",
  citacao: "escuro",
  tese: "escuro",
  texto: "claro",
  imagem: "escuro",
  destaque: "escuro",
  lista: "escuro",
  comparativo: "claro",
  checklist: "escuro",
  dados: "claro",
  cta: "claro",
};

export function paleta(id: ContextoRender["identidade"], layout: Slide["layout"]): Paleta {
  const tema = TEMA_DO_LAYOUT[layout];
  return tema === "escuro"
    ? { tema, bg: layout === "capa" ? id.capa_escura : id.escuro, fg: id.texto_no_escuro, ouro: id.dourado, apagado: id.apagado_no_escuro, cartao: id.cartao_escuro }
    : { tema, bg: id.claro, fg: id.texto_no_claro, ouro: id.dourado_no_claro, apagado: id.apagado_no_claro, cartao: "#FFFFFF" };
}

type Palavra = { t: string; d: boolean };

const limpa = (p: string) => p.toLowerCase().replace(/[.,;:!?"“”'()]/g, "");

export function palavrasComDestaque(titulo: string, destaque: string | null): Palavra[] {
  const palavras = titulo.split(/\s+/).filter(Boolean);
  const chave = palavras.map(limpa);
  const seq = (destaque ?? "").split(/\s+/).map(limpa).filter(Boolean);
  // Destaque é um TRECHO contínuo do título: só aquela sequência fica dourada (um "de" solto em outro lugar, não).
  if (seq.length) {
    for (let i = 0; i + seq.length <= chave.length; i++) {
      if (seq.every((w, k) => chave[i + k] === w)) return palavras.map((t, j) => ({ t, d: j >= i && j < i + seq.length }));
    }
    // Não achou a sequência exata (pontuação/variação): cai no casamento por palavra, ignorando palavras de 1–2 letras.
    const alvo = new Set(seq.filter((w) => w.length > 2));
    if (alvo.size) return palavras.map((t) => ({ t, d: alvo.has(limpa(t)) }));
  }
  // Sem destaque informado, as duas últimas palavras vão em dourado, como na manchete de referência.
  const ultimas = new Set(palavras.length > 2 ? palavras.slice(-2).map(limpa) : []);
  return palavras.map((t) => ({ t, d: ultimas.has(limpa(t)) }));
}

export function tamanhoManchete(t: string, capa: boolean): number {
  const n = t.length;
  if (capa) return n <= 20 ? 152 : n <= 32 ? 130 : n <= 46 ? 112 : n <= 62 ? 96 : 82;
  return n <= 24 ? 120 : n <= 40 ? 100 : n <= 60 ? 84 : 70;
}

export function tamanhoSerifa(t: string): number {
  const n = t.length;
  return n <= 60 ? 70 : n <= 100 ? 60 : n <= 150 ? 52 : 44;
}

export function tamanhoCorpo(t: string): number {
  const n = t.length;
  return n <= 120 ? 42 : n <= 190 ? 38 : n <= 260 ? 34 : 30;
}

function Manchete({ palavras, tamanho, p }: { palavras: Palavra[]; tamanho: number; p: Paleta }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
      {palavras.map((w, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            marginRight: Math.round(tamanho * 0.2),
            color: w.d ? p.ouro : p.fg,
            fontFamily: "Anton",
            fontWeight: 400,
            fontSize: tamanho,
            lineHeight: 1.1,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {w.t}
        </div>
      ))}
    </div>
  );
}

function Serifa({ palavras, tamanho, cor, ouro, negrito = false }: { palavras: Palavra[]; tamanho: number; cor: string; ouro: string; negrito?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
      {palavras.map((w, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            marginRight: Math.round(tamanho * 0.28),
            color: w.d ? ouro : cor,
            fontFamily: "PT Serif",
            fontStyle: w.d ? "italic" : "normal",
            fontWeight: negrito ? 700 : 400,
            fontSize: tamanho,
            lineHeight: 1.18,
          }}
        >
          {w.t}
        </div>
      ))}
    </div>
  );
}

function Kicker({ ctx, p, sobreFoto = false }: { ctx: ContextoRender; p: Paleta; sobreFoto?: boolean }) {
  const id = ctx.identidade;
  const estilo = { display: "flex", fontFamily: "Archivo", fontWeight: 600, fontSize: 21, letterSpacing: 1, color: p.apagado, ...(sobreFoto ? { textShadow: "0 1px 8px rgba(0,0,0,0.75)" } : {}) } as const;
  return (
    <div style={{ display: "flex", width: "100%", alignItems: "center", paddingTop: TOPO }}>
      <div style={{ display: "flex", flex: 1, justifyContent: "flex-start" }}>
        <div style={estilo}>{id.kicker_esquerda}</div>
      </div>
      <div style={{ display: "flex", flex: 1, justifyContent: "center" }}>
        <div style={estilo}>{id.kicker_centro}</div>
      </div>
      <div style={{ display: "flex", flex: 1, justifyContent: "flex-end" }}>
        <div style={estilo}>{ctx.mesAno} ®</div>
      </div>
    </div>
  );
}

function Rodape({ n, total, ctx, p }: { n: number; total: number; ctx: ContextoRender; p: Paleta }) {
  const estilo = { display: "flex", fontFamily: "Archivo", fontWeight: 800, fontSize: 22, letterSpacing: 3, color: p.apagado, textTransform: "uppercase" } as const;
  return (
    <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
      <div style={estilo}>{ctx.identidade.assinatura}</div>
      <div style={{ ...estilo, letterSpacing: 2 }}>
        {String(n).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>
    </div>
  );
}

function Moldura({ ctx, p, n, children, centro = false, semRodape = false }: { ctx: ContextoRender; p: Paleta; n: number; children: ReactNode; centro?: boolean; semRodape?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, background: p.bg, position: "relative", paddingLeft: MARGEM, paddingRight: MARGEM }}>
      <Kicker ctx={ctx} p={p} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: centro ? "center" : "flex-start", paddingTop: centro ? 0 : 70, paddingBottom: 30 }}>{children}</div>
      {semRodape ? null : (
        <div style={{ display: "flex", paddingBottom: 56 }}>
          <Rodape n={n} total={ctx.total} ctx={ctx} p={p} />
        </div>
      )}
    </div>
  );
}

function Barra({ p, largura = 110 }: { p: Paleta; largura?: number }) {
  return <div style={{ display: "flex", width: largura, height: 8, background: p.ouro, marginBottom: 30, borderRadius: 4 }} />;
}

function Pilula({ texto, p }: { texto: string; p: Paleta }) {
  return (
    <div style={{ display: "flex", alignSelf: "flex-start", border: `2px solid ${p.ouro}`, color: p.ouro, fontFamily: "Archivo", fontWeight: 800, fontSize: 22, letterSpacing: 3, padding: "8px 18px", borderRadius: 40, marginBottom: 28 }}>
      {texto}
    </div>
  );
}

function Corpo({ texto, p, tamanho }: { texto: string; p: Paleta; tamanho?: number }) {
  if (!texto) return null;
  return (
    <div style={{ display: "flex", marginTop: 34, fontFamily: "Archivo", fontWeight: 500, fontSize: tamanho ?? tamanhoCorpo(texto), lineHeight: 1.32, color: p.tema === "escuro" ? "#DAD5C8" : "#2A2A2E" }}>
      {texto}
    </div>
  );
}

// Assinatura do autor no topo do cartão claro (iniciais em círculo dourado + nome + conta), como nos cartões de notícia do nicho.
function Autor({ ctx, cor, apagado, ouro }: { ctx: ContextoRender; cor: string; apagado: string; ouro: string }) {
  const nome = ctx.identidade.assinatura;
  const ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("");
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 74, height: 74, borderRadius: 37, background: ouro, color: "#FFFFFF", fontFamily: "Anton", fontSize: 32, letterSpacing: 1 }}>{ini}</div>
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
        <div style={{ display: "flex", fontFamily: "Archivo", fontWeight: 800, fontSize: 30, color: cor }}>{nome}</div>
        <div style={{ display: "flex", fontFamily: "Archivo", fontWeight: 500, fontSize: 22, color: apagado }}>{ctx.identidade.conta}</div>
      </div>
    </div>
  );
}

function tamanhoCartao(t: string): number {
  const n = t.length;
  return n <= 36 ? 84 : n <= 52 ? 74 : n <= 70 ? 64 : 56;
}

// CAPA CARTÃO (claro): assinatura, headline preta com destaque dourado, subline sublinhada, imagem em caixa arredondada.
function CapaCartao({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "foto");
  const alturaFoto = 640;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, background: p.bg, position: "relative", paddingLeft: MARGEM, paddingRight: MARGEM }}>
      <Kicker ctx={ctx} p={p} />
      <div style={{ display: "flex", marginTop: 54 }}>
        <Autor ctx={ctx} cor={p.fg} apagado={p.apagado} ouro={p.ouro} />
      </div>
      <div style={{ display: "flex", marginTop: 40 }}>
        <Lider palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={tamanhoCartao(slide.titulo)} cor={p.fg} ouro={p.ouro} />
      </div>
      {slide.corpo ? <div style={{ display: "flex", marginTop: 26, fontFamily: "Archivo", fontWeight: 600, fontSize: 34, lineHeight: 1.25, color: "#2A2A2E", textDecoration: "underline" }}>{slide.corpo}</div> : null}
      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", position: "relative", width: LARGURA - 2 * MARGEM, height: alturaFoto, borderRadius: 28, overflow: "hidden", background: ctx.identidade.escuro }}>
        <Imagem ctx={ctx} largura={LARGURA - 2 * MARGEM} altura={alturaFoto} foco={0.45} />
      </div>
      <div style={{ display: "flex", paddingTop: 30, paddingBottom: 56 }}>
        <Rodape n={slide.n} total={ctx.total} ctx={ctx} p={p} />
      </div>
    </div>
  );
}

// CAPA TIPOGRAFIA (claro): só a manchete, gigante, com o trecho-chave em dourado e uma seta; nenhuma imagem.
function CapaTipografia({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "texto");
  const tam = Math.min(tamanhoManchete(slide.titulo, true) + 10, 150);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, background: p.bg, position: "relative", paddingLeft: MARGEM, paddingRight: MARGEM }}>
      <Kicker ctx={ctx} p={p} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", width: 120, height: 10, background: p.ouro, marginBottom: 44 }} />
        <Manchete palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={tam} p={p} />
        {slide.corpo ? <div style={{ display: "flex", marginTop: 40, fontFamily: "Archivo", fontWeight: 600, fontSize: 36, lineHeight: 1.25, color: "#2A2A2E", textDecoration: "underline" }}>{slide.corpo}</div> : null}
        <div style={{ display: "flex", marginTop: 60, fontFamily: "Anton", fontSize: 120, lineHeight: 0.9, color: p.fg }}>→</div>
      </div>
      <div style={{ display: "flex", paddingBottom: 56 }}>
        <Rodape n={slide.n} total={ctx.total} ctx={ctx} p={p} />
      </div>
    </div>
  );
}

function Etiqueta({ texto, bg, cor }: { texto: string | null | undefined; bg: string; cor: string }) {
  if (!texto) return null;
  return <div style={{ display: "flex", alignSelf: "flex-start", padding: "8px 18px", borderRadius: 8, background: bg, color: cor, fontFamily: "Archivo", fontWeight: 800, fontSize: 20, letterSpacing: 2, textTransform: "uppercase" }}>{texto}</div>;
}

// CAPA CAIXA: foto do assunto inteira + caixa clara colada no rodapé com a headline (o cartão de portal de negócios).
function CapaCaixa({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "foto");
  const tam = slide.titulo.length <= 50 ? 56 : slide.titulo.length <= 70 ? 50 : 44;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, position: "relative", background: ctx.identidade.escuro }}>
      <Imagem ctx={ctx} largura={LARGURA} altura={ALTURA} foco={0.3} />
      <div style={{ position: "absolute", top: 0, left: 0, width: LARGURA, height: 260, display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)" }} />
      <div style={{ position: "absolute", top: 0, left: MARGEM, right: MARGEM, display: "flex" }}>
        <Kicker ctx={ctx} p={{ ...p, apagado: "#E6E0D2" }} sobreFoto />
      </div>
      <div style={{ position: "absolute", left: 48, right: 48, bottom: 48, display: "flex", flexDirection: "column", background: p.bg, borderRadius: 24, padding: "40px 44px 34px 44px" }}>
        <Etiqueta texto={slide.rotulo} bg={p.ouro} cor="#FFFFFF" />
        <div style={{ display: "flex", marginTop: slide.rotulo ? 22 : 0 }}>
          <Lider palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={tam} cor={p.fg} ouro={p.ouro} />
        </div>
        {slide.corpo ? <div style={{ display: "flex", marginTop: 18, fontFamily: "Archivo", fontWeight: 500, fontSize: 28, lineHeight: 1.3, color: "#4A4842" }}>{slide.corpo}</div> : null}
        <div style={{ display: "flex", marginTop: 28, justifyContent: "space-between", alignItems: "center", fontFamily: "Archivo", fontWeight: 700, fontSize: 21, letterSpacing: 1, color: p.apagado }}>
          <div style={{ display: "flex" }}>{ctx.identidade.conta}</div>
          <div style={{ display: "flex" }}>01 / {String(ctx.total).padStart(2, "0")}</div>
        </div>
      </div>
    </div>
  );
}

// CAPA BLOCO: fundo dourado chapado, imagem numa moldura torta no meio (recorte/adesivo), headline preta no rodapé.
function CapaBloco({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const id = ctx.identidade;
  const p: Paleta = { tema: "claro", bg: id.dourado, fg: id.texto_no_claro, ouro: "#FFFFFF", apagado: "#5A4718", cartao: "#FFFFFF" };
  const molduraW = 720, molduraH = 560;
  const tam = slide.titulo.length <= 40 ? 72 : slide.titulo.length <= 60 ? 62 : 54;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, position: "relative", background: p.bg, paddingLeft: MARGEM, paddingRight: MARGEM }}>
      <Kicker ctx={ctx} p={p} />
      <div style={{ display: "flex", marginTop: 40 }}>
        <Etiqueta texto={slide.rotulo} bg={id.escuro} cor="#FFFFFF" />
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", position: "relative", width: molduraW, height: molduraH, borderRadius: 18, overflow: "hidden", background: id.escuro, transform: "rotate(-4deg)", boxShadow: "0 30px 60px rgba(0,0,0,0.25)", border: "14px solid #FFFFFF" }}>
          <Imagem ctx={ctx} largura={molduraW - 28} altura={molduraH - 28} foco={0.4} />
        </div>
      </div>
      <div style={{ display: "flex", marginBottom: 40 }}>
        <Lider palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={tam} cor={p.fg} ouro={p.ouro} />
      </div>
      <div style={{ display: "flex", paddingBottom: 56 }}>
        <Rodape n={slide.n} total={ctx.total} ctx={ctx} p={p} />
      </div>
    </div>
  );
}

// CAPA REPETIÇÃO: o trecho-chave repetido linha após linha em dourado, headline completa pequena embaixo.
function CapaRepeticao({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "tese");
  const frase = (slide.destaque && slide.destaque.length <= 30 ? slide.destaque : slide.titulo.split(/\s+/).slice(0, 4).join(" ")).toUpperCase();
  const linhas = 9;
  const tam = frase.length <= 12 ? 96 : frase.length <= 20 ? 78 : 62;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, position: "relative", background: ctx.identidade.capa_escura, paddingLeft: MARGEM, paddingRight: MARGEM }}>
      <Kicker ctx={ctx} p={p} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
        {Array.from({ length: linhas }).map((_, i) => {
          const d = Math.abs(i - Math.floor(linhas / 2));
          return (
            <div key={i} style={{ display: "flex", fontFamily: "Anton", fontSize: tam, lineHeight: 1.0, letterSpacing: 1, color: d === 0 ? ctx.identidade.creme_serifa : p.ouro, opacity: d === 0 ? 1 : Math.max(0.18, 1 - d * 0.22) }}>{frase}</div>
          );
        })}
        <div style={{ display: "flex", marginTop: 44, fontFamily: "Archivo", fontWeight: 600, fontSize: 36, lineHeight: 1.25, color: p.fg }}>{slide.titulo}</div>
      </div>
      <div style={{ display: "flex", paddingBottom: 56 }}>
        <Rodape n={slide.n} total={ctx.total} ctx={ctx} p={p} />
      </div>
    </div>
  );
}

function Capa({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  if (slide.estilo === "caixa" && ctx.imagemDataUri) return <CapaCaixa slide={slide} ctx={ctx} />;
  if (slide.estilo === "bloco" && ctx.imagemDataUri) return <CapaBloco slide={slide} ctx={ctx} />;
  if (slide.estilo === "repeticao") return <CapaRepeticao slide={slide} ctx={ctx} />;
  if (slide.estilo === "cartao" && ctx.imagemDataUri) return <CapaCartao slide={slide} ctx={ctx} />;
  if (slide.estilo === "tipografia") return <CapaTipografia slide={slide} ctx={ctx} />;
  const p = paleta(ctx.identidade, "capa");
  const id = ctx.identidade;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, position: "relative", background: p.bg }}>
      {ctx.imagemDataUri ? (
        <Imagem ctx={ctx} largura={LARGURA} altura={ALTURA} foco={0.4} />
      ) : (
        <div style={{ position: "absolute", top: 0, left: 0, width: LARGURA, height: ALTURA, display: "flex", background: `radial-gradient(circle at 70% 30%, #2a2214 0%, ${p.bg} 70%)` }} />
      )}
      <div style={{ position: "absolute", top: 0, left: 0, width: LARGURA, height: ALTURA, display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 24%, rgba(0,0,0,0.70) 58%, rgba(0,0,0,0.97) 100%)" }} />
      <div style={{ position: "absolute", top: 0, left: MARGEM, right: MARGEM, display: "flex" }}>
        <Kicker ctx={ctx} p={{ ...p, apagado: "#E6E0D2" }} sobreFoto />
      </div>
      <div style={{ position: "absolute", left: MARGEM, right: MARGEM, bottom: 150, display: "flex", flexDirection: "column" }}>
        <Manchete palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={tamanhoManchete(slide.titulo, true)} p={p} />
        {slide.corpo ? (
          <div style={{ display: "flex", alignItems: "center", marginTop: 34, fontFamily: "Archivo", fontWeight: 800, fontSize: 27, letterSpacing: 3, color: p.fg, textTransform: "uppercase" }}>
            <div style={{ display: "flex", color: p.ouro, marginRight: 14 }}>→</div>
            {slide.corpo}
          </div>
        ) : null}
      </div>
      <div style={{ position: "absolute", left: MARGEM, right: MARGEM, bottom: 56, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontFamily: "Archivo", fontWeight: 600, fontSize: 22, letterSpacing: 1, color: "#CFC9BA" }}>{ctx.credito ? ctx.credito : ctx.ilustrativo ? id.rotulo_ilustracao : ""}</div>
        <div style={{ display: "flex", fontFamily: "Archivo", fontWeight: 800, fontSize: 22, letterSpacing: 3, color: p.ouro, textTransform: "uppercase" }}>01 / {String(ctx.total).padStart(2, "0")}</div>
      </div>
    </div>
  );
}

// Frase-líder em negrito (Archivo 800) com o trecho-chave em dourado — o padrão dos cards de história.
function Lider({ palavras, tamanho, cor, ouro }: { palavras: Palavra[]; tamanho: number; cor: string; ouro: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
      {palavras.map((w, i) => (
        <div key={i} style={{ display: "flex", marginRight: Math.round(tamanho * 0.26), color: w.d ? ouro : cor, fontFamily: "Archivo", fontWeight: 800, fontSize: tamanho, lineHeight: 1.16, letterSpacing: -0.5 }}>
          {w.t}
        </div>
      ))}
    </div>
  );
}

function tamanhoLider(t: string): number {
  const n = t.length;
  return n <= 60 ? 50 : n <= 90 ? 44 : n <= 120 ? 40 : 36;
}

function Rotulo({ texto, p, claro = false }: { texto: string | null | undefined; p: Paleta; claro?: boolean }) {
  if (!texto) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
      <div style={{ display: "flex", width: 36, height: 3, background: p.ouro, marginRight: 14 }} />
      <div style={{ display: "flex", fontFamily: "Archivo", fontWeight: 800, fontSize: 22, letterSpacing: 4, color: claro ? "#CFC9BA" : p.ouro, textTransform: "uppercase" }}>{texto}</div>
      <div style={{ display: "flex", width: 36, height: 3, background: p.ouro, marginLeft: 14 }} />
    </div>
  );
}

// Divide o corpo em parágrafos: o primeiro sai maior, os seguintes menores (como nos cards de referência).
function Paragrafos({ texto, cor, corSecundaria, tamanho }: { texto: string; cor: string; corSecundaria: string; tamanho: number }) {
  const partes = texto.split(/\n+/).map((t) => t.trim()).filter(Boolean);
  if (!partes.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {partes.map((t, i) => (
        <div key={i} style={{ display: "flex", marginTop: i === 0 ? 0 : 18, fontFamily: "Archivo", fontWeight: 500, fontSize: i === 0 ? tamanho : Math.max(tamanho - 4, 26), lineHeight: 1.34, color: i === 0 ? cor : corSecundaria }}>
          {t}
        </div>
      ))}
    </div>
  );
}

function FotoRecortada({ ctx, altura, topoEscuro = true, bgFinal }: { ctx: ContextoRender; altura: number; topoEscuro?: boolean; bgFinal?: string }) {
  // A imagem ocupa a caixa inteira (recorte "cover", sem esticar); o topo ganha um véu para o kicker ficar legível.
  return (
    <div style={{ display: "flex", position: "relative", width: LARGURA, height: altura, overflow: "hidden" }}>
      <Imagem ctx={ctx} largura={LARGURA} altura={altura} />
      <div style={{ position: "absolute", top: 0, left: 0, width: LARGURA, height: altura, display: "flex", background: `linear-gradient(180deg, rgba(0,0,0,${topoEscuro ? 0.62 : 0}) 0%, rgba(0,0,0,${topoEscuro ? 0.3 : 0}) 16%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 78%, ${bgFinal ?? "rgba(0,0,0,0)"} 100%)` }} />
    </div>
  );
}

// FOTO (claro): imagem em cima, painel claro embaixo com frase-líder + parágrafos. O card mais usado da referência.
function Foto({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "foto");
  const alturaFoto = 620;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, background: p.bg, position: "relative" }}>
      {ctx.imagemDataUri ? <FotoRecortada ctx={ctx} altura={alturaFoto} /> : <div style={{ display: "flex", width: LARGURA, height: alturaFoto, background: ctx.identidade.escuro }} />}
      <div style={{ position: "absolute", top: 0, left: MARGEM, right: MARGEM, display: "flex" }}>
        <Kicker ctx={ctx} p={{ ...p, apagado: "#E6E0D2" }} sobreFoto />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingLeft: MARGEM, paddingRight: MARGEM, paddingTop: 44 }}>
        <Rotulo texto={slide.rotulo} p={p} />
        {slide.hipotetico && !slide.rotulo ? <Pilula texto="EXEMPLO HIPOTÉTICO" p={p} /> : null}
        <Lider palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={tamanhoLider(slide.titulo)} cor={p.fg} ouro={p.ouro} />
        <div style={{ display: "flex", marginTop: 26 }}>
          <Paragrafos texto={slide.corpo} cor="#2A2A2E" corSecundaria="#4A4842" tamanho={Math.min(tamanhoCorpo(slide.corpo), 32)} />
        </div>
        {slide.fonte_dado ? <div style={{ display: "flex", marginTop: 20, fontFamily: "Archivo", fontWeight: 600, fontSize: 21, color: p.apagado }}>Fonte: {slide.fonte_dado}</div> : null}
        <Credito texto={ctx.credito} cor={p.apagado} />
      </div>
      <div style={{ display: "flex", paddingLeft: MARGEM, paddingRight: MARGEM, paddingBottom: 56 }}>
        <Rodape n={slide.n} total={ctx.total} ctx={ctx} p={p} />
      </div>
    </div>
  );
}

// FOTO ESCURA: imagem inteira, gradiente para preto, texto na metade de baixo.
function FotoEscura({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "foto_escura");
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, position: "relative", background: ctx.identidade.capa_escura }}>
      <Imagem ctx={ctx} largura={LARGURA} altura={ALTURA} foco={0.3} />
      <div style={{ position: "absolute", top: 0, left: 0, width: LARGURA, height: ALTURA, display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.0) 22%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.96) 100%)" }} />
      <div style={{ position: "absolute", top: 0, left: MARGEM, right: MARGEM, display: "flex" }}>
        <Kicker ctx={ctx} p={{ ...p, apagado: "#E6E0D2" }} sobreFoto />
      </div>
      <div style={{ position: "absolute", left: MARGEM, right: MARGEM, bottom: 140, display: "flex", flexDirection: "column" }}>
        <Rotulo texto={slide.rotulo} p={p} claro />
        {slide.hipotetico && !slide.rotulo ? <Pilula texto="EXEMPLO HIPOTÉTICO" p={p} /> : null}
        <Lider palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={tamanhoLider(slide.titulo)} cor="#FFFFFF" ouro={p.ouro} />
        <div style={{ display: "flex", marginTop: 24 }}>
          <Paragrafos texto={slide.corpo} cor="#E8E3D6" corSecundaria="#C9C3B4" tamanho={Math.min(tamanhoCorpo(slide.corpo), 31)} />
        </div>
        {slide.fonte_dado ? <div style={{ display: "flex", marginTop: 18, fontFamily: "Archivo", fontWeight: 600, fontSize: 21, color: "#A8A396" }}>Fonte: {slide.fonte_dado}</div> : null}
        <Credito texto={ctx.credito} />
      </div>
      <div style={{ position: "absolute", left: MARGEM, right: MARGEM, bottom: 56, display: "flex" }}>
        <Rodape n={slide.n} total={ctx.total} ctx={ctx} p={{ ...p, apagado: "#CFC9BA" }} />
      </div>
    </div>
  );
}

// CITAÇÃO: foto em cima e um cartão sobreposto com a frase em serifa, autor e contexto.
function Citacao({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "citacao");
  const alturaFoto = 700;
  const frase = slide.titulo.replace(/^["“”']+|["“”']+$/g, "");
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, position: "relative", background: p.bg }}>
      {ctx.imagemDataUri ? <FotoRecortada ctx={ctx} altura={alturaFoto} bgFinal={p.bg} /> : <div style={{ display: "flex", width: LARGURA, height: alturaFoto, background: p.bg }} />}
      <div style={{ position: "absolute", top: 0, left: MARGEM, right: MARGEM, display: "flex" }}>
        <Kicker ctx={ctx} p={{ ...p, apagado: "#E6E0D2" }} sobreFoto />
      </div>
      <div style={{ position: "absolute", left: 56, right: 56, top: 500, display: "flex", flexDirection: "column", background: "#F6F2E8", borderRadius: 26, padding: "44px 46px 40px", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
        <Rotulo texto={slide.rotulo} p={{ ...p, ouro: ctx.identidade.dourado_no_claro }} />
        <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
          <div style={{ display: "flex", fontFamily: "PT Serif", fontSize: Math.min(tamanhoSerifa(frase), 54), lineHeight: 1.18, color: ctx.identidade.dourado_no_claro, marginRight: 6 }}>“</div>
          {palavrasComDestaque(frase, slide.destaque).map((w, i) => (
            <div key={i} style={{ display: "flex", marginRight: 12, fontFamily: "PT Serif", fontStyle: w.d ? "italic" : "normal", fontSize: Math.min(tamanhoSerifa(frase), 54), lineHeight: 1.18, color: w.d ? ctx.identidade.dourado_no_claro : "#101014" }}>
              {w.t}
            </div>
          ))}
          <div style={{ display: "flex", fontFamily: "PT Serif", fontSize: Math.min(tamanhoSerifa(frase), 54), lineHeight: 1.18, color: ctx.identidade.dourado_no_claro }}>”</div>
        </div>
        {slide.autor ? <div style={{ display: "flex", marginTop: 26, fontFamily: "Archivo", fontWeight: 800, fontSize: 26, lineHeight: 1.25, color: "#101014" }}>{slide.autor}</div> : null}
        {slide.fonte_dado ? <div style={{ display: "flex", marginTop: 6, fontFamily: "Archivo", fontWeight: 500, fontSize: 21, color: "#6F6A5E" }}>{slide.fonte_dado}</div> : null}
        <Credito texto={ctx.credito} cor="#8A857A" />
        {slide.corpo ? (
          <div style={{ display: "flex", marginTop: 26, paddingTop: 22, borderTop: "2px solid #DDD6C6" }}>
            <Paragrafos texto={slide.corpo} cor="#2A2A2E" corSecundaria="#4A4842" tamanho={Math.min(tamanhoCorpo(slide.corpo), 29)} />
          </div>
        ) : null}
      </div>
      <div style={{ position: "absolute", left: MARGEM, right: MARGEM, bottom: 56, display: "flex" }}>
        <Rodape n={slide.n} total={ctx.total} ctx={ctx} p={p} />
      </div>
    </div>
  );
}

function Tese({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "tese");
  return (
    <Moldura ctx={ctx} p={p} n={slide.n} centro>
      {slide.hipotetico ? <Pilula texto="EXEMPLO HIPOTÉTICO" p={p} /> : null}
      <Serifa palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={tamanhoSerifa(slide.titulo)} cor={ctx.identidade.creme_serifa} ouro={p.ouro} />
      {slide.corpo ? (
        <div style={{ display: "flex", marginTop: 46, fontFamily: "Archivo", fontWeight: 600, fontSize: tamanhoCorpo(slide.corpo), lineHeight: 1.32, color: "#FFFFFF" }}>{slide.corpo}</div>
      ) : null}
    </Moldura>
  );
}

function Texto({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "texto");
  return (
    <Moldura ctx={ctx} p={p} n={slide.n} centro>
      {slide.hipotetico ? <Pilula texto="EXEMPLO HIPOTÉTICO" p={p} /> : null}
      <Manchete palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={tamanhoManchete(slide.titulo, false)} p={p} />
      <div style={{ display: "flex", width: "100%", height: 6, background: p.fg, marginTop: 30, opacity: 0.9 }} />
      <Corpo texto={slide.corpo} p={p} />
    </Moldura>
  );
}

function ComImagem({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "imagem");
  const alturaImagem = 560;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: LARGURA, height: ALTURA, background: p.bg, position: "relative" }}>
      {ctx.imagemDataUri ? (
        <div style={{ display: "flex", position: "relative", width: LARGURA, height: alturaImagem, overflow: "hidden" }}>
          <Imagem ctx={ctx} largura={LARGURA} altura={alturaImagem} foco={0.5} />
          <div style={{ position: "absolute", top: 0, left: 0, width: LARGURA, height: alturaImagem, display: "flex", background: `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 30%, ${p.bg} 100%)` }} />
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 0, left: MARGEM, right: MARGEM, display: "flex" }}>
        <Kicker ctx={ctx} p={{ ...p, apagado: "#E6E0D2" }} sobreFoto />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingLeft: MARGEM, paddingRight: MARGEM, paddingTop: ctx.imagemDataUri ? 6 : 150 }}>
        {slide.hipotetico ? <Pilula texto="EXEMPLO HIPOTÉTICO" p={p} /> : null}
        <Manchete palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={Math.min(tamanhoManchete(slide.titulo, false), 92)} p={p} />
        <Corpo texto={slide.corpo} p={p} tamanho={Math.min(tamanhoCorpo(slide.corpo), 36)} />
      </div>
      <div style={{ display: "flex", paddingLeft: MARGEM, paddingRight: MARGEM, paddingBottom: 56 }}>
        <Rodape n={slide.n} total={ctx.total} ctx={ctx} p={p} />
      </div>
    </div>
  );
}

function Destaque({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "destaque");
  return (
    <Moldura ctx={ctx} p={p} n={slide.n} centro>
      <div style={{ display: "flex", fontFamily: "Anton", fontSize: 220, lineHeight: 0.7, color: p.ouro, marginBottom: 24 }}>“</div>
      <Serifa palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={Math.max(tamanhoSerifa(slide.titulo) + 8, 56)} cor={ctx.identidade.creme_serifa} ouro={p.ouro} negrito />
      <Corpo texto={slide.corpo} p={p} tamanho={Math.min(tamanhoCorpo(slide.corpo), 36)} />
    </Moldura>
  );
}

function Lista({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "lista");
  const itens = (slide.itens?.length ? slide.itens : slide.corpo.split(/\n+/)).map((l) => l.replace(/^[-•\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 6);
  const tam = itens.length > 4 ? 32 : 36;
  return (
    <Moldura ctx={ctx} p={p} n={slide.n} centro>
      <Barra p={p} />
      <Manchete palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={Math.min(tamanhoManchete(slide.titulo, false), 100)} p={p} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
        {itens.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: 26 }}>
            <div style={{ display: "flex", width: 84, fontFamily: "PT Serif", fontWeight: 700, fontSize: 58, lineHeight: 1, color: p.ouro }}>{i + 1}</div>
            <div style={{ display: "flex", flex: 1, fontFamily: "Archivo", fontWeight: 600, fontSize: tam, lineHeight: 1.26, color: p.fg, paddingTop: 6 }}>{l}</div>
          </div>
        ))}
      </div>
    </Moldura>
  );
}

function Comparativo({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "comparativo");
  const cols = (slide.colunas ?? []).slice(0, 2);
  return (
    <Moldura ctx={ctx} p={p} n={slide.n} centro>
      <div style={{ display: "flex", flexWrap: "wrap", width: "100%", marginBottom: 40 }}>
        {slide.titulo.split(/\s+/).map((w, i) => (
          <div key={i} style={{ display: "flex", marginRight: 10, fontFamily: "PT Serif", fontWeight: 700, fontSize: Math.min(tamanhoSerifa(slide.titulo), 62), lineHeight: 1.12, textTransform: "uppercase", color: p.fg }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", width: "100%" }}>
        {cols.map((c, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, marginRight: i === 0 ? 24 : 0 }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "18px 10px", background: i === 0 ? p.fg : p.ouro, color: i === 0 ? ctx.identidade.claro : "#FFFFFF", fontFamily: "Anton", fontSize: 40, textTransform: "uppercase", letterSpacing: 1 }}>{c.titulo}</div>
            {c.itens.slice(0, 4).map((it, j) => (
              <div key={j} style={{ display: "flex", padding: "20px 8px", borderBottom: `2px solid ${p.apagado}`, fontFamily: "Archivo", fontWeight: 600, fontSize: 30, lineHeight: 1.22, color: p.fg }}>
                {it}
              </div>
            ))}
          </div>
        ))}
      </div>
      {slide.corpo ? <div style={{ display: "flex", marginTop: 44, fontFamily: "PT Serif", fontWeight: 700, fontSize: Math.min(tamanhoCorpo(slide.corpo) + 4, 42), lineHeight: 1.22, color: p.fg }}>{slide.corpo}</div> : null}
    </Moldura>
  );
}

function Checklist({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "checklist");
  const itens = (slide.itens ?? []).slice(0, 5);
  return (
    <Moldura ctx={ctx} p={p} n={slide.n} centro>
      <Serifa palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={Math.min(tamanhoSerifa(slide.titulo) + 4, 64)} cor={ctx.identidade.creme_serifa} ouro={p.ouro} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40, background: p.cartao, borderRadius: 28, padding: "40px 44px" }}>
        {itens.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: i === itens.length - 1 ? 0 : 28 }}>
            <div style={{ display: "flex", width: 56, fontFamily: "Archivo", fontWeight: 800, fontSize: 36, color: p.ouro }}>→</div>
            <div style={{ display: "flex", flex: 1, fontFamily: "Archivo", fontWeight: 600, fontSize: 34, lineHeight: 1.24, color: "#FFFFFF" }}>{l}</div>
          </div>
        ))}
      </div>
      {slide.corpo ? <div style={{ display: "flex", marginTop: 40, fontFamily: "PT Serif", fontStyle: "italic", fontSize: 42, lineHeight: 1.22, color: ctx.identidade.creme_serifa, textDecoration: "underline" }}>{slide.corpo}</div> : null}
    </Moldura>
  );
}

function Dados({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "dados");
  const nums = (slide.numeros ?? []).slice(0, 2);
  return (
    <Moldura ctx={ctx} p={p} n={slide.n} centro>
      <Manchete palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={Math.min(tamanhoManchete(slide.titulo, false), 100)} p={p} />
      <div style={{ display: "flex", width: "100%", marginTop: 56, marginBottom: 20 }}>
        {nums.map((n, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, marginRight: i === 0 ? 28 : 0, padding: "34px 30px", background: "#FFFFFF", border: `3px solid ${p.fg}`, borderRadius: 24, transform: `rotate(${i === 0 ? -2 : 2}deg)` }}>
            <div style={{ display: "flex", fontFamily: "Anton", fontSize: 112, lineHeight: 1, color: p.ouro }}>{n.valor}</div>
            <div style={{ display: "flex", marginTop: 14, fontFamily: "Archivo", fontWeight: 600, fontSize: 28, lineHeight: 1.22, color: p.fg }}>{n.rotulo}</div>
          </div>
        ))}
      </div>
      <Corpo texto={slide.corpo} p={p} tamanho={Math.min(tamanhoCorpo(slide.corpo), 36)} />
      {slide.fonte_dado ? <div style={{ display: "flex", marginTop: 26, fontFamily: "Archivo", fontWeight: 500, fontSize: 22, color: p.apagado }}>Fonte: {slide.fonte_dado}</div> : null}
    </Moldura>
  );
}

// Fechamento: título curto do redator + as linhas FIXAS da conta (identidade.cta_linhas). Corpo do redator é ignorado.
function Cta({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  const p = paleta(ctx.identidade, "cta");
  const linhas = (ctx.identidade.cta_linhas ?? []).filter(Boolean).slice(0, 4);
  return (
    <Moldura ctx={ctx} p={p} n={slide.n} centro>
      <Barra p={p} largura={130} />
      <Manchete palavras={palavrasComDestaque(slide.titulo, slide.destaque)} tamanho={Math.min(tamanhoManchete(slide.titulo, false), 100)} p={p} />
      {linhas.length ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 44 }}>
          {linhas.map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: i === linhas.length - 1 ? 0 : 24 }}>
              <div style={{ display: "flex", width: 72, fontFamily: "PT Serif", fontWeight: 700, fontSize: 46, lineHeight: 1.1, color: p.ouro }}>{i + 1}.</div>
              <div style={{ display: "flex", flex: 1, fontFamily: "Archivo", fontWeight: 600, fontSize: 38, lineHeight: 1.24, color: p.fg, paddingTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      ) : (
        <Corpo texto={slide.corpo} p={p} tamanho={Math.min(tamanhoCorpo(slide.corpo) + 2, 40)} />
      )}
      <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 54, border: `4px solid ${p.fg}`, borderRadius: 60, padding: "18px 40px", fontFamily: "Archivo", fontWeight: 800, fontSize: 32, color: p.fg }}>{ctx.identidade.conta}</div>
    </Moldura>
  );
}

export function SlideJsx({ slide, ctx }: { slide: Slide; ctx: ContextoRender }) {
  switch (slide.layout) {
    case "capa":
      return <Capa slide={slide} ctx={ctx} />;
    case "foto":
      return <Foto slide={slide} ctx={ctx} />;
    case "foto_escura":
      return <FotoEscura slide={slide} ctx={ctx} />;
    case "citacao":
      return <Citacao slide={slide} ctx={ctx} />;
    case "tese":
      return <Tese slide={slide} ctx={ctx} />;
    case "imagem":
      return <ComImagem slide={slide} ctx={ctx} />;
    case "destaque":
      return <Destaque slide={slide} ctx={ctx} />;
    case "lista":
      return <Lista slide={slide} ctx={ctx} />;
    case "comparativo":
      return <Comparativo slide={slide} ctx={ctx} />;
    case "checklist":
      return <Checklist slide={slide} ctx={ctx} />;
    case "dados":
      return <Dados slide={slide} ctx={ctx} />;
    case "cta":
      return <Cta slide={slide} ctx={ctx} />;
    default:
      return <Texto slide={slide} ctx={ctx} />;
  }
}

export async function renderizarSlidePng(slide: Slide, ctx: ContextoRender): Promise<Buffer> {
  const res = new ImageResponse(<SlideJsx slide={slide} ctx={ctx} />, {
    width: LARGURA,
    height: ALTURA,
    fonts: fontes().map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });
  return Buffer.from(await res.arrayBuffer());
}

export async function renderizarSlideJpeg(slide: Slide, ctx: ContextoRender): Promise<{ jpeg: Buffer; largura: number; altura: number }> {
  const png = await renderizarSlidePng(slide, ctx);
  return pngParaJpeg(png, 92);
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export function mesAnoDe(dataIso: string): string {
  const [a, m] = dataIso.split("-").map(Number);
  return `${MESES[(m || 1) - 1]} ${a}`;
}
