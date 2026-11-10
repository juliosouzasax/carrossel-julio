import { dataUri, dimensoesJpeg, tipoDaImagem } from "../render/jpeg";
// (dimensoesJpeg também valida o JPEG final e lê o tamanho das fotos reais)
import { ALTURA, LARGURA, mesAnoDe, renderizarSlideJpeg } from "../render/slides";
import type { Post, Slide } from "../types";
import { logar, type Ctx } from "./contexto";

const MAX_BYTES = 8 * 1024 * 1024; // limite da Meta por imagem

async function imagemBase(ctx: Ctx, post: Post, indice: number | null): Promise<{ uri: string; credito: string | null; largura: number | null; altura: number | null } | null> {
  if (indice === null) return null;
  const base = post.imagens_base.find((i) => i.indice === indice);
  if (!base) return null;
  const buf = await ctx.blobs.get(base.storage_path);
  if (!buf) return null;
  const tipo = tipoDaImagem(buf);
  if (!tipo) return null;
  const dim = tipo === "jpeg" ? dimensoesJpeg(buf) : null;
  return { uri: dataUri(buf, tipo), credito: base.credito ?? null, largura: base.largura ?? dim?.largura ?? null, altura: base.altura ?? dim?.altura ?? null };
}

// Renderiza os slides em JPEG 1080x1350 e envia ao armazenamento. "somente" re-renderiza só alguns (edição/regeneração).
export async function executarRender(ctx: Ctx, post: Post, somente?: number[]): Promise<Post> {
  const total = post.slides.length;
  const novos: Slide[] = [];
  const versao = Date.now().toString(36); // muda a URL a cada render: evita cache velho no CDN e na Meta
  for (const s of post.slides) {
    if (somente && !somente.includes(s.n) && s.url) {
      novos.push(s);
      continue;
    }
    const idx = s.layout === "capa" ? (s.imagem_idx ?? 0) : s.imagem_idx;
    const img = await imagemBase(ctx, post, idx);
    const { jpeg, largura, altura } = await renderizarSlideJpeg(s, {
      total,
      identidade: ctx.cfg.identidade,
      imagemDataUri: img?.uri ?? null,
      imagemLargura: img?.largura ?? null,
      imagemAltura: img?.altura ?? null,
      credito: img?.credito ?? null,
      ilustrativo: s.layout === "capa" && !!post.roteiro?.ilustrativo && !img?.credito,
      mesAno: mesAnoDe(post.data),
    });
    if (largura !== LARGURA || altura !== ALTURA) throw new Error(`Slide ${s.n} saiu com ${largura}x${altura}; esperado ${LARGURA}x${ALTURA}.`);
    const dim = dimensoesJpeg(jpeg);
    if (!dim || dim.largura !== LARGURA || dim.altura !== ALTURA) throw new Error(`Slide ${s.n}: JPEG inválido.`);
    if (jpeg.length > MAX_BYTES) throw new Error(`Slide ${s.n} passou de 8 MB (${jpeg.length} bytes).`);
    const caminho = `${post.data}/${post.id}/slides-${versao}/slide-${String(s.n).padStart(2, "0")}.jpg`;
    const { url } = await ctx.blobs.put(caminho, jpeg, "image/jpeg");
    novos.push({ ...s, url, storage_path: caminho, bytes: jpeg.length });
  }
  await logar(ctx, post, "render", "info", `${novos.length} slide(s) renderizados em ${LARGURA}x${ALTURA}.`);
  const atual = await ctx.store.atualizarPost(post.id, { slides: novos, status: "renderizado", erro: null });
  return atual ?? post;
}
