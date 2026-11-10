-- Post das 18h (kind 'tarde') + pauta por referência + tabela referencias_ig. Idempotente.
alter table posts drop constraint if exists posts_kind_check;
alter table posts add constraint posts_kind_check check (kind in ('dia','tarde','reserva','teste'));
alter table posts drop constraint if exists posts_tipo_pauta_check;
alter table posts add constraint posts_tipo_pauta_check check (tipo_pauta in ('noticia','atemporal','referencia'));
create unique index if not exists posts_tarde_unico on posts (conta, data) where kind = 'tarde';
create table if not exists referencias_ig (
  username text not null,
  codigo text not null,
  url text not null,
  tipo text not null default 'reel' check (tipo in ('reel','post')),
  views bigint,
  likes int,
  comentarios int,
  data_post date,
  legenda text,
  coletado_em timestamptz not null default now(),
  primary key (username, codigo)
);
alter table referencias_ig enable row level security;
