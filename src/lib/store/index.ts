import path from "node:path";
import { env } from "../env";
import { MemoriaStore, PastaLocalBlobs } from "./memoria";
import { SupabaseBlobs, SupabaseStore } from "./supabase";
import type { Blobs, Store } from "./tipos";

export type { Store, Blobs } from "./tipos";

let store: Store | null = null;
let blobs: Blobs | null = null;

// STORE=memory só deve ser usado na execução demonstrativa local. Em produção, Supabase.
export function getStore(): Store {
  if (!store) store = env("STORE") === "memory" ? new MemoriaStore() : new SupabaseStore();
  return store;
}

export function getBlobs(): Blobs {
  if (!blobs) blobs = env("STORE") === "memory" ? new PastaLocalBlobs(path.join(process.cwd(), "out", "demo")) : new SupabaseBlobs();
  return blobs;
}

export function usandoMemoria(): boolean {
  return env("STORE") === "memory";
}

// Para testes: troca a implementação.
export function definirStore(s: Store, b: Blobs) {
  store = s;
  blobs = b;
}
