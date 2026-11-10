export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main style={{ maxWidth: 360, marginTop: 80 }}>
      <h1>Carrossel diário</h1>
      <form action="/api/login" method="post" className="card">
        <label htmlFor="senha">Senha do painel</label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required />
        {erro && <p className="pill erro">Senha incorreta.</p>}
        <p><button type="submit">Entrar</button></p>
      </form>
    </main>
  );
}
