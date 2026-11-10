# Carrossel diário para dentistas — pesquisa, criação, revisão e publicação no Instagram

Sistema que, todos os dias, pesquisa um assunto em alta (últimas 24 h) para donos de clínica odontológica, escreve um carrossel 4:5 de 6 a 8 slides com legenda, gera as imagens, **revisa de forma independente** e publica no Instagram **@juliosouza_costa** pela API oficial às 12:00 (America/Sao_Paulo).

> **Estado em 09/11/2026:** código, banco (Supabase `robo-achados`), painel e 46 testes prontos e passando. Provado com credenciais reais: OpenAI (modelos existem; três execuções demonstrativas completas, US$ 0,40–0,85 cada), Supabase (tabelas criadas, leitura/escrita/trava ok), Instagram (token da @juliosouza_costa lido; conta testadora do app; permissão `instagram_business_content_publish` em "Pronto para teste"). **Ainda não provado:** a primeira publicação real pela API (ver "Publicar um demo de verdade").

## Padrão editorial e fotos reais

O formato segue o "carrossel de tendência" editorial (referência @brandsdecoded__, nas cores do Julio): slides 2–4 **contam a história** do fato com números, datas e citações das fontes; a leitura para a clínica vem nos slides 5–6. Quase todo slide tem foto (layouts `foto`, `foto_escura`, `citacao`).

- **Texto das matérias**: na pesquisa, o sistema baixa as páginas das fontes escolhidas e entrega o texto (até ~14 mil caracteres) ao redator e ao revisor. É daí que saem os dados concretos; o revisor confere contra esse texto em vez de pedir "comprovação".
- **Fotos de divulgação**: a imagem principal de cada matéria (`og:image`, inclusive WebP, convertido pelo `sharp`) vira imagem-base com crédito automático "Foto: Divulgação / veículo". Uso autorizado pelo dono da conta em 09/11/2026, que assume a responsabilidade. Desligue em Configuração (`imagens.fotos_reais`) para usar só imagem gerada. Regras em código: a mesma foto em no máximo 2 slides; capa só com foto real de ≥1000 px no menor lado (senão capa gerada); a IA gera só o que as fotos reais não cobrem.
- **Sem ressalva de apuração no slide**: "não verificado", "segundo as matérias citadas" e afins são barrados em código. Dado sem fonte não entra; dado com fonte se afirma.
- Deploy: `next.config.ts` inclui os binários do `sharp` no pacote das funções (`outputFileTracingIncludes` + `serverExternalPackages`). Sem o sharp o sistema segue funcionando só com fotos JPEG/PNG.

## Publicar um demo de verdade

`npm run demo` gera, revisa e grava o post completo em `out/demo-resultado/post.json` (publicação simulada). Para publicar ESSE carrossel no Instagram, depois de olhar os slides:

```bash
npm run publicar:demo -- --publicar-de-verdade
```

Sem a flag é só ensaio. O script sobe as imagens ao Supabase, cria o post do dia já aprovado (a revisão foi feita no demo), renderiza com URL pública, roda a checagem final de atualidade e publica pela API oficial. Um post "dia" por data: não publica duas vezes no mesmo dia.

## Arquitetura (resumo)

```
Vercel Cron (1/min) ─► /api/cron/tick ─► orquestrador (máquina de estados persistida no banco, com trava)
                                              │
   novo → pesquisando → pesquisado → roteirizado → imagens_prontas → renderizado → em_revisao
        → [aguardando_aprovacao se manual] → aprovado → (11:45 checagem final) → pronto → (12:00) publicando → publicado
   desvios: plano B (post reserva → tema atemporal → suspenso), perdeu_janela, falhou, cancelado, simulado (teste)
```

| Camada | Onde |
|---|---|
| Pesquisa na web com fontes reais (OpenAI Responses + `web_search`), estruturação em chamada **separada sem ferramentas** | `src/lib/pipeline/pesquisa.ts` |
| Escolha: ≥2 fontes independentes, nota ponderada, anti-repetição de 60 dias, fallback atemporal | `pesquisa.ts` (`rankear`) |
| Roteiro + validação em código (limites, emojis, promessas proibidas) | `roteiro.ts`, `validacao.ts` |
| Imagens (OpenAI Images, **sem texto na imagem**); texto aplicado por código | `imagens.ts`, `render/slides.tsx` |
| Revisão independente (visão sobre os JPEGs + checagens em código) e checagem final de atualidade | `revisao.ts` |
| Publicação (Instagram API com Login do Instagram), idempotente | `src/lib/instagram.ts`, `pipeline/publicar.ts` |
| Agendador, janela de atraso, plano B, ações do painel | `pipeline/orquestrador.ts` |
| Painel autenticado, responsivo | `src/app/*` |
| Prompts versionados | `src/prompts/` |
| Banco | `supabase/schema.sql` |

Decisões de segurança: chaves só no servidor; conteúdo da web é tratado como **não confiável** (a etapa que lê a web não tem ferramentas de ação; só URLs devolvidas pela busca são aceitas); token do Instagram cifrado com AES‑256‑GCM e renovado sozinho; limites de custo diário/mensal e por post; trava de execução única; novas tentativas com espera crescente.

## Instalação

