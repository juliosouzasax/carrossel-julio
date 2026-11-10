import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPagina } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { Nav } from "../../components/Nav";
import { Status } from "../../components/Status";
import { BotaoAcao, EditorTexto } from "../../components/Acoes";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPagina();
  const { id } = await params;
  const store = getStore();
  const post = await store.getPost(id);
  if (!post) notFound();
  const [cands, uso, logs] = await Promise.all([store.getCandidatos(id), store.usoDoPost(id), store.logsRecentes(60, id)]);
  const custo = uso.reduce((a, u) => a + u.custo_usd, 0);
  const ultima = post.revisoes[post.revisoes.length - 1];
  const editavel = !["publicado", "publicando", "cancelado", "usada"].includes(post.status);
  return (
    <>
      <Nav />
      <main>
        <p><Link href="/">← Hoje</Link></p>
        <h1>{post.roteiro?.headline_escolhida ?? post.pauta?.titulo ?? "Post"} </h1>
        <div className="linha">
          <Status s={post.status} /><span className="pill">{post.kind}</span><span className="pill">{post.data}</span>
          {post.pausado && <span className="pill aviso">Pausado</span>}<span className="pill">Custo US$ {custo.toFixed(2)}</span>
        </div>
        {post.motivo && <p className="msg">{post.motivo}</p>}
        {post.erro && <p className="msg" style={{ color: "var(--erro)" }}>{post.erro}</p>}

        <div className="card linha">
          {post.status === "aguardando_aprovacao" && <BotaoAcao postId={id} acao={{ tipo: "aprovar" }}>Aprovar para publicação</BotaoAcao>}
          {!post.pausado ? <BotaoAcao postId={id} acao={{ tipo: "pausar" }} classe="sec">Pausar</BotaoAcao> : <BotaoAcao postId={id} acao={{ tipo: "retomar" }}>Retomar</BotaoAcao>}
          <BotaoAcao postId={id} acao={{ tipo: "avancar" }} classe="sec">Avançar um passo agora</BotaoAcao>
          {["falhou", "suspenso", "perdeu_janela", "cancelado"].includes(post.status) && <BotaoAcao postId={id} acao={{ tipo: "reabrir" }} classe="sec">Reabrir</BotaoAcao>}
          {editavel && <BotaoAcao postId={id} acao={{ tipo: "cancelar" }} classe="perigo" confirmar="Cancelar este post? Nada será publicado.">Cancelar</BotaoAcao>}
        </div>

        {post.pauta && (
          <>
            <h2>Assunto escolhido e porquê</h2>
            <div className="card">
              <b>{post.pauta.titulo}</b>
              <p>{post.pauta.o_que_aconteceu}</p>
              <p className="mut">{post.justificativa}</p>
              <p className="mut">Conexão com a clínica: {post.pauta.conexao_com_clinica}</p>
              <p className="mut">Em alta comprovado: {post.pauta.em_alta_comprovado ? "sim" : "não (apenas notícia recente)"} · Nota final: {post.pauta.nota_final?.toFixed(1) ?? "—"} · Fontes independentes: {post.pauta.fontes_independentes ?? 0}</p>
              {post.pauta.fontes.map((f) => (<div key={f.url}><a href={f.url} target="_blank" rel="noreferrer noopener">{f.titulo || f.dominio}</a> <span className="pill">{f.dominio}</span> <span className={`pill ${f.verificada === "ok" ? "ok" : f.verificada === "inacessivel" ? "erro" : ""}`}>{f.verificada ?? "—"}</span></div>))}
            </div>
          </>
        )}

        {post.slides.length > 0 && (
          <>
            <h2>Prévia do carrossel</h2>
            <div className="slides">
              {post.slides.map((s) => (
                <div key={s.n}>
                  {s.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.url} alt={`Slide ${s.n}: ${s.titulo}`} /> : <div className="card mut">Slide {s.n} ainda não renderizado</div>}
                  {editavel && post.imagens_base.length > 0 && (s.layout === "capa" || s.imagem_idx !== null) && (
                    <BotaoAcao postId={id} acao={{ tipo: "regenerar_imagem", indice: s.imagem_idx ?? 0 }} classe="sec" confirmar="Regenerar esta imagem? Gera custo na OpenAI.">Regenerar imagem</BotaoAcao>
                  )}
                </div>
              ))}
            </div>
            <h2>Legenda</h2>
            <pre>{post.legenda}</pre>
          </>
        )}

        {ultima && (
          <>
            <h2>Revisão automática ({post.revisoes.length}ª tentativa) — {ultima.aprovado ? "aprovou" : "reprovou"}</h2>
            <div className="card">
              <p>{ultima.resumo}</p>
              {ultima.checagens_de_codigo.length > 0 && <p className="mut">Verificações automáticas: {ultima.checagens_de_codigo.join(" | ")}</p>}
              <table><tbody>{ultima.itens.map((i, k) => (<tr key={k}><td>{i.ok ? "✔" : "✖"} {i.criterio}</td><td className="mut">{i.problema ?? ""}</td><td><span className={`pill ${i.ok ? "ok" : i.gravidade === "bloqueante" ? "erro" : "aviso"}`}>{i.ok ? "ok" : i.gravidade}</span></td></tr>))}</tbody></table>
            </div>
          </>
        )}
        {post.recheck && (<><h2>Checagem final de atualidade</h2><div className="card"><p>{post.recheck.resumo}</p><span className={`pill ${post.recheck.ainda_valido ? "ok" : "erro"}`}>{post.recheck.ainda_valido ? "ainda válido" : "não válido"}</span></div></>)}

        {post.publicacao.permalink && <p><a href={post.publicacao.permalink} target="_blank" rel="noreferrer noopener">Ver post no Instagram</a> · id {post.publicacao.media_id}</p>}
        {post.publicacao.simulada && <p className="msg">Publicação SIMULADA: nenhuma chamada de publicação foi feita ao Instagram.</p>}

        {editavel && post.slides.length > 0 && (<><h2>Editar texto</h2><EditorTexto postId={id} slides={post.slides.map((s) => ({ n: s.n, titulo: s.titulo, corpo: s.corpo }))} legenda={post.legenda} /></>)}

        {cands && (<><h2>Candidatos avaliados</h2>{cands.candidatos.map((c, i) => (<div key={i} className="card"><b>{i === cands.escolhido ? "★ " : ""}{c.titulo}</b> <span className="pill">nota {c.nota_final?.toFixed(1) ?? "—"}</span>{c.descartada_por && <p className="mut">Descartada: {c.descartada_por}</p>}</div>))}</>)}

        <h2>Etapas e logs</h2>
        <table><tbody>{logs.map((l, i) => (<tr key={i}><td className="mut">{l.criado_em?.slice(11, 19)}</td><td>{l.etapa}</td><td style={{ color: l.nivel === "erro" ? "var(--erro)" : l.nivel === "aviso" ? "var(--aviso)" : undefined }}>{l.mensagem}</td></tr>))}</tbody></table>
      </main>
    </>
  );
}
