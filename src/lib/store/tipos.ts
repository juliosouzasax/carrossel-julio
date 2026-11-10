import type { Config } from "../config";
import type { Candidatos, ContaIG, KindPost, LogRegistro, Post, StatusPost, UsoRegistro } from "../types";

export type NovoPost = Partial<Post> & { conta: string; data: string; kind: KindPost };

export interface Store {
  getConfig(): Promise<Config>;
  saveConfig(patch: unknown): Promise<Config>;

  getPost(id: string): Promise<Post | null>;
  getPostPorData(conta: string, data: string, kind?: KindPost): Promise<Post | null>;
  // Cria o post. Se já existir um "dia" para (conta, data), devolve o existente (chave única = sem duplicidade).
  criarPost(p: NovoPost): Promise<{ post: Post; criado: boolean }>;
  // Atualiza. Se "esperado" for informado, só atualiza quando o status atual estiver na lista (compare-and-swap).
  atualizarPost(id: string, patch: Partial<Post>, esperado?: StatusPost[]): Promise<Post | null>;
  listarPosts(f?: { desde?: string; ate?: string; kinds?: KindPost[]; limite?: number }): Promise<Post[]>;
  reservaPronta(conta: string): Promise<Post | null>;

  salvarCandidatos(c: Omit<Candidatos, "id" | "criado_em">): Promise<Candidatos>;
  getCandidatos(postId: string): Promise<Candidatos | null>;

  registrarUso(u: UsoRegistro): Promise<void>;
  usoDesde(desdeISO: string): Promise<UsoRegistro[]>;
  usoDoPost(postId: string): Promise<UsoRegistro[]>;

  log(l: LogRegistro): Promise<void>;
  logsRecentes(limite: number, postId?: string): Promise<LogRegistro[]>;

  obterLock(nome: string, ttlSeg: number, dono: string): Promise<boolean>;
  liberarLock(nome: string, dono: string): Promise<void>;

  getConta(chave: string): Promise<ContaIG | null>;
  salvarConta(c: ContaIG): Promise<void>;
}

export interface Blobs {
  put(caminho: string, dados: Buffer, contentType: string): Promise<{ url: string }>;
  get(caminho: string): Promise<Buffer | null>;
}
