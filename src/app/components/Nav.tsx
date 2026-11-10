import Link from "next/link";

export function Nav() {
  return (
    <nav className="topo">
      <b>Carrossel diário</b>
      <Link href="/">Hoje</Link>
      <Link href="/historico">Calendário</Link>
      <Link href="/custos">Custos</Link>
      <Link href="/config">Configuração</Link>
      <Link href="/logs">Logs</Link>
      <form action="/api/logout" method="post">
        <button className="sec" type="submit">Sair</button>
      </form>
    </nav>
  );
}
