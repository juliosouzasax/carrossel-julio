import { exigirPagina } from "@/lib/auth";
import { consumo } from "@/lib/custo";
import { getStore } from "@/lib/store";
import { agoraSP, somaDias } from "@/lib/tempo";
import { Nav } from "../components/Nav";

export const dynamic = "force-dynamic";

export default async function Custos() {
  await exigirPagina();
  const store = getStore();
  const cfg = await store.getConfig();
  const c = await consumo(store);
  const hoje = agoraSP().data;
  const uso = await store.usoDesde(`${somaDias(hoje, -30)}T00:00:00Z`);
  const porEtapa = new Map<string, { custo: number; n: number }>();
  for (const u of uso) { const e = porEtapa.get(u.etapa) ?? { custo: 0, n: 0 }; e.custo += u.custo_usd; e.n++; porEtapa.set(u.etapa, e); }
  return (
    <>
      <Nav />
      <main>
        <h1>Custos</h1>
        <div className="grid">
          <div className="card">Hoje<br /><b>US$ {c.dia.custo_usd.toFixed(2)}</b><br /><span className="mut">limite {cfg.limites.custo_dia_usd}</span></div>
          <div className="card">Mês<br /><b>US$ {c.mes.custo_usd.toFixed(2)}</b><br /><span className="mut">limite {cfg.limites.custo_mes_usd}</span></div>
          <div className="card">Imagens hoje<br /><b>{c.dia.imagens}</b><br /><span className="mut">limite {cfg.limites.max_imagens_dia}</span></div>
        </div>
        <p className="mut">Valores são ESTIMATIVAS calculadas com os preços da configuração e o uso devolvido pela API; confira a fatura real no painel da OpenAI.</p>
        <h2>Últimos 30 dias por etapa</h2>
        <div className="card"><table><thead><tr><th>Etapa</th><th>Chamadas</th><th>US$</th></tr></thead><tbody>{[...porEtapa.entries()].sort((a, b) => b[1].custo - a[1].custo).map(([e, v]) => (<tr key={e}><td>{e}</td><td>{v.n}</td><td>{v.custo.toFixed(3)}</td></tr>))}</tbody></table></div>
      </main>
    </>
  );
}
