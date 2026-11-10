import { PNG } from "pngjs";
import jpeg from "jpeg-js";

// A Meta só aceita JPEG. O gerador de slides devolve PNG; convertemos em JavaScript puro
// (sem biblioteca nativa) para funcionar igual na Vercel e na máquina local.
export function pngParaJpeg(png: Buffer, qualidade = 92): { jpeg: Buffer; largura: number; altura: number } {
  const img = PNG.sync.read(png);
  // Achata qualquer transparência sobre preto (JPEG não tem alfa).
  const data = Buffer.from(img.data);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    if (a < 1) {
      data[i] = Math.round(data[i] * a);
      data[i + 1] = Math.round(data[i + 1] * a);
      data[i + 2] = Math.round(data[i + 2] * a);
      data[i + 3] = 255;
    }
  }
  const out = jpeg.encode({ data, width: img.width, height: img.height }, qualidade);
  return { jpeg: Buffer.from(out.data), largura: img.width, altura: img.height };
}

// Lê largura/altura de um JPEG sem decodificar tudo.
export function dimensoesJpeg(buf: Buffer): { largura: number; altura: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marcador = buf[i + 1];
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7) };
    }
    const tam = buf.readUInt16BE(i + 2);
    i += 2 + tam;
  }
  return null;
}

// Imagens do gerador chegam em PNG ou JPEG. O renderizador aceita data URI de ambos.
export function dataUri(buf: Buffer, tipo: "png" | "jpeg"): string {
  return `data:image/${tipo};base64,${buf.toString("base64")}`;
}

export function tipoDaImagem(buf: Buffer): "png" | "jpeg" | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  return null;
}
