"use client";
import { useState } from "react";
import type { Config } from "@/lib/config";

export function FormConfig({ inicial }: { inicial: Config }) {
  const [c, setC] = useState<Config>(inicial);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setC({ ...c, [k]: v });
  async function salvar() {
    setOcupado(true);
    const r = await fetch("/api/painel/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });
    const j = await r.json();
    setMsg(j.ok ? "Configuração salva." : j.mensagem);
    setOcupado(false);
  }
  const h = c.horarios;
  const id = c.identidade;
  return (
    <div>
      <h2>Modos</h2>
      <div className="card">
        <label><input type="checkbox" style={{ width: "auto" }} checked={c.ativo} onChange={(e) => set("ativo", e.target.checked)} /> Sistema ligado (cria e publica o post do dia)</label>
        <label><input type="checkbox" style={{ width: "auto" }} checked={c.modo_teste} onChange={(e) => set("modo_teste", e.target.checked)} /> MODO DE TESTE: roda tudo, mas NÃO publica no Instagram</label>
        <label><input type="checkbox" style={{ width: "auto" }} checked={c.pausado_global} onChange={(e) => set("pausado_global", e.target.checked)} /> Pausar tudo</label>
        <label>Aprovação</label>
        <select value={c.modo} onChange={(e) => set("modo", e.target.value as Config["modo"])}>
          <option value="manual">Manual: eu aprovo antes de publicar</option>
          <option value="automatico">Automático: publica sozinho se a revisão aprovar</option>
        </select>
        <label>Se a checagem final de atualidade falhar por erro técnico</label>
        <select value={c.conteudo.se_recheck_falhar} onChange={(e) => set("conteudo", { ...c.conteudo, se_recheck_falhar: e.target.value as "bloquear" | "publicar" })}>
          <option value="bloquear">Bloquear (mais seguro)</option>
          <option value="publicar">Publicar mesmo assim</option>
        </select>
      </div>
      <h2>Horários (São Paulo)</h2>
      <div className="card">
        {(["pesquisa", "roteiro", "prazo_revisao", "recheck", "publicacao"] as const).map((k) => (
          <div key={k}><label>{({ pesquisa: "Pesquisa", roteiro: "Roteiro e imagens", prazo_revisao: "Prazo da revisão", recheck: "Checagem final", publicacao: "Publicação" })[k]}</label>
            <input value={h[k]} onChange={(e) => set("horarios", { ...h, [k]: e.target.value })} placeholder="HH:MM" /></div>
        ))}
        <label>Janela de tolerância após o horário de publicação (minutos). Passou disso, não publica.</label>
        <input type="number" value={c.janela_publicacao_min} onChange={(e) => set("janela_publicacao_min", Number(e.target.value))} />
      </div>
      <h2>Limites de custo</h2>
      <div className="card">
        {(["custo_dia_usd", "custo_mes_usd", "max_imagens_dia", "max_regeneracoes_por_post", "max_revisoes"] as const).map((k) => (
          <div key={k}><label>{k}</label><input type="number" step="any" value={c.limites[k]} onChange={(e) => set("limites", { ...c.limites, [k]: Number(e.target.value) })} /></div>
        ))}
      </div>
      <h2>Identidade visual</h2>
      <div className="card">
        {(["escuro", "claro", "dourado", "dourado_no_claro", "kicker_esquerda", "kicker_centro", "assinatura", "conta"] as const).map((k) => (
          <div key={k}><label>{k}</label><input value={id[k]} onChange={(e) => set("identidade", { ...id, [k]: e.target.value })} /></div>
        ))}
        <label>Estilo das imagens geradas</label>
        <textarea rows={3} value={id.estilo_imagem} onChange={(e) => set("identidade", { ...id, estilo_imagem: e.target.value })} />
      </div>
      <h2>Conteúdo</h2>
      <div className="card">
        <label>Público</label><textarea rows={2} value={c.conteudo.publico} onChange={(e) => set("conteudo", { ...c.conteudo, publico: e.target.value })} />
        <label>Perfis e estilos de referência</label><textarea rows={4} value={c.conteudo.referencias_estilo} onChange={(e) => set("conteudo", { ...c.conteudo, referencias_estilo: e.target.value })} />
        <label>Evitar</label><textarea rows={3} value={c.conteudo.evitar} onChange={(e) => set("conteudo", { ...c.conteudo, evitar: e.target.value })} />
      </div>
      <p><button disabled={ocupado} onClick={salvar}>{ocupado ? "Salvando…" : "Salvar configuração"}</button></p>
      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}
