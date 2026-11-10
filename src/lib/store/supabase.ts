import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { configPadrao, mesclarConfig, type Config } from "../config";
import { env, envObrigatoria } from "../env";
import type { Candidatos, ContaIG, LogRegistro, Post, ReferenciaIG, UsoRegistro } from "../types";
import type { Blobs, NovoPost, Store } from "./tipos";

export function clienteSupabase(): SupabaseClient {
  return createClient(envObrigatoria("SUPABASE_URL"), envObrigatoria("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function falhou(contexto: string, erro: { message: string } | null): never {
  throw new Error(`Banco (${contexto}): ${erro?.message ?? "erro desconhecido"}`);
}

export class SupabaseStore implements Store {
  constructor(private db: SupabaseClient = clienteSupabase()) {}

  async getConfig(): Promise<Config> {
    const { data, error } = await this.db.from("app_config").select("data").eq("id", 1).maybeSingle();
    if (error) falhou("ler configuração", error);
    return data?.data && Object.keys(data.data).length ? mesclarConfig(configPadrao(), data.data) : configPadrao();
  }
  async saveConfig(patch: unknown): Promise<Config> {
    const atual = await this.getConfig();
    const nova = mesclarConfig(atual, patch);
    const { error } = await this.db.from("app_config").upsert({ id: 1, data: nova, atualizado_em: new Date().toISOString() });
    if (error) falhou("gravar configuração", error);
    return nova;
  }

  async getPost(id: string): Promise<Post | null> {
    const { data, error } = await this.db.from("posts").select("*").eq("id", id).maybeSingle();
    if (error) falhou("ler post", error);
    return (data as Post) ?? null;
  }
  async getPostPorData(conta: string, data: string, kind: Post["kind"] = "dia"): Promise<Post | null> {
    const { data: r, error } = await this.db.from("posts").select("*").eq("conta", conta).eq("data", data).eq("kind", kind).order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (error) falhou("ler post por data", error);
    return (r as Post) ?? null;
  }
  async criarPost(p: NovoPost) {
    const { data, error } = await this.db.from("posts").insert({ id: randomUUID(), ...p }).select("*").single();
    if (error) {
      // 23505 = violação da chave única (conta, data) dos posts "dia": já existe, devolve o existente.
      if ((error as { code?: string }).code === "23505") {
        const existente = await this.getPostPorData(p.conta, p.data, p.kind);
        if (existente) return { post: existente, criado: false };
      }
      falhou("criar post", error);
    }
    return { post: data as Post, criado: true };
  }
  async atualizarPost(id: string, patch: Partial<Post>, esperado?: Post["status"][]) {
    let q = this.db.from("posts").update({ ...patch, atualizado_em: new Date().toISOString() }).eq("id", id);
    if (esperado?.length) q = q.in("status", esperado);
    const { data, error } = await q.select("*").maybeSingle();
    if (error) falhou("atualizar post", error);
    return (data as Post) ?? null;
  }
  async listarPosts(f?: { desde?: string; ate?: string; kinds?: Post["kind"][]; limite?: number }) {
    let q = this.db.from("posts").select("*").order("data", { ascending: false }).order("criado_em", { ascending: false });
    if (f?.desde) q = q.gte("data", f.desde);
    if (f?.ate) q = q.lte("data", f.ate);
    if (f?.kinds?.length) q = q.in("kind", f.kinds);
    if (f?.limite) q = q.limit(f.limite);
    const { data, error } = await q;
    if (error) falhou("listar posts", error);
    return (data ?? []) as Post[];
  }
  async reservaPronta(conta: string) {
    const { data, error } = await this.db.from("posts").select("*").eq("conta", conta).eq("kind", "reserva").eq("status", "aprovado").eq("pausado", false).order("criado_em", { ascending: true }).limit(1).maybeSingle();
    if (error) falhou("buscar reserva", error);
    return (data as Post) ?? null;
  }

  async salvarReferencias(rows: ReferenciaIG[]) {
    if (!rows.length) return 0;
    const { error } = await this.db.from("referencias_ig").upsert(rows, { onConflict: "username,codigo" });
    if (error) falhou("salvar referências", error);
    return rows.length;
  }
  async listarReferencias(f: { desdeColetaISO: string; usernames?: string[] }) {
    let q = this.db.from("referencias_ig").select("*").gte("coletado_em", f.desdeColetaISO);
    if (f.usernames?.length) q = q.in("username", f.usernames);
    const { data, error } = await q.limit(2000);
    if (error) falhou("ler referências", error);
    return (data ?? []) as ReferenciaIG[];
  }

  async salvarCandidatos(c: Omit<Candidatos, "id" | "criado_em">) {
    await this.db.from("candidatos").delete().eq("post_id", c.post_id);
    const { data, error } = await this.db.from("candidatos").insert(c).select("*").single();
    if (error) falhou("salvar candidatos", error);
    return data as Candidatos;
  }
  async getCandidatos(postId: string) {
    const { data, error } = await this.db.from("candidatos").select("*").eq("post_id", postId).order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (error) falhou("ler candidatos", error);
    return (data as Candidatos) ?? null;
  }

  async registrarUso(u: UsoRegistro) {
    const { error } = await this.db.from("usage_log").insert(u);
    if (error) falhou("registrar uso", error);
  }
  async usoDesde(desdeISO: string) {
    const { data, error } = await this.db.from("usage_log").select("*").gte("criado_em", desdeISO).limit(5000);
    if (error) falhou("ler uso", error);
    return ((data ?? []) as UsoRegistro[]).map((u) => ({ ...u, custo_usd: Number(u.custo_usd) }));
  }
  async usoDoPost(postId: string) {
    const { data, error } = await this.db.from("usage_log").select("*").eq("post_id", postId);
    if (error) falhou("ler uso do post", error);
    return ((data ?? []) as UsoRegistro[]).map((u) => ({ ...u, custo_usd: Number(u.custo_usd) }));
  }

  async log(l: LogRegistro) {
    // O log nunca derruba o fluxo principal.
    const { error } = await this.db.from("step_log").insert(l);
    if (error) console.error("[log] falha ao gravar log:", error.message);
  }
  async logsRecentes(limite: number, postId?: string) {
    let q = this.db.from("step_log").select("*").order("criado_em", { ascending: false }).limit(limite);
    if (postId) q = q.eq("post_id", postId);
    const { data, error } = await q;
    if (error) falhou("ler logs", error);
    return (data ?? []) as LogRegistro[];
  }

  async obterLock(nome: string, ttlSeg: number, dono: string) {
    const { data, error } = await this.db.rpc("obter_lock", { p_nome: nome, p_dono: dono, p_ttl_seg: ttlSeg });
    if (error) falhou("obter trava", error);
    return data === true;
  }
  async liberarLock(nome: string, dono: string) {
    await this.db.from("locks").delete().eq("nome", nome).eq("dono", dono);
  }

  async getConta(chave: string) {
    const { data, error } = await this.db.from("ig_conta").select("*").eq("chave", chave).maybeSingle();
    if (error) falhou("ler conta", error);
    return (data as ContaIG) ?? null;
  }
  async salvarConta(c: ContaIG) {
    const { error } = await this.db.from("ig_conta").upsert(c);
    if (error) falhou("gravar conta", error);
  }
}

export class SupabaseBlobs implements Blobs {
  constructor(private db: SupabaseClient = clienteSupabase(), private bucket = env("SUPABASE_BUCKET") || "carrosseis") {}
  async put(caminho: string, dados: Buffer, contentType: string) {
    const { error } = await this.db.storage.from(this.bucket).upload(caminho, dados, { contentType, upsert: true, cacheControl: "3600" });
    if (error) falhou("enviar arquivo", error);
    const { data } = this.db.storage.from(this.bucket).getPublicUrl(caminho);
    return { url: data.publicUrl };
  }
  async get(caminho: string) {
    const { data, error } = await this.db.storage.from(this.bucket).download(caminho);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
}
