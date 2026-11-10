-- Esquema do banco (Supabase / Postgres). Rode inteiro no SQL Editor. É idempotente.
-- Todas as tabelas ficam com RLS ligada e SEM política: só a chave de serviço (servidor) acessa.

create extension if not exists pgcrypto;

-- Configuração única do sistema (um registro, id = 1)
create table if not exists app_config (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- Um post por conta e dia. kind: dia | reserva | teste
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  conta text not null,
  data date not null,
  kind text not null default 'dia' check (kind in ('dia','reserva','teste')),
  status text not null default 'novo',
  modo text not null default 'manual' check (modo in ('automatico','manual')),
  pausado boolean not null default false,
  tipo_pauta text not null default 'noticia' check (tipo_pauta in ('noticia','atemporal')),
  pauta jsonb,
  justificativa text,
  roteiro jsonb,
  slides jsonb not null default '[]'::jsonb,
  legenda text not null default '',
  imagens_base jsonb not null default '[]'::jsonb,
  revisoes jsonb not null default '[]'::jsonb,
  recheck jsonb,
  publicacao jsonb not null default '{}'::jsonb,
  tentativas jsonb not null default '{}'::jsonb,
  proxima_tentativa_em timestamptz,
  erro text,
  motivo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Chave única por conta e data: impede dois posts "do dia" na mesma data (idempotência).
create unique index if not exists posts_dia_unico on posts (conta, data) where kind = 'dia';
create index if not exists posts_data_idx on posts (data desc);
create index if not exists posts_status_idx on posts (status);

-- Candidatos da pesquisa de cada post (pauta escolhida + justificativa + fontes)
create table if not exists candidatos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  data date not null,
  candidatos jsonb not null default '[]'::jsonb,
  escolhido int,
  justificativa text,
  texto_bruto_pesquisa text,
  criado_em timestamptz not null default now()
);
create index if not exists candidatos_post_idx on candidatos (post_id);

-- Consumo e custo estimado de cada chamada paga
create table if not exists usage_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete set null,
  etapa text not null,
  provedor text not null,
  modelo text not null,
  tokens_entrada int not null default 0,
  tokens_saida int not null default 0,
  tokens_cache int not null default 0,
  imagens int not null default 0,
  buscas_web int not null default 0,
  custo_usd numeric(12,6) not null default 0,
  prompt_version text,
  criado_em timestamptz not null default now()
);
create index if not exists usage_log_criado_idx on usage_log (criado_em desc);

-- Histórico de etapas, avisos e erros (sem segredos)
create table if not exists step_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete set null,
  etapa text not null,
  nivel text not null default 'info' check (nivel in ('info','aviso','erro')),
  mensagem text not null,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists step_log_criado_idx on step_log (criado_em desc);

-- Conta do Instagram. O token fica CIFRADO (AES-256-GCM, chave em APP_ENCRYPTION_KEY).
create table if not exists ig_conta (
  chave text primary key,
  ig_user_id text,
  username text,
  token_cifrado text,
  token_expira_em timestamptz,
  token_renovado_em timestamptz,
  ultimo_erro text
);

-- Trava de concorrência do agendador
create table if not exists locks (
  nome text primary key,
  dono text not null,
  ate timestamptz not null
);

-- Pega a trava se estiver livre ou vencida. Devolve true quando conseguiu.
create or replace function obter_lock(p_nome text, p_dono text, p_ttl_seg int)
returns boolean
language plpgsql
security definer
as $$
declare
  ok boolean;
begin
  insert into locks (nome, dono, ate)
  values (p_nome, p_dono, now() + make_interval(secs => p_ttl_seg))
  on conflict (nome) do update
    set dono = excluded.dono, ate = excluded.ate
    where locks.ate < now()
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

revoke all on function obter_lock(text, text, int) from public, anon, authenticated;

alter table app_config enable row level security;
alter table posts enable row level security;
alter table candidatos enable row level security;
alter table usage_log enable row level security;
alter table step_log enable row level security;
alter table ig_conta enable row level security;
alter table locks enable row level security;

-- Bucket PÚBLICO para os slides (a Meta baixa as imagens por URL).
insert into storage.buckets (id, name, public)
values ('carrosseis', 'carrosseis', true)
on conflict (id) do update set public = true;

-- Recarrega o cache de esquema da API REST depois de criar tabelas/colunas.
notify pgrst, 'reload schema';
