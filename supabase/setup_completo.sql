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
-- =============================================================================
-- STOCK UNIFORMES — 0002: views, auditoria automática e funções de movimentação
-- Convenção de erro: RAISE EXCEPTION 'CODIGO: mensagem' (+ DETAIL em JSON).
-- =============================================================================

-- ------------------------------------------------------------------ HELPERS --
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and ativo)
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and ativo)
$$;

-- ------------------------------------------------------------------- VIEWS ---
-- security_invoker: as views respeitam o RLS de quem consulta.
create or replace view public.stock_overview with (security_invoker = true) as
select
  v.id                               as variant_id,
  p.id                               as product_id,
  p.codigo,
  p.nome                             as produto,
  p.categoria,
  v.cor,
  v.tamanho,
  coalesce(array_position(array['PP','P','M','G','GG','XG','EXG'], upper(v.tamanho)), 99) as tamanho_ordem,
  v.modelo,
  v.sku,
  v.barcode,
  v.estoque_minimo,
  b.quantidade                       as estoque,
  b.quantidade_reservada             as reservado,
  (b.quantidade - b.quantidade_reservada) as disponivel,
  case
    when b.quantidade = 0 then 'zerado'
    when b.quantidade <= v.estoque_minimo then 'baixo'
    else 'normal'
  end                                as status,
  (v.ativo and p.ativo)              as ativo
from public.product_variants v
join public.products p on p.id = v.product_id
join public.stock_balances b on b.variant_id = v.id;

create or replace view public.movements_detailed with (security_invoker = true) as
select
  m.id, m.created_at, m.tipo, m.quantidade, m.motivo, m.oc_number, m.observacao,
  m.user_id, m.user_nome, m.user_role,
  m.estoque_anterior, m.estoque_posterior,
  m.corrige_movement_id, m.ip_address, m.user_agent,
  v.id as variant_id, p.id as product_id,
  p.nome as produto, p.categoria, p.codigo,
  v.cor, v.tamanho, v.sku
from public.stock_movements m
join public.product_variants v on v.id = m.product_variant_id
join public.products p on p.id = v.product_id;

-- Total líquido retirado por OC (saídas − devoluções/correções vinculadas à OC).
create or replace view public.oc_summary with (security_invoker = true) as
select
  oc_number,
  count(*)::int                                                        as movimentos,
  sum(case when tipo = 'saida' then quantidade else -quantidade end)::int as total_retirado,
  min(created_at)                                                      as primeira_movimentacao,
  max(created_at)                                                      as ultima_movimentacao
from public.stock_movements
where oc_number is not null
group by oc_number;

-- -------------------------------------------------------------- AUDITORIA ----
create or replace function public._jsonb_diff(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('de', a -> k, 'para', b -> k)), '{}'::jsonb)
  from jsonb_object_keys(b) as k
  where k not in ('updated_at', 'created_at') and (a -> k) is distinct from (b -> k)
$$;

