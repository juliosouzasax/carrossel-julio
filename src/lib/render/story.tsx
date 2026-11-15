import { ImageResponse } from "next/og";
import type { Config } from "../config";
import { fontes } from "./fontes";
import { pngParaJpeg } from "./jpeg";
import { palavrasComDestaque } from "./slides";

export const STORY_LARGURA = 1080;
export const STORY_ALTURA = 1920; // 9:16

// Zonas que a interface do Instagram cobre nos stories (topo: nome/progresso; base: caixa de resposta).
const TOPO_SEGURO = 250;
const BASE_SEGURA = 260;

export type ContextoStory = {
  identidade: Config["identidade"];
  chamada: string; // ex.: "Post novo no feed"
  instrucao: string; // ex.: "Toque no perfil e arraste os slides"
  headline: string; // manchete do post (fica como legenda da capa quando a capa não carrega)
  destaque: string | null;
  totalSlides: number;
  capaDataUri: string | null; // a CAPA já renderizada (1080x1350), vira um cartão inclinado
  mesAno: string;
};

function tamanhoHeadline(t: string): number {
  const n = t.length;
  return n <= 40 ? 84 : n <= 60 ? 70 : n <= 90 ? 58 : 50;
}

export function StoryJsx({ ctx }: { ctx: ContextoStory }) {
  const id = ctx.identidade;
  const ouro = id.dourado;
  const fg = id.texto_no_escuro;
  const apagado = id.apagado_no_escuro;
  // Cartão da capa: 4:5, inclinado, com sombra. Largura escolhida para sobrar ar nas laterais.
  const cw = 720;
  const ch = Math.round((cw * 1350) / 1080);
  const kicker = { display: "flex", fontFamily: "Archivo", fontWeight: 700, fontSize: 24, letterSpacing: 3, color: apagado, textTransform: "uppercase" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: STORY_LARGURA, height: STORY_ALTURA, position: "relative", background: id.capa_escura, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: STORY_LARGURA, height: STORY_ALTURA, display: "flex", background: `radial-gradient(circle at 50% 42%, rgba(201,162,75,0.22) 0%, rgba(201,162,75,0.06) 32%, ${id.capa_escura} 70%)` }} />
      {/* kicker */}
      <div style={{ position: "absolute", top: TOPO_SEGURO, left: 72, right: 72, display: "flex", justifyContent: "space-between" }}>
        <div style={kicker}>{id.kicker_esquerda}</div>
        <div style={kicker}>{ctx.mesAno} ®</div>
      </div>
      {/* chamada */}
      <div style={{ position: "absolute", top: TOPO_SEGURO + 70, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", background: ouro, color: id.escuro, fontFamily: "Archivo", fontWeight: 800, fontSize: 30, letterSpacing: 4, textTransform: "uppercase", padding: "16px 34px", borderRadius: 60 }}>
          {ctx.chamada}
        </div>
      </div>
      {/* cartão da capa */}
      <div style={{ position: "absolute", top: TOPO_SEGURO + 180, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        {ctx.capaDataUri ? (
          <div style={{ display: "flex", width: cw, height: ch, borderRadius: 28, overflow: "hidden", transform: "rotate(-3deg)", boxShadow: "0 40px 90px rgba(0,0,0,0.65)", border: "2px solid rgba(255,255,255,0.10)" }}>
            <img src={ctx.capaDataUri} width={cw} height={ch} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", width: cw, height: ch, borderRadius: 28, background: id.escuro, border: `2px solid ${ouro}`, padding: 56, transform: "rotate(-3deg)", boxShadow: "0 40px 90px rgba(0,0,0,0.65)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Anton", fontSize: tamanhoHeadline(ctx.headline), lineHeight: 1.02, textTransform: "uppercase", color: fg }}>
              {palavrasComDestaque(ctx.headline, ctx.destaque).map((w, i) => (
                <span key={i} style={{ color: w.d ? ouro : fg, marginRight: 12 }}>{w.t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* setinha + instrução + assinatura */}
      <div style={{ position: "absolute", left: 72, right: 72, bottom: BASE_SEGURA, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", fontFamily: "Anton", fontSize: 72, lineHeight: 1, textTransform: "uppercase", color: fg, textAlign: "center" }}>
          <span style={{ color: fg }}>{ctx.totalSlides} slides</span>
          <span style={{ color: ouro, marginLeft: 20 }}>no feed →</span>
        </div>
        <div style={{ display: "flex", marginTop: 22, fontFamily: "Archivo", fontWeight: 600, fontSize: 30, color: apagado, textAlign: "center" }}>{ctx.instrucao}</div>
        <div style={{ display: "flex", marginTop: 34, border: `2px solid ${ouro}`, color: ouro, fontFamily: "Archivo", fontWeight: 800, fontSize: 26, letterSpacing: 3, padding: "12px 28px", borderRadius: 50, textTransform: "uppercase" }}>
          {id.conta}
        </div>
      </div>
    </div>
  );
}

export async function renderizarStoryJpeg(ctx: ContextoStory): Promise<{ jpeg: Buffer; largura: number; altura: number }> {
  const res = new ImageResponse(<StoryJsx ctx={ctx} />, {
    width: STORY_LARGURA,
    height: STORY_ALTURA,
    fonts: fontes().map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });
  return pngParaJpeg(Buffer.from(await res.arrayBuffer()), 90);
}
