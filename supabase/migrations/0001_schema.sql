-- =============================================================================
-- STOCK UNIFORMES — 0001: schema base (enums, tabelas, índices, triggers)
-- Princípio: o saldo NUNCA é editado diretamente. Ele é consequência das
-- movimentações, gravadas por funções SECURITY DEFINER (ver 0002).
-- =============================================================================


-- ----------------------------------------------------------------- ENUMS ----
create type public.user_role as enum ('admin', 'operator');
create type public.movement_type as enum ('entrada', 'saida');
create type public.product_category as enum (
  'camisetas', 'camisas_polo', 'camisas_sociais', 'jaquetas', 'calcas',
  'bermudas', 'jalecos', 'coletes', 'outros'
);
create type public.movement_reason as enum (
  'producao', 'compra', 'devolucao', 'ajuste_positivo',   -- entradas
  'oc', 'perda', 'avaria', 'ajuste_negativo',             -- saídas
  'correcao',                                              -- somente admin
  'outros'
);

-- --------------------------------------------------------------- PROFILES ---
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null check (char_length(trim(nome)) between 2 and 120),
  email       text not null,
  role        public.user_role not null default 'operator',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

-- ---------------------------------------------------------------- PRODUCTS --
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null check (char_length(trim(codigo)) between 1 and 30),
  nome        text not null check (char_length(trim(nome)) between 2 and 120),
  categoria   public.product_category not null default 'outros',
  descricao   text check (char_length(descricao) <= 500),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index products_codigo_key on public.products (upper(codigo));
create index products_nome_idx on public.products (lower(nome));
create index products_categoria_idx on public.products (categoria);

create table public.product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete restrict,
  cor            text not null check (char_length(trim(cor)) between 1 and 40),
  tamanho        text not null check (char_length(trim(tamanho)) between 1 and 20),
  modelo         text check (char_length(modelo) <= 40),
  sku            text not null check (char_length(trim(sku)) between 1 and 60),
  -- preparado para QR Code / código de barras (leitura pela câmera no futuro)
  barcode        text,
  estoque_minimo integer not null default 0 check (estoque_minimo >= 0),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index variants_sku_key on public.product_variants (upper(sku));
create unique index variants_barcode_key on public.product_variants (barcode) where barcode is not null;
create unique index variants_combo_key
  on public.product_variants (product_id, lower(cor), lower(tamanho), lower(coalesce(modelo, '')));
create index variants_product_idx on public.product_variants (product_id);

-- ----------------------------------------------------------- STOCK BALANCE --
-- Cache do saldo, mantido exclusivamente pelas funções de movimentação
-- (trigger de guarda abaixo). `quantidade` = estoque físico.
-- `quantidade_reservada` já existe para a futura separação física/reservado/
-- disponível; na v1 fica sempre 0.
create table public.stock_balances (
  variant_id            uuid primary key references public.product_variants (id) on delete restrict,
  quantidade            integer not null default 0 check (quantidade >= 0),
  quantidade_reservada  integer not null default 0 check (quantidade_reservada >= 0),
  updated_at            timestamptz not null default now()
);