create or replace function public._write_audit(
  p_user uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_meta jsonb, p_ip text, p_ua text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_nome text; v_role public.user_role; v_uid uuid;
begin
  select id, nome, role into v_uid, v_nome, v_role from public.profiles where id = p_user;
  insert into public.audit_logs (user_id, user_nome, user_role, action, entity_type, entity_id, metadata, ip_address, user_agent)
  values (v_uid, v_nome, v_role, p_action, p_entity_type, p_entity_id, coalesce(p_meta, '{}'::jsonb), p_ip, left(p_ua, 300));
end $$;

-- Auditoria automática de cadastros: TG_ARGV[0] = prefixo da ação, [1] = entity_type
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := tg_argv[0];
  v_action text;
  v_old jsonb; v_new jsonb; v_diff jsonb;
begin
  v_new := to_jsonb(new);
  if tg_op = 'INSERT' then
    v_action := v_prefix || '_criado';
    perform public._write_audit(auth.uid(), v_action, tg_argv[1], (v_new ->> 'id')::uuid,
      jsonb_build_object('rotulo', coalesce(v_new ->> 'nome', v_new ->> 'sku'), 'dados', v_new - 'created_at' - 'updated_at'),
      null, null);
    return new;
  end if;

  v_old := to_jsonb(old);
  v_diff := public._jsonb_diff(v_old, v_new);
  if v_diff = '{}'::jsonb then
    return new;
  end if;

  v_action := v_prefix || '_alterado';
  if (v_old ->> 'ativo') = 'true' and (v_new ->> 'ativo') = 'false' then
    v_action := v_prefix || '_desativado';
  elsif (v_old ->> 'ativo') = 'false' and (v_new ->> 'ativo') = 'true' then
    v_action := v_prefix || '_reativado';
  elsif v_diff ? 'role' then
    v_action := 'permissao_alterada';
  end if;

  perform public._write_audit(auth.uid(), v_action, tg_argv[1], (v_new ->> 'id')::uuid,
    jsonb_build_object('rotulo', coalesce(v_new ->> 'nome', v_new ->> 'sku'), 'alteracoes', v_diff), null, null);
  return new;
end $$;

create trigger trg_audit_products after insert or update on public.products
  for each row execute function public.audit_row_change('produto', 'product');
create trigger trg_audit_variants after insert or update on public.product_variants
  for each row execute function public.audit_row_change('variacao', 'product_variant');
create trigger trg_audit_profiles after insert or update on public.profiles
  for each row execute function public.audit_row_change('usuario', 'profile');

-- Eventos de sessão/acesso registrados pela aplicação (lista fechada de ações).
create or replace function public.log_audit_event(
  p_action text, p_entity_type text default 'system', p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb, p_ip text default null, p_ua text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida';
  end if;
  if p_action not in ('login', 'logout', 'operacao_invalida', 'acesso_administrativo', 'criacao_usuario', 'senha_redefinida') then
    raise exception 'ACAO_INVALIDA: ação de auditoria não permitida';
  end if;
  perform public._write_audit(auth.uid(), p_action, p_entity_type, p_entity_id,
    left(coalesce(p_metadata, '{}'::jsonb)::text, 4000)::jsonb, p_ip, p_ua);
end $$;

-- --------------------------------------------------------- MOVIMENTAÇÃO ------
-- Função interna (somente service_role/outras funções). Transacional:
--   lock da linha de saldo → valida → atualiza saldo → grava movimentação → audita.
-- Se qualquer passo falhar, TUDO é desfeito.
create or replace function public._apply_movement(
  p_user_id uuid, p_variant_id uuid, p_tipo public.movement_type, p_quantidade integer,
  p_motivo public.movement_reason, p_oc text, p_obs text, p_key text,
  p_ip text, p_ua text, p_corrige uuid default null, p_created_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prof public.profiles;
  v_var public.product_variants;
  v_prod public.products;
  v_ant integer; v_post integer;
  v_oc text;
  v_obs text := nullif(trim(coalesce(p_obs, '')), '');
  v_mov public.stock_movements;
  v_dup boolean := false;
  v_action text;
begin
  select * into v_prof from public.profiles where id = p_user_id and ativo;
  if not found then
    raise exception 'USUARIO_INVALIDO: usuário inexistente ou inativo';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'QUANTIDADE_INVALIDA: a quantidade deve ser maior que zero';
  end if;
  if p_quantidade > 1000000 then
    raise exception 'QUANTIDADE_INVALIDA: quantidade acima do limite permitido';
  end if;
  if v_obs is not null and char_length(v_obs) > 500 then
    raise exception 'OBSERVACAO_INVALIDA: observação muito longa (máx. 500)';
  end if;

  -- motivo x tipo
  if p_tipo = 'entrada' and p_motivo not in ('producao', 'compra', 'devolucao', 'ajuste_positivo', 'outros', 'correcao') then
    raise exception 'MOTIVO_INVALIDO: motivo não permitido para entrada';
  end if;
  if p_tipo = 'saida' and p_motivo not in ('oc', 'producao', 'perda', 'avaria', 'ajuste_negativo', 'outros', 'correcao') then
    raise exception 'MOTIVO_INVALIDO: motivo não permitido para saída';
  end if;

  -- OC: "OC 22", "oc-22" e "22" viram "22"
  v_oc := nullif(regexp_replace(upper(trim(coalesce(p_oc, ''))), '^OC[[:space:]._-]*', ''), '');
  if v_oc is not null and v_oc !~ '^[A-Z0-9./-]{1,20}$' then
    raise exception 'OC_INVALIDA: número de OC inválido';
  end if;
  if p_motivo = 'oc' and v_oc is null then
    raise exception 'OC_OBRIGATORIA: informe o número da OC';
  end if;

  select * into v_var from public.product_variants where id = p_variant_id;
  if not found then
    raise exception 'PRODUTO_INEXISTENTE: variação de produto não encontrada';
  end if;
  select * into v_prod from public.products where id = v_var.product_id;
  if p_corrige is null and (not v_var.ativo or not v_prod.ativo) then
    raise exception 'PRODUTO_INATIVO: produto desativado';
  end if;

  -- trava a linha de saldo: serializa movimentações concorrentes do mesmo item
  select quantidade into v_ant from public.stock_balances where variant_id = p_variant_id for update;
  if not found then
    insert into public.stock_balances (variant_id, quantidade) values (p_variant_id, 0);
    v_ant := 0;
  end if;

  -- idempotência (duplo clique / reenvio): mesma chave => devolve a mesma movimentação
  if p_key is not null then
    select * into v_mov from public.stock_movements where idempotency_key = p_key;
    if found then
      if v_mov.user_id <> p_user_id or v_mov.product_variant_id <> p_variant_id then
        raise exception 'CHAVE_DUPLICADA: chave de operação já utilizada';
      end if;
      v_dup := true;
    end if;
  end if;

  if not v_dup then
    if p_tipo = 'entrada' then v_post := v_ant + p_quantidade; else v_post := v_ant - p_quantidade; end if;
    if v_post < 0 then
      raise exception 'ESTOQUE_INSUFICIENTE: disponível %, solicitado %', v_ant, p_quantidade
        using detail = jsonb_build_object('disponivel', v_ant, 'solicitado', p_quantidade, 'faltam', p_quantidade - v_ant)::text;
    end if;

    perform set_config('app.stock_write', 'on', true);
    update public.stock_balances set quantidade = v_post, updated_at = now() where variant_id = p_variant_id;
    perform set_config('app.stock_write', 'off', true);

    insert into public.stock_movements (
      product_variant_id, tipo, quantidade, motivo, oc_number, observacao,
      user_id, user_nome, user_role, estoque_anterior, estoque_posterior,
      corrige_movement_id, idempotency_key, ip_address, user_agent, created_at
    ) values (
      p_variant_id, p_tipo, p_quantidade, p_motivo, v_oc, v_obs,
      v_prof.id, v_prof.nome, v_prof.role, v_ant, v_post,
      p_corrige, p_key, p_ip, left(p_ua, 300), coalesce(p_created_at, now())
    ) returning * into v_mov;

    v_action := case when p_motivo in ('ajuste_positivo', 'ajuste_negativo', 'correcao') then 'ajuste' else p_tipo::text end;
    perform public._write_audit(v_prof.id, v_action, 'stock_movement', v_mov.id,
      jsonb_build_object(
        'tipo', p_tipo, 'quantidade', p_quantidade, 'motivo', p_motivo, 'oc', v_oc,
        'produto', v_prod.nome, 'cor', v_var.cor, 'tamanho', v_var.tamanho, 'sku', v_var.sku,
        'estoque_anterior', v_ant, 'estoque_posterior', v_post,
        'corrige_movement_id', p_corrige, 'observacao', v_obs),
      p_ip, p_ua);
  end if;

  return jsonb_build_object(
    'id', v_mov.id, 'tipo', v_mov.tipo, 'quantidade', v_mov.quantidade, 'motivo', v_mov.motivo,
    'oc_number', v_mov.oc_number, 'estoque_anterior', v_mov.estoque_anterior,
    'estoque_posterior', v_mov.estoque_posterior, 'created_at', v_mov.created_at,
    'produto', v_prod.nome, 'cor', v_var.cor, 'tamanho', v_var.tamanho, 'sku', v_var.sku,
    'duplicado', v_dup);
end $$;

-- Registro de entrada/saída pelo usuário autenticado.
create or replace function public.register_movement(
  p_variant_id uuid, p_tipo public.movement_type, p_quantidade integer,
  p_motivo public.movement_reason, p_oc text, p_observacao text, p_idempotency_key text,
  p_ip text default null, p_ua text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then
    raise exception 'CHAVE_OBRIGATORIA: chave de operação ausente';
  end if;
  if p_motivo = 'correcao' and not public.is_admin() then
    raise exception 'SEM_PERMISSAO: apenas administradores fazem correções';
  end if;
  return public._apply_movement(auth.uid(), p_variant_id, p_tipo, p_quantidade, p_motivo,
    p_oc, p_observacao, p_idempotency_key, p_ip, p_ua, null, now());
end $$;

-- CORRIGIR MOVIMENTAÇÃO (admin): o registro original é preservado; cria-se um
-- ajuste compensatório que leva a quantidade efetiva da original ao valor correto.
create or replace function public.correct_movement(
  p_movement_id uuid, p_quantidade_correta integer, p_observacao text, p_idempotency_key text,
  p_ip text default null, p_ua text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_orig public.stock_movements;
  v_net integer; v_eff integer; v_diff integer;
  v_tipo public.movement_type;
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO: apenas administradores podem corrigir movimentações';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then
    raise exception 'CHAVE_OBRIGATORIA: chave de operação ausente';
  end if;
  if p_observacao is null or char_length(trim(p_observacao)) < 3 then
    raise exception 'OBSERVACAO_OBRIGATORIA: descreva o motivo da correção';
  end if;
  if p_quantidade_correta is null or p_quantidade_correta < 0 then
    raise exception 'QUANTIDADE_INVALIDA: quantidade correta inválida';
  end if;

  select * into v_orig from public.stock_movements where id = p_movement_id for update;
  if not found then
    raise exception 'MOVIMENTACAO_INEXISTENTE: movimentação não encontrada';
  end if;
  if v_orig.corrige_movement_id is not null then
    raise exception 'NAO_CORRIGIR_CORRECAO: corrija a movimentação original';
  end if;

  select coalesce(sum(case when tipo = v_orig.tipo then quantidade else -quantidade end), 0)
    into v_net from public.stock_movements where corrige_movement_id = v_orig.id;
  v_eff := v_orig.quantidade + v_net;
  v_diff := p_quantidade_correta - v_eff;
  if v_diff = 0 then
    raise exception 'SEM_DIFERENCA: a quantidade informada já é a quantidade efetiva (%)', v_eff;
  end if;

  v_tipo := case
    when v_diff > 0 then v_orig.tipo
    when v_orig.tipo = 'entrada' then 'saida'::public.movement_type
    else 'entrada'::public.movement_type end;

  return public._apply_movement(auth.uid(), v_orig.product_variant_id, v_tipo, abs(v_diff),
    'correcao', v_orig.oc_number, p_observacao, p_idempotency_key, p_ip, p_ua, v_orig.id, now());
end $$;

-- -------------------------------------------------------------- RESUMOS -----
create or replace function public.dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO: acesso restrito a administradores';
  end if;
  select jsonb_build_object(
    'estoque_total', (select coalesce(sum(estoque), 0) from public.stock_overview where ativo),
    'entradas_hoje', (select coalesce(sum(quantidade), 0) from public.stock_movements
                       where tipo = 'entrada' and motivo <> 'correcao' and created_at >= v_today),
    'saidas_hoje', (select coalesce(sum(quantidade), 0) from public.stock_movements
                       where tipo = 'saida' and motivo <> 'correcao' and created_at >= v_today),
    'estoque_baixo', (select count(*) from public.stock_overview
                       where ativo and estoque_minimo > 0 and estoque <= estoque_minimo),
    'ocs_movimentadas', (select count(distinct oc_number) from public.stock_movements
                       where oc_number is not null and created_at >= now() - interval '30 days'),
    'atencao', coalesce((
      select jsonb_agg(to_jsonb(t)) from (
        select variant_id, produto, cor, tamanho, estoque, estoque_minimo, status
        from public.stock_overview
        where ativo and estoque_minimo > 0 and estoque <= estoque_minimo
        order by (estoque::numeric / estoque_minimo) asc, produto
        limit 10) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Totais de um item (visíveis a qualquer usuário ativo, sem expor quem movimentou).
create or replace function public.variant_summary(p_variant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida';
  end if;
  return (
    select jsonb_build_object(
      'estoque', coalesce((select quantidade from public.stock_balances where variant_id = p_variant_id), 0),
      'entradas', coalesce(sum(quantidade) filter (where tipo = 'entrada'), 0),
      'saidas', coalesce(sum(quantidade) filter (where tipo = 'saida'), 0),
      'movimentacoes', count(*))
    from public.stock_movements where product_variant_id = p_variant_id);
end $$;
-- =============================================================================
-- STOCK UNIFORMES — 0003: Row Level Security e privilégios
-- Regras:
--   * anon não acessa nada.
--   * movimentações, saldo e auditoria NÃO têm INSERT/UPDATE/DELETE para usuários:
--     só as funções SECURITY DEFINER escrevem.
--   * admin lê tudo; operador lê apenas as próprias movimentações.
--   * nada é apagado (sem DELETE em nenhuma tabela).
-- =============================================================================

alter table public.profiles         enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.stock_balances   enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.audit_logs       enable row level security;

-- ----------------------------------------------------------------- PRIVILÉGIOS
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated, service_role;

grant select on public.profiles, public.products, public.product_variants,
  public.stock_balances, public.stock_movements, public.audit_logs to authenticated;
grant select on public.stock_overview, public.movements_detailed, public.oc_summary to authenticated;
-- cadastros: escrita controlada por RLS (somente admin); sem DELETE
grant insert, update on public.products, public.product_variants to authenticated;
grant update (nome, role, ativo) on public.profiles to authenticated;

grant execute on function
  public.is_admin(), public.is_active_user(),
  public.register_movement(uuid, public.movement_type, integer, public.movement_reason, text, text, text, text, text),
  public.correct_movement(uuid, integer, text, text, text, text),
  public.dashboard_summary(),
  public.variant_summary(uuid),
  public.log_audit_event(text, text, uuid, jsonb, text, text)
to authenticated;

-- uso interno (seed / backend com service role)
grant execute on function
  public._apply_movement(uuid, uuid, public.movement_type, integer, public.movement_reason, text, text, text, text, text, uuid, timestamptz)
to service_role;

-- ----------------------------------------------------------------- POLICIES --
-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- products / variants: todos os usuários ativos leem; só admin escreve
create policy products_select on public.products for select to authenticated
  using (public.is_active_user());
create policy products_insert on public.products for insert to authenticated
  with check (public.is_admin());
create policy products_update on public.products for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy variants_select on public.product_variants for select to authenticated
  using (public.is_active_user());
create policy variants_insert on public.product_variants for insert to authenticated
  with check (public.is_admin());
create policy variants_update on public.product_variants for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- saldo: somente leitura
create policy balances_select on public.stock_balances for select to authenticated
  using (public.is_active_user());

-- movimentações: admin vê tudo; operador só as suas. Sem policy de escrita.
create policy movements_select_admin on public.stock_movements for select to authenticated
  using (public.is_admin());
create policy movements_select_own on public.stock_movements for select to authenticated
  using (user_id = auth.uid() and public.is_active_user());

-- auditoria: somente admin lê. Sem policy de escrita.
create policy audit_select_admin on public.audit_logs for select to authenticated
  using (public.is_admin());

-- Impede rebaixar/desativar o último administrador ativo.
create or replace function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.ativo and (new.role <> 'admin' or not new.ativo) then
    if not exists (select 1 from public.profiles where role = 'admin' and ativo and id <> old.id) then
      raise exception 'ULTIMO_ADMIN: deve existir ao menos um administrador ativo';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_last_admin before update on public.profiles
  for each row execute function public.guard_last_admin();
-- =============================================================================
-- ESTOQUE BIA — 0004: valor unitário por produto e valor total em estoque
-- Rode no SQL Editor DEPOIS das migrations 0001–0003 (é seguro rodar mais de uma vez).
-- O valor só é visível para ADMINISTRADORES (operadores recebem NULL nas views).
-- =============================================================================

alter table public.products
  add column if not exists valor_unitario numeric(12, 2) not null default 0
  check (valor_unitario >= 0);

-- Novas colunas ficam no FINAL da view (exigência do CREATE OR REPLACE VIEW).
create or replace view public.stock_overview with (security_invoker = true) as
select
  v.id                               as variant_id,
  p.id                               as product_id,
  p.codigo,
  p.nome                             as produto,
  p.categoria,
  v.cor,
  v.tamanho,
  coalesce(array_position(array['PP','P','M','G','GG','XG','EXG'], upper(v.tamanho)), 99) as tamanho_ordem,
  v.modelo,
  v.sku,
  v.barcode,
  v.estoque_minimo,
  b.quantidade                       as estoque,
  b.quantidade_reservada             as reservado,
  (b.quantidade - b.quantidade_reservada) as disponivel,
  case
    when b.quantidade = 0 then 'zerado'
    when b.quantidade <= v.estoque_minimo then 'baixo'
    else 'normal'
  end                                as status,
  (v.ativo and p.ativo)              as ativo,
  case when public.is_admin() then p.valor_unitario end                    as valor_unitario,
  case when public.is_admin() then p.valor_unitario * b.quantidade end     as valor_total
from public.product_variants v
join public.products p on p.id = v.product_id
join public.stock_balances b on b.variant_id = v.id;

create or replace function public.dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO: acesso restrito a administradores';
  end if;
  select jsonb_build_object(
    'estoque_total', (select coalesce(sum(estoque), 0) from public.stock_overview where ativo),
    'valor_total', (select coalesce(sum(valor_total), 0) from public.stock_overview where ativo),
    'entradas_hoje', (select coalesce(sum(quantidade), 0) from public.stock_movements
                       where tipo = 'entrada' and motivo <> 'correcao' and created_at >= v_today),
    'saidas_hoje', (select coalesce(sum(quantidade), 0) from public.stock_movements
                       where tipo = 'saida' and motivo <> 'correcao' and created_at >= v_today),
    'estoque_baixo', (select count(*) from public.stock_overview
                       where ativo and estoque_minimo > 0 and estoque <= estoque_minimo),
    'ocs_movimentadas', (select count(distinct oc_number) from public.stock_movements
                       where oc_number is not null and created_at >= now() - interval '30 days'),
    'atencao', coalesce((
      select jsonb_agg(to_jsonb(t)) from (
        select variant_id, produto, cor, tamanho, estoque, estoque_minimo, status
        from public.stock_overview
        where ativo and estoque_minimo > 0 and estoque <= estoque_minimo
        order by (estoque::numeric / estoque_minimo) asc, produto
        limit 10) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Auditoria também registra exportações de relatório (dados sensíveis: valores em R$).
create or replace function public.log_audit_event(
  p_action text, p_entity_type text default 'system', p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb, p_ip text default null, p_ua text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida';
  end if;
  if p_action not in ('login', 'logout', 'operacao_invalida', 'acesso_administrativo', 'criacao_usuario',
                      'senha_redefinida', 'exportacao_relatorio', 'importacao_catalogo') then
    raise exception 'ACAO_INVALIDA: ação de auditoria não permitida';
  end if;
  perform public._write_audit(auth.uid(), p_action, p_entity_type, p_entity_id,
    left(coalesce(p_metadata, '{}'::jsonb)::text, 4000)::jsonb, p_ip, p_ua);
end $$;
