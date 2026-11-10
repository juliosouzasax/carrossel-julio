// Fotos REAIS das matérias (imagem de divulgação que a própria página anuncia como sua imagem principal).
// Uso autorizado pelo dono da conta em 09/11/2026, com crédito "Foto: <veículo>/Divulgação" no slide.
// Tudo que vem da web é dado não confiável: lemos só metadados de imagem, com teto de tamanho e tipo.
import { dimensoesJpeg, pngParaJpeg, tipoDaImagem } from "./render/jpeg";
import { dominioDe } from "./similaridade";

export type FotoFonte = { url: string; pagina: string; dominio: string; largura: number; altura: number; jpeg: Buffer };

const MAX_HTML = 2 * 1024 * 1024;
const MAX_IMG = 10 * 1024 * 1024;
const LADO_MINIMO = 560; // og:image típica é 1200x630; abaixo disso fica borrada no slide

// Converte qualquer formato comum (webp, png, jpeg, gif, avif) em JPEG via sharp. Se o sharp não carregar
// (ambiente sem o binário), devolve null e o chamador cai no caminho puro (só JPEG/PNG).
async function paraJpegComSharp(buf: Buffer): Promise<{ jpeg: Buffer; largura: number; altura: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(buf, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    const jpeg = await img.flatten({ background: "#101014" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return { jpeg, largura: meta.width, altura: meta.height };
  } catch {
    return null;
  }
}

// Extrai as imagens que a página declara como principais (Open Graph / Twitter card / JSON-LD). Função pura, testável.
export function extrairImagensDaPagina(html: string, base: string): string[] {
  const achadas: string[] = [];
  const re = /<meta\s+[^>]*?(?:property|name)=["'](og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*?content=["']([^"']+)["'][^>]*>/gi;
  const re2 = /<meta\s+[^>]*?content=["']([^"']+)["'][^>]*?(?:property|name)=["'](og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) achadas.push(m[2]);
  while ((m = re2.exec(html))) achadas.push(m[1]);
  const ld = /"image"\s*:\s*(\[[^\]]*\]|"[^"]+"|\{[^}]*"url"\s*:\s*"[^"]+"[^}]*\})/g;
  while ((m = ld.exec(html))) {
    const urls = m[1].match(/https?:\/\/[^"'\s\]]+/g) ?? [];
    achadas.push(...urls);
  }
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const u of achadas) {
    try {
      const abs = new URL(u.replace(/&amp;/g, "&"), base).toString();
      if (!/^https?:/i.test(abs) || vistas.has(abs)) continue;
      vistas.add(abs);
      out.push(abs);
    } catch {
      /* URL inválida */
    }
  }
  return out.slice(0, 6);
}

async function baixar(url: string, limite: number, timeoutMs: number): Promise<{ buf: Buffer; tipo: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; carrossel-bot/1.0)" } });
    if (!r.ok) return null;
    const tipo = r.headers.get("content-type") ?? "";
    const tam = Number(r.headers.get("content-length") ?? 0);
    if (tam > limite) return null;
    const ab = await r.arrayBuffer();
    if (ab.byteLength > limite) return null;
    return { buf: Buffer.from(ab), tipo };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}


// Só as fotos (atalho sobre materialDasFontes).
export async function acharFotosDasFontes(fontes: { url: string; dominio?: string }[], maximo = 4): Promise<FotoFonte[]> {
  return (await materialDasFontes(fontes, maximo)).fotos;
}

// Texto legível da matéria (para o redator contar a história com os dados e o revisor conferir). Função pura.
export function extrairTextoDaPagina(html: string, maximo = 4500): string {
  let h = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<!--[\s\S]*?-->/gi, " ");
  // Prefere o miolo editorial quando existe.
  const art = /<article[\s\S]*?<\/article>/i.exec(h)?.[0] ?? /<main[\s\S]*?<\/main>/i.exec(h)?.[0];
  if (art && art.length > 1500) h = art;
  const blocos = [...h.matchAll(/<(h1|h2|h3|p|li|blockquote|time)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const limpar = (t: string) =>
    t
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&[a-z]+;|&#\d+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  const linhas = (blocos.length ? blocos : [h]).map(limpar).filter((l) => l.length >= 40 && !/cookies?|política de privacidade|newsletter|assine|compartilhe|leia também|publicidade/i.test(l.slice(0, 60)));
  const vistas = new Set<string>();
  const out: string[] = [];
  let tam = 0;
  for (const l of linhas) {
    if (vistas.has(l)) continue;
    vistas.add(l);
    if (tam + l.length > maximo) break;
    out.push(l);
    tam += l.length + 1;
  }
  return out.join("\n");
}

export type TrechoFonte = { url: string; dominio: string; texto: string };

// Numa passada só: foto principal E texto de cada fonte.
export async function materialDasFontes(fontes: { url: string; dominio?: string }[], maxFotos = 4): Promise<{ fotos: FotoFonte[]; trechos: TrechoFonte[] }> {
  const fotos: FotoFonte[] = [];
  const trechos: TrechoFonte[] = [];
  const vistas = new Set<string>();
  for (const f of fontes.slice(0, 6)) {
    const pag = await baixar(f.url, MAX_HTML, 12_000);
    if (!pag || !/html/i.test(pag.tipo)) continue;
    const html = pag.buf.toString("utf8");
    const texto = extrairTextoDaPagina(html);
    if (texto.length >= 200) trechos.push({ url: f.url, dominio: f.dominio || dominioDe(f.url), texto });
    if (fotos.length >= maxFotos) continue;
    for (const u of extrairImagensDaPagina(html, f.url)) {
      if (vistas.has(u)) continue;
      vistas.add(u);
      const img = await baixar(u, MAX_IMG, 15_000);
      if (!img) continue;
      const pronta = await normalizarImagem(img.buf);
      if (!pronta || Math.min(pronta.largura, pronta.altura) < LADO_MINIMO) continue;
      fotos.push({ url: u, pagina: f.url, dominio: f.dominio || dominioDe(f.url), largura: pronta.largura, altura: pronta.altura, jpeg: pronta.jpeg });
      break;
    }
  }
  return { fotos, trechos };
}

// JPEG/PNG/WebP/AVIF/GIF → JPEG com dimensões. Sharp quando disponível; senão só JPEG e PNG (caminho puro).
export async function normalizarImagem(buf: Buffer): Promise<{ jpeg: Buffer; largura: number; altura: number } | null> {
  const viaSharp = await paraJpegComSharp(buf);
  if (viaSharp) return viaSharp;
  const tipo = tipoDaImagem(buf);
  if (tipo === "jpeg") {
    const dim = dimensoesJpeg(buf);
    return dim ? { jpeg: buf, ...dim } : null;
  }
  if (tipo === "png") {
    try {
      const c = pngParaJpeg(buf, 90);
      return { jpeg: c.jpeg, largura: c.largura, altura: c.altura };
    } catch {
      return null;
    }
  }
  return null;
}

export function creditoDaFoto(f: { dominio: string }): string {
  return `Foto: Divulgação / ${f.dominio.replace(/^www\./, "")}`;
}
