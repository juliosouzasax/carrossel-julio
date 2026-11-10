import Link from "next/link";
import { exigirPagina } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { Nav } from "../components/Nav";
import { Status } from "../components/Status";

export const dynamic = "force-dynamic";

export default async function Historico() {
  await exigirPagina();
  const posts = await getStore().listarPosts({ kinds: ["dia", "teste", "reserva"], limite: 120 });
  return (
    <>
      <Nav />
      <main>
        <h1>Calendário e histórico</h1>
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Data</th><th>Tipo</th><th>Status</th><th>Assunto</th><th>Link</th></tr></thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>{p.data}</td><td>{p.kind}</td><td><Status s={p.status} /></td>
                  <td><Link href={`/post/${p.id}`}>{p.roteiro?.headline_escolhida ?? p.pauta?.titulo ?? "(sem pauta)"}</Link></td>
                  <td>{p.publicacao.permalink ? <a href={p.publicacao.permalink} target="_blank" rel="noreferrer noopener">abrir</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
