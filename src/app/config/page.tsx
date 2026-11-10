import { exigirPagina } from "@/lib/auth";
import { env } from "@/lib/env";
import { getStore } from "@/lib/store";
import { Nav } from "../components/Nav";
import { FormConfig } from "../components/FormConfig";

export const dynamic = "force-dynamic";

export default async function Config() {
  await exigirPagina();
  const store = getStore();
  const cfg = await store.getConfig();
  const conta = await store.getConta(env("IG_CONTA") || "juliosouza_costa");
  const status = [
    ["OpenAI (OPENAI_API_KEY)", !!env("OPENAI_API_KEY")],
    ["Instagram (token)", !!conta?.token_cifrado || !!env("IG_ACCESS_TOKEN")],
    ["Supabase", !!env("SUPABASE_URL") && !!env("SUPABASE_SERVICE_ROLE_KEY")],
    ["CRON_SECRET", !!env("CRON_SECRET")],
    ["APP_ENCRYPTION_KEY", !!env("APP_ENCRYPTION_KEY")],
  ] as const;
  return (
    <>
      <Nav />
      <main>
        <h1>Configuração</h1>
        <div className="card linha">{status.map(([n, ok]) => (<span key={n} className={`pill ${ok ? "ok" : "erro"}`}>{n}: {ok ? "configurado" : "FALTANDO"}</span>))}</div>
        {conta && <p className="mut">Conta: @{conta.username ?? "?"} · token expira em {conta.token_expira_em?.slice(0, 10) ?? "?"}{conta.ultimo_erro ? ` · último erro: ${conta.ultimo_erro}` : ""}</p>}
        <FormConfig inicial={cfg} />
      </main>
    </>
  );
}
