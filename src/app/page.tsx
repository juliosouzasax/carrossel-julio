import Link from "next/link";
import { exigirPagina } from "@/lib/auth";
import { env } from "@/lib/env";
import { agoraSP, dataBr } from "@/lib/tempo";
import { getStore } from "@/lib/store";
import { Nav } from "./components/Nav";
import { Status } from "./components/Status";
import { CriarPost } from "./components/Acoes";

export const dynamic = "force-dynamic";

export default async function Hoje() {
  await exigirPagina();
  const store = getStore();
  const [cfg, agora] = [await store.getConfig(), agoraSP()];
  const conta = env("IG_CONTA") || "juliosouza_costa";
  const hoje = await store.getPostPorData(conta, agora.data, "dia");
  const outros = (await store.listarPosts({ desde: agora.data, ate: agora.data, kinds: ["tarde", "teste", "reserva"], limite: 10 }));
  const reservas = (await store.listarPosts({ kinds: ["reserva"], limite: 20 })).filter((p) => p.status === "aprovado");
  return (
    <>
      <Nav />
      <main>
        <h1>Hoje — {dataBr(agora.data)} <span className="mut">({agora.hhmm} em São Paulo)</span></h1>
        <div className="card linha">
          <span className={`pill ${cfg.ativo ? "ok" : "erro"}`}>{cfg.ativo ? "Sistema ligado" : "Sistema desligado"}</span>
          <span className={`pill ${cfg.modo_teste ? "aviso" : "ok"}`}>{cfg.modo_teste ? "MODO DE TESTE: não publica" : "Publicação real"}</span>
          <span className="pill">{cfg.modo === "manual" ? "Modo manual (você aprova)" : "Modo automático"}</span>
          <span className="pill">Publica às {cfg.horarios.publicacao}</span>
          <span className="pill">Reservas prontas: {reservas.length}</span>
        </div>

        {hoje ? (
          <div className="card">
            <div className="linha"><Status s={hoje.status} />{hoje.pausado && <span className="pill aviso">Pausado</span>}<span className="pill">{hoje.tipo_pauta === "noticia" ? "Notícia" : "Atemporal"}</span></div>
            <h2 style={{ marginTop: 8 }}>{hoje.roteiro?.headline_escolhida ?? hoje.pauta?.titulo ?? "Aguardando a pesquisa"}</h2>
            {hoje.justificativa && <p className="mut">{hoje.justificativa}</p>}
            {hoje.motivo && <p className="msg">{hoje.motivo}</p>}
            {hoje.erro && <p className="msg" style={{ color: "var(--erro)" }}>{hoje.erro}</p>}
            <p><Link className="btn" href={`/post/${hoje.id}`}>Abrir, revisar e editar</Link></p>
          </div>
        ) : (
          <div className="card mut">Ainda não há post de hoje. {cfg.ativo ? `A pesquisa começa às ${cfg.horarios.pesquisa}.` : "O sistema está desligado: ligue em Configuração."}</div>
        )}

        <h2>Testes e reservas de hoje</h2>
        {outros.length === 0 && <p className="mut">Nenhum.</p>}
        {outros.map((p) => (
          <div key={p.id} className="card linha"><span className="pill">{p.kind}</span><Status s={p.status} /><Link href={`/post/${p.id}`}>{p.roteiro?.headline_escolhida ?? p.pauta?.titulo ?? p.id.slice(0, 8)}</Link></div>
        ))}
        <p className="linha">
          <CriarPost tipo="teste">Rodar um teste completo (não publica)</CriarPost>
          <CriarPost tipo="reserva">Preparar um post reserva</CriarPost>
        </p>
        <p className="mut">O teste usa suas chaves da OpenAI de verdade (gera custo) e termina em “Simulado”: nada vai ao Instagram.</p>
      </main>
    </>
  );
}