1. `npm install`
2. **Supabase:** crie um projeto, abra o SQL Editor e rode `supabase/schema.sql` (cria tabelas, a função de trava e o bucket público `carrosseis` — a Meta precisa baixar os slides por URL pública).
3. Copie `.env.example` para `.env.local` e preencha (**nunca** cole chaves em chat ou commit):

| Variável | Para quê |
|---|---|
| `OPENAI_API_KEY` | pesquisa, roteiro, imagens e revisão |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | banco e imagens |
| `PANEL_PASSWORD`, `SESSION_SECRET` | login do painel (segredo: 32+ caracteres aleatórios) |
| `CRON_SECRET` | a Vercel envia como `Authorization: Bearer …` ao cron |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32`, cifra o token do Instagram |
| `IG_ACCESS_TOKEN` | token de longa duração (semente; depois fica cifrado no banco) |

4. `npm run check:modelos` — confere se os nomes de modelo configurados existem na **sua** chave (os nomes vieram da documentação lida em 09/11/2026 e podem diferir na sua conta; ajuste em *Configuração* ou `src/lib/config.ts`).
5. `npm run dev` e abra o painel; ou faça deploy na Vercel (cadastre as mesmas variáveis; `vercel.json` já agenda o cron de 1 em 1 minuto — o plano precisa permitir cron por minuto).

## Instagram: como obter o token

O app Meta "Prime 90D‑IG" (id 2490413258123043) usa **Instagram API com Login do Instagram**. Em *Painel do app → Instagram → Configuração da API com login do Instagram*:
1. Garanta a permissão **`instagram_business_content_publish`** (além de `instagram_business_basic`).
2. A conta **@juliosouza_costa** precisa ser profissional (Business/Creator) e estar como testadora/administradora do app.
3. Gere o token de acesso e troque por um de longa duração (60 dias). Coloque em `IG_ACCESS_TOKEN`.
4. `npm run check:instagram` valida o token **sem publicar nada** (perfil, cota e leitura de mídias).

**Não verificado:** se publicar na própria conta com o app em modo de desenvolvimento dispensa a *Análise do app* da Meta para `instagram_business_content_publish` — a documentação que li não afirma isso. Se o `check:instagram` passar mas a primeira publicação real for recusada por permissão, é esse o ponto.

## Modos de operação

- **Modo de teste (padrão, ligado):** roda tudo (pesquisa, imagens, revisão) e termina em `simulado`. **Nenhuma** chamada de publicação é feita.
- **Manual (padrão):** após a revisão aprovar, o post espera o seu OK no painel.
- **Automático:** se a revisão e a checagem final aprovarem, publica sozinho às 12:00.
- **Desligado (padrão):** o sistema nasce com `ativo=false`. Ligue em *Configuração* quando as chaves estiverem prontas.

Para ir ao ar: *Configuração* → desmarque "modo de teste" → marque "sistema ligado" → escolha manual ou automático.

## Regras de atraso e falha

- Publica só entre `12:00` e `12:00 + janela` (padrão 30 min). Passou disso → `perdeu_janela`, registrado e visível; **não publica atrasado**.
- Revisão reprovou → corrige (até 2 vezes) → se persistir, plano B: post reserva pronto → tema atemporal → `suspenso` (nada é publicado).
- Checagem final (11:45) reprova o assunto → plano B. Se a checagem falhar por erro técnico: padrão **bloquear** (configurável).
- Timeout na publicação: antes de repetir, confere se o post já está no perfil (mesma legenda) — nunca republica às cegas. Os ids dos containers ficam salvos: reinício continua de onde parou.
- Um único post "dia" por conta e data (índice único no banco).

## Testes

`npm test` (vitest, 46 testes): horários e fuso, janela de publicação, criação única do post do dia, cronograma, bloqueio de conteúdo reprovado, plano B/reserva, política da checagem final, modo manual, anti‑duplicidade (timeout com post já publicado, execuções simultâneas), falhas temporárias e permanentes de API, modo de teste que nunca publica, validação do roteiro e renderização 1080×1350. Usam armazenamento em memória e clientes falsos: **não chamam OpenAI nem Instagram**.

`npm run demo` — execução demonstrativa **de teste**: usa a OpenAI de verdade, termina em publicação **simulada**, grava resultados em `out/`. Precisa de `OPENAI_API_KEY`; gera custo. Sem a chave ele avisa e sai sem fazer nada. `npm run demo:render` renderiza slides de exemplo sem nenhuma API.

## Custos

Cada chamada registra tokens, buscas e imagens e estima o custo com os preços da configuração (`precos`, conferir se mudarem). Os limites diário/mensal, de imagens e de regenerações bloqueiam novas chamadas ao estourar. **São estimativas**: confira a fatura real no painel da OpenAI.

## O que ainda não foi provado (porque exige as suas credenciais)

- Chamadas reais à OpenAI (nomes de modelo, formato de resposta da busca, qualidade das imagens e do roteiro).
- Gravação real no Supabase (o `schema.sql` não foi executado num banco).
- Publicação real no Instagram e renovação do token.
- A qualidade editorial dos primeiros carrosséis: por isso o padrão é modo de teste + aprovação manual.

## Observações

- Pastas `assets/fonts/inter-*` e `playfair-*` são sobras sem uso; podem ser apagadas.
- Ajuste *Perfis e estilos de referência* e *Evitar* em Configuração para guiar a pauta.
