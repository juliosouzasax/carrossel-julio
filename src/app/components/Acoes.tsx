"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function BotaoAcao({ postId, acao, children, classe, confirmar }: { postId: string; acao: Record<string, unknown>; children: React.ReactNode; classe?: string; confirmar?: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function rodar() {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(true);
    setMsg(null);
    try {
      const r = await fetch("/api/painel/acao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postId, acao }) });
      const j = await r.json();
      setMsg(j.mensagem ?? (j.ok ? "Ok." : "Falhou."));
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  return (
    <span>
      <button className={classe} disabled={ocupado} onClick={rodar}>{ocupado ? "Aguarde…" : children}</button>
      {msg && <div className="msg">{msg}</div>}
    </span>
  );
}

export function CriarPost({ tipo, children }: { tipo: "teste" | "reserva"; children: React.ReactNode }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function criar() {
    setOcupado(true);
    const r = await fetch("/api/painel/criar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo }) });
    const j = await r.json();
    setMsg(j.mensagem);
    setOcupado(false);
    router.refresh();
  }
  return (
    <span>
      <button className="sec" disabled={ocupado} onClick={criar}>{children}</button>
      {msg && <div className="msg">{msg}</div>}
    </span>
  );
}

export function EditorTexto({ postId, slides, legenda }: { postId: string; slides: { n: number; titulo: string; corpo: string }[]; legenda: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState(slides.map((s) => ({ n: s.n, titulo: s.titulo, corpo: s.corpo })));
  const [leg, setLeg] = useState(legenda);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    setOcupado(true);
    setMsg(null);
    const r = await fetch("/api/painel/acao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postId, acao: { tipo: "editar", slides: estado, legenda: leg } }) });
    const j = await r.json();
    setMsg(j.mensagem);
    setOcupado(false);
    router.refresh();
  }
  return (
    <div>
      {estado.map((s, i) => (
        <div key={s.n} className="card">
          <b>Slide {s.n}</b>
          <label>Título</label>
          <input value={s.titulo} onChange={(e) => setEstado(estado.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} />
          <label>Texto</label>
          <textarea rows={3} value={s.corpo} onChange={(e) => setEstado(estado.map((x, j) => (j === i ? { ...x, corpo: e.target.value } : x)))} />
        </div>
      ))}
      <label>Legenda</label>
      <textarea rows={8} value={leg} onChange={(e) => setLeg(e.target.value)} />
      <p><button disabled={ocupado} onClick={salvar}>{ocupado ? "Salvando e renderizando…" : "Salvar texto e renderizar de novo"}</button></p>
      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}
