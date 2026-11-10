import { describe, expect, it } from "vitest";
import { creditoDaFoto, extrairImagensDaPagina, extrairTextoDaPagina } from "../src/lib/fotosDasFontes";
import { palavrasComDestaque } from "../src/lib/render/slides";

describe("fotos reais das fontes", () => {
  it("lê og:image, twitter:image e JSON-LD, resolvendo URL relativa e sem duplicar", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://cdn.site.com/a.jpg?x=1&amp;y=2">
      <meta content="/img/b.png" name="twitter:image">
      <script type="application/ld+json">{"@type":"NewsArticle","image":["https://cdn.site.com/a.jpg?x=1&y=2","https://cdn.site.com/c.jpg"]}</script>
    </head></html>`;
    expect(extrairImagensDaPagina(html, "https://www.site.com/materia")).toEqual(["https://cdn.site.com/a.jpg?x=1&y=2", "https://www.site.com/img/b.png", "https://cdn.site.com/c.jpg"]);
  });
  it("ignora URL inválida e não-http", () => {
    const html = `<meta property="og:image" content="javascript:alert(1)"><meta property="og:image" content="data:image/png;base64,xx">`;
    expect(extrairImagensDaPagina(html, "https://site.com/")).toEqual([]);
  });
  it("extrai o texto editorial e descarta ruído de página", () => {
    const html = `<html><head><script>var x=1;</script><style>p{}</style></head><body>
      <nav><p>Assine nossa newsletter e receba novidades toda semana por e-mail</p></nav>
      <article><h1>Milky Moo e Lindt lançam milkshake de Natal</h1>
      <p>A pré-venda exclusiva pelo aplicativo começa em 9 de novembro de 2026, e o lançamento nacional está previsto para 11 de novembro.</p>
      <p>Segundo a empresa, a rede tem mais de 400 lojas no país &amp; planeja dobrar até 2027.</p>
      <p>curto</p></article></body></html>`;
    const t = extrairTextoDaPagina(html);
    expect(t).toContain("9 de novembro de 2026");
    expect(t).toContain("400 lojas no país & planeja");
    expect(t).not.toContain("newsletter");
    expect(t).not.toContain("var x");
  });
  it("crédito cita o veículo", () => {
    expect(creditoDaFoto({ dominio: "www.gkpb.com.br" })).toBe("Foto: Divulgação / gkpb.com.br");
  });
});

describe("destaque no título", () => {
  it("destaca só o trecho contínuo (não um 'de' solto em outro lugar)", () => {
    const r = palavrasComDestaque("perdeu mais de 1,5 milhão de seguidores, cerca de 6%.", "mais de 1,5 milhão de seguidores,");
    // perdeu | mais de 1,5 milhão de seguidores, | cerca de 6%.  → só o trecho do meio fica dourado
    expect(r.map((w) => (w.d ? 1 : 0)).join("")).toBe("0111111000");
  });
  it("sem destaque, as duas últimas palavras", () => {
    expect(palavrasComDestaque("A fila que ninguém responde", null).map((w) => w.d)).toEqual([false, false, false, true, true]);
  });
});
