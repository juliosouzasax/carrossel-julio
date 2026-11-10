import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { envObrigatoria } from "./env";

function chave(): Buffer {
  const k = Buffer.from(envObrigatoria("APP_ENCRYPTION_KEY"), "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY precisa ter 32 bytes em base64 (openssl rand -base64 32).");
  return k;
}

// AES-256-GCM: formato v1:iv:tag:dados (base64)
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), dados.toString("base64")].join(":");
}

export function decifrar(valor: string): string {
  const [v, iv, tag, dados] = valor.split(":");
  if (v !== "v1" || !iv || !tag || !dados) throw new Error("Valor cifrado em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64")), d.final()]).toString("utf8");
}

// Sessão do painel: cookie "exp.assinatura" (HMAC-SHA256 de "exp" com SESSION_SECRET).
export function assinarSessao(validadeHoras = 24 * 7): string {
  const exp = String(Date.now() + validadeHoras * 3600_000);
  const sig = createHmac("sha256", envObrigatoria("SESSION_SECRET")).update(exp).digest("hex");
  return `${exp}.${sig}`;
}

export function sessaoValida(cookie: string | undefined | null): boolean {
  if (!cookie) return false;
  const [exp, sig] = cookie.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const esperado = createHmac("sha256", envObrigatoria("SESSION_SECRET")).update(exp).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function igualSeguro(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
