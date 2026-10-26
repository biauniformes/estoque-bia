-- =============================================================================
-- ESTOQUE BIA — 0017: CONSOLIDAÇÃO DE OC
-- Rode no SQL Editor depois da 0016. Seguro para rodar mais de uma vez.
--
-- Guarda as ordens de compra do cliente (lidas do PDF), a ligação dos códigos DELE com os NOSSOS e
-- mostra a lista do que precisa ser separado. NÃO mexe no estoque (a saída continua em "Saída por OC").
-- Quem vê: administrador, operador e expedição. Quem importa/liga/apaga: administrador e operador.
-- =============================================================================

create or replace function public.oc_can_view() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo and p.role::text in ('admin', 'operator', 'expedicao'))
$$;
create or replace function public.oc_can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo and p.role::text in ('admin', 'operator'))
$$;
revoke all on function public.oc_can_view() from public, anon;
revoke all on function public.oc_can_write() from public, anon;
grant execute on function public.oc_can_view() to authenticated;
grant execute on function public.oc_can_write() to authenticated;

-- código do cliente (66.0042) -> nosso modelo (NNN.NNN, sem o tamanho)
create table if not exists public.oc_modelo_map (
  id          uuid primary key default gen_random_uuid(),
  cliente     text not null default 'ORBENK',
  cod_cliente text not null check (char_length(cod_cliente) between 3 and 30),
  descricao   text,
  modelo      text check (modelo is null or modelo ~ '^[0-9]{3}\.[0-9]{3}$'),
  confirmado  boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  unique (cliente, cod_cliente)
);

-- tamanho do cliente -> nosso tamanho ('*' em cod_cliente vale para todos os produtos do cliente)
create table if not exists public.oc_tamanho_map (
  id              uuid primary key default gen_random_uuid(),
  cliente         text not null default 'ORBENK',
  cod_cliente     text not null default '*',
  tamanho_cliente text not null check (char_length(tamanho_cliente) between 1 and 20),
  tamanho_nosso   text not null check (char_length(tamanho_nosso) between 1 and 20),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id) on delete set null,
  unique (cliente, cod_cliente, tamanho_cliente)
);

create table if not exists public.oc_ordens (
  id          uuid primary key default gen_random_uuid(),
  cliente     text not null default 'ORBENK',
  empresa     text not null,
  cnpj        text,
  numero      text not null check (char_length(numero) between 1 and 30),
  entrega     date,
  arquivo     text,
  status      text not null default 'pendente' check (status in ('pendente', 'separada')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  separada_em timestamptz,
  unique (cliente, empresa, numero)
);

create table if not exists public.oc_itens (
  id             uuid primary key default gen_random_uuid(),
  ordem_id       uuid not null references public.oc_ordens (id) on delete cascade,
  seq            integer not null,
  cod_cliente    text not null,
  tamanho        text not null,
  descricao      text not null,
  quantidade     integer not null check (quantidade > 0 and quantidade <= 999999),
  cod_nosso_pdf  text
);
create index if not exists oc_itens_ordem_idx on public.oc_itens (ordem_id);

alter table public.oc_modelo_map enable row level security;
alter table public.oc_tamanho_map enable row level security;
alter table public.oc_ordens enable row level security;
alter table public.oc_itens enable row level security;

do $$
declare t text;
begin
  foreach t in array array['oc_modelo_map', 'oc_tamanho_map', 'oc_ordens', 'oc_itens'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.oc_can_view())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.oc_can_write()) with check (public.oc_can_write())', t || '_write', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- auditoria (só ações da consolidação, só quem pode escrever)
create or replace function public.oc_log_audit(p_action text, p_meta jsonb default '{}'::jsonb, p_ip text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_active_user() or not public.oc_can_write() then
    raise exception 'SEM_PERMISSAO: sem permissão para a consolidação de OC';
  end if;
  if p_action not in ('oc_importada', 'oc_excluida', 'oc_separada', 'oc_reaberta', 'oc_ligacao_alterada') then
    raise exception 'ACAO_INVALIDA: ação de auditoria não permitida';
  end if;
  perform public._write_audit(auth.uid(), p_action, 'oc_consolidacao', null, left(coalesce(p_meta, '{}'::jsonb)::text, 4000)::jsonb, p_ip, p_ua);
end $$;
revoke all on function public.oc_log_audit(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.oc_log_audit(text, jsonb, text, text) to authenticated;
