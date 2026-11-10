import { exigirPagina } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { Nav } from "../components/Nav";

export const dynamic = "force-dynamic";

export default async function Logs() {
  await exigirPagina();
  const logs = await getStore().logsRecentes(200);
  return (
    <>
      <Nav />
      <main>
        <h1>Logs recentes</h1>
        <div className="card" style={{ overflowX: "auto" }}>
          <table><tbody>{logs.map((l, i) => (<tr key={i}><td className="mut">{l.criado_em?.slice(0, 19).replace("T", " ")}</td><td>{l.etapa}</td><td style={{ color: l.nivel === "erro" ? "var(--erro)" : l.nivel === "aviso" ? "var(--aviso)" : undefined }}>{l.mensagem}</td></tr>))}</tbody></table>
        </div>
      </main>
    </>
  );
}
