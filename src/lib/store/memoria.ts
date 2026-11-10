import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { configPadrao, mesclarConfig, type Config } from "../config";
import type { Candidatos, ContaIG, LogRegistro, Post, UsoRegistro, ReferenciaIG } from "../types";
import type { Blobs, NovoPost, Store } from "./tipos";

// Armazenamento em memória. USO: testes automatizados e a execução demonstrativa local (STORE=memory).
// Em produção o sistema usa Supabase; esta classe não persiste nada entre execuções.
export class MemoriaStore implements Store {
  private config: Config = configPadrao();
  private posts = new Map<string, Post>();
  private cands = new Map<string, Candidatos>();
  private usos: UsoRegistro[] = [];
  private logs: LogRegistro[] = [];
  private locks = new Map<string, { dono: string; ate: number }>();
  private contas = new Map<string, ContaIG>();

  async getConfig() {
    return this.config;
  }
  async saveConfig(patch: unknown) {
    this.config = mesclarConfig(this.config, patch);
    return this.config;
  }

  async getPost(id: string) {
    return this.posts.get(id) ?? null;
  }
  async getPostPorData(conta: string, data: string, kind: Post["kind"] = "dia") {
    return [...this.posts.values()].find((p) => p.conta === conta && p.data === data && p.kind === kind) ?? null;
  }
  async criarPost(p: NovoPost) {
    if (p.kind === "dia" || p.kind === "tarde") {
      const existente = await this.getPostPorData(p.conta, p.data, p.kind);
      if (existente) return { post: existente, criado: false };
    }
    const agora = new Date().toISOString();
    const post: Post = {
      id: randomUUID(),
      status: "novo",
      modo: "manual",
      pausado: false,
      tipo_pauta: "noticia",
      pauta: null,
      justificativa: null,
      roteiro: null,
      slides: [],
      legenda: "",
      imagens_base: [],
      revisoes: [],
      recheck: null,
      publicacao: {},
      tentativas: {},
      proxima_tentativa_em: null,
      erro: null,
      motivo: null,
      criado_em: agora,
      atualizado_em: agora,
      ...p,
    } as Post;
    this.posts.set(post.id, post);
    return { post, criado: true };
  }
  async atualizarPost(id: string, patch: Partial<Post>, esperado?: Post["status"][]) {
    const atual = this.posts.get(id);
    if (!atual) return null;
    if (esperado && !esperado.includes(atual.status)) return null;
    const novo = { ...atual, ...patch, atualizado_em: new Date().toISOString() } as Post;
    this.posts.set(id, novo);
    return novo;
  }
  async listarPosts(f?: { desde?: string; ate?: string; kinds?: Post["kind"][]; limite?: number }) {
    let l = [...this.posts.values()];
    if (f?.desde) l = l.filter((p) => p.data >= f.desde!);
    if (f?.ate) l = l.filter((p) => p.data <= f.ate!);
    if (f?.kinds) l = l.filter((p) => f.kinds!.includes(p.kind));
    l.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.criado_em < b.criado_em ? 1 : -1));
    return f?.limite ? l.slice(0, f.limite) : l;
  }
  async reservaPronta(conta: string) {
    return [...this.posts.values()].find((p) => p.conta === conta && p.kind === "reserva" && p.status === "aprovado" && !p.pausado) ?? null;
  }

  private refs = new Map<string, ReferenciaIG>();
  async salvarReferencias(rows: ReferenciaIG[]) {
    for (const r of rows) this.refs.set(`${r.username}/${r.codigo}`, r);
    return rows.length;
  }
  async listarReferencias(f: { desdeColetaISO: string; usernames?: string[] }) {
    return [...this.refs.values()].filter((r) => r.coletado_em >= f.desdeColetaISO && (!f.usernames?.length || f.usernames.includes(r.username)));
  }

  async salvarCandidatos(c: Omit<Candidatos, "id" | "criado_em">) {
    const reg: Candidatos = { ...c, id: randomUUID(), criado_em: new Date().toISOString() };
    this.cands.set(c.post_id, reg);
    return reg;
  }
  async getCandidatos(postId: string) {
    return this.cands.get(postId) ?? null;
  }

  async registrarUso(u: UsoRegistro) {
    this.usos.push({ ...u, id: randomUUID(), criado_em: u.criado_em ?? new Date().toISOString() });
  }
  async usoDesde(desdeISO: string) {
    return this.usos.filter((u) => (u.criado_em ?? "") >= desdeISO);
  }
  async usoDoPost(postId: string) {
    return this.usos.filter((u) => u.post_id === postId);
  }

  async log(l: LogRegistro) {
    this.logs.unshift({ ...l, id: randomUUID(), criado_em: new Date().toISOString() });
    this.logs = this.logs.slice(0, 2000);
  }
  async logsRecentes(limite: number, postId?: string) {
    return this.logs.filter((l) => !postId || l.post_id === postId).slice(0, limite);
  }

  async obterLock(nome: string, ttlSeg: number, dono: string) {
    const atual = this.locks.get(nome);
    if (atual && atual.ate > Date.now()) return false;
    this.locks.set(nome, { dono, ate: Date.now() + ttlSeg * 1000 });
    return true;
  }
  async liberarLock(nome: string, dono: string) {
    if (this.locks.get(nome)?.dono === dono) this.locks.delete(nome);
  }

  async getConta(chave: string) {
    return this.contas.get(chave) ?? null;
  }
  async salvarConta(c: ContaIG) {
    this.contas.set(c.chave, c);
  }
}

// Guarda arquivos numa pasta local. As URLs são file:// — servem para olhar os resultados,
// NÃO são acessíveis à Meta (por isso a publicação real exige o armazenamento do Supabase).
export class PastaLocalBlobs implements Blobs {
  constructor(private dir: string) {}
  async put(caminho: string, dados: Buffer) {
    const alvo = path.join(this.dir, caminho);
    mkdirSync(path.dirname(alvo), { recursive: true });
    writeFileSync(alvo, dados);
    return { url: `file://${alvo}` };
  }
  async get(caminho: string) {
    const alvo = path.join(this.dir, caminho);
    return existsSync(alvo) ? readFileSync(alvo) : null;
  }
}