-- --------------------------------------------------------- STOCK MOVEMENTS --
create table public.stock_movements (
  id                   uuid primary key default gen_random_uuid(),
  product_variant_id   uuid not null references public.product_variants (id) on delete restrict,
  tipo                 public.movement_type not null,
  quantidade           integer not null check (quantidade > 0),
  motivo               public.movement_reason not null,
  oc_number            text check (oc_number is null or oc_number ~ '^[A-Za-z0-9./-]{1,20}$'),
  observacao           text check (char_length(observacao) <= 500),
  user_id              uuid not null references public.profiles (id) on delete restrict,
  -- snapshots: o histórico continua legível mesmo se o usuário mudar de nome/função
  user_nome            text not null,
  user_role            public.user_role not null,
  estoque_anterior     integer not null check (estoque_anterior >= 0),
  estoque_posterior    integer not null check (estoque_posterior >= 0),
  corrige_movement_id  uuid references public.stock_movements (id) on delete restrict,
  idempotency_key      text,
  ip_address           text,
  user_agent           text,
  created_at           timestamptz not null default now(),
  check (
    (tipo = 'entrada' and estoque_posterior = estoque_anterior + quantidade) or
    (tipo = 'saida'   and estoque_posterior = estoque_anterior - quantidade)
  )
);
create unique index movements_idem_key on public.stock_movements (idempotency_key) where idempotency_key is not null;
create index movements_created_idx on public.stock_movements (created_at desc);
create index movements_variant_idx on public.stock_movements (product_variant_id, created_at desc);
create index movements_user_idx on public.stock_movements (user_id, created_at desc);
create index movements_oc_idx on public.stock_movements (oc_number) where oc_number is not null;
create index movements_corrige_idx on public.stock_movements (corrige_movement_id) where corrige_movement_id is not null;

-- -------------------------------------------------------------- AUDIT LOGS --
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete restrict,
  user_nome    text,
  user_role    public.user_role,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index audit_created_idx on public.audit_logs (created_at desc);
create index audit_user_idx on public.audit_logs (user_id, created_at desc);
create index audit_action_idx on public.audit_logs (action, created_at desc);
create index audit_entity_idx on public.audit_logs (entity_type, entity_id);

-- ================================================================ TRIGGERS ===

-- updated_at automático
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();
create trigger trg_variants_updated before update on public.product_variants
  for each row execute function public.set_updated_at();

-- Histórico imutável: nenhuma movimentação/auditoria pode ser editada ou apagada
-- (vale inclusive para service_role e administradores).
create or replace function public.prevent_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'REGISTRO_IMUTAVEL: % é um histórico imutável (% bloqueado)', tg_table_name, tg_op
    using errcode = 'P0001';
end $$;

create trigger trg_movements_immutable before update or delete on public.stock_movements
  for each row execute function public.prevent_mutation();
create trigger trg_movements_no_truncate before truncate on public.stock_movements
  for each statement execute function public.prevent_mutation();
create trigger trg_audit_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_mutation();
create trigger trg_audit_no_truncate before truncate on public.audit_logs
  for each statement execute function public.prevent_mutation();

-- Saldo só pode ser alterado por função de movimentação (flag de sessão local).
create or replace function public.guard_stock_balance() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.quantidade <> 0 then
      raise exception 'SALDO_PROTEGIDO: o saldo inicial deve ser 0; use uma movimentação de entrada';
    end if;
    return new;
  end if;
  if coalesce(current_setting('app.stock_write', true), '') <> 'on' then
    raise exception 'SALDO_PROTEGIDO: o saldo não pode ser alterado diretamente; registre uma movimentação';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger trg_balance_guard before insert or update or delete on public.stock_balances
  for each row execute function public.guard_stock_balance();
create trigger trg_balance_no_truncate before truncate on public.stock_balances
  for each statement execute function public.prevent_mutation();

-- Toda variação nasce com saldo 0.
create or replace function public.create_balance_for_variant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.stock_balances (variant_id, quantidade) values (new.id, 0)
  on conflict do nothing;
  return new;
end $$;

create trigger trg_variant_balance after insert on public.product_variants
  for each row execute function public.create_balance_for_variant();

-- Criação do profile a partir do auth.users.
-- IMPORTANTE: o papel vem de raw_APP_meta_data (não editável pelo usuário).
-- Mantenha o cadastro público (signup) DESATIVADO no Supabase.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := 'operator';
  v_nome text;
begin
  if (new.raw_app_meta_data ->> 'role') = 'admin' then
    v_role := 'admin';
  end if;
  v_nome := coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1));
  insert into public.profiles (id, nome, email, role) values (new.id, v_nome, new.email, v_role);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
