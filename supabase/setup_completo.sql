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
-- =============================================================================
-- ESTOQUE BIA — 0005: Contagem inicial (lançamento em lote, somente administrador)
-- Rode no SQL Editor DEPOIS da 0004. Seguro para rodar mais de uma vez.
--
--  * novo motivo de movimentação: 'contagem_inicial' (somente via função de lote)
--  * register_initial_count(): lança várias entradas de uma vez, TUDO OU NADA, com
--    chave de idempotência por item (reenviar o mesmo lote não duplica nada)
--  * "Entradas hoje" do dashboard não conta a contagem inicial
-- =============================================================================

alter type public.movement_reason add value if not exists 'contagem_inicial';

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
  if p_tipo = 'entrada' and p_motivo not in ('producao', 'compra', 'devolucao', 'ajuste_positivo', 'outros', 'correcao', 'contagem_inicial') then
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
  if p_motivo = 'contagem_inicial' then
    raise exception 'MOTIVO_INVALIDO: use a tela de Contagem inicial';
  end if;
  if p_motivo = 'correcao' and not public.is_admin() then
    raise exception 'SEM_PERMISSAO: apenas administradores fazem correções';
  end if;
  return public._apply_movement(auth.uid(), p_variant_id, p_tipo, p_quantidade, p_motivo,
    p_oc, p_observacao, p_idempotency_key, p_ip, p_ua, null, now());
end $$;

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
                       where tipo = 'entrada' and motivo not in ('correcao', 'contagem_inicial') and created_at >= v_today),
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

-- Lote: p_items = [{"variant_id": "...", "quantidade": 10}, ...]
create or replace function public.register_initial_count(
  p_items jsonb, p_batch_key text, p_ip text default null, p_ua text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item record;
  v_res jsonb;
  v_n integer := 0;
  v_pecas bigint := 0;
  v_valor numeric := 0;
  v_dups integer := 0;
  v_preco numeric;
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO: apenas administradores lançam a contagem inicial';
  end if;
  if p_batch_key is null or char_length(trim(p_batch_key)) < 8 then
    raise exception 'CHAVE_OBRIGATORIA: chave de operação ausente';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'LOTE_VAZIO: nenhum item para lançar';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'LOTE_GRANDE: no máximo 1000 itens por lançamento';
  end if;

  -- ordenado por variação (evita deadlock entre lotes) e sem repetição
  for v_item in
    select (e ->> 'variant_id')::uuid as variant_id, (e ->> 'quantidade')::integer as quantidade
    from jsonb_array_elements(p_items) e
    order by 1
  loop
    v_res := public._apply_movement(
      auth.uid(), v_item.variant_id, 'entrada', v_item.quantidade, 'contagem_inicial',
      null, 'Contagem inicial', left(p_batch_key, 60) || ':' || v_item.variant_id::text,
      p_ip, p_ua, null, now());
    if (v_res ->> 'duplicado')::boolean then
      v_dups := v_dups + 1;
    else
      v_n := v_n + 1;
      v_pecas := v_pecas + v_item.quantidade;
      select p.valor_unitario into v_preco from public.product_variants pv
        join public.products p on p.id = pv.product_id where pv.id = v_item.variant_id;
      v_valor := v_valor + v_item.quantidade * coalesce(v_preco, 0);
    end if;
  end loop;

  if v_n > 0 then
    perform public._write_audit(auth.uid(), 'contagem_inicial', 'stock_movement', null,
      jsonb_build_object('itens', v_n, 'pecas', v_pecas, 'valor', v_valor), p_ip, p_ua);
  end if;

  return jsonb_build_object('lancados', v_n, 'repetidos', v_dups, 'pecas', v_pecas, 'valor', v_valor);
end $$;

revoke all on function public.register_initial_count(jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.register_initial_count(jsonb, text, text, text) to authenticated;
-- =============================================================================
-- ESTOQUE BIA — 0006: ordenação por tamanho a partir do nome do item
-- Itens importados trazem o tamanho no fim do nome ("... AZUL - PP", "... AZUL G1").
-- A view passa a expor:
--   nome_base     = nome sem o tamanho final (agrupa as grades do mesmo modelo)
--   tamanho_rank  = PP, P, M, G, GG, XG, EXG, G1…G6; numerais (34, 36…) em ordem; sem tamanho = 999
-- Rode no SQL Editor depois da 0005. Seguro para rodar mais de uma vez.
-- =============================================================================

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
  case when public.is_admin() then p.valor_unitario * b.quantidade end     as valor_total,
  regexp_replace(p.nome, '[[:space:]-]*(PP|P|M|G|GG|XG|EXG|G[1-9]|[0-9]{2})[[:space:]]*$', '', 'i') as nome_base,
  coalesce(
    array_position(
      array['PP','P','M','G','GG','XG','EXG','G1','G2','G3','G4','G5','G6','G7','G8','G9'],
      upper(substring(p.nome from '(?i)(?:^|[[:space:]-])(PP|P|M|G|GG|XG|EXG|G[1-9]|[0-9]{2})[[:space:]]*$'))
    ),
    case
      when substring(p.nome from '(?:^|[[:space:]-])([0-9]{2})[[:space:]]*$') is not null
        then 100 + substring(p.nome from '(?:^|[[:space:]-])([0-9]{2})[[:space:]]*$')::int
      else 999
    end
  )                                  as tamanho_rank
from public.product_variants v
join public.products p on p.id = v.product_id
join public.stock_balances b on b.variant_id = v.id;
-- =============================================================================
-- ESTOQUE BIA — 0007: Saída por OC em lote + OC obrigatória para operadores
-- Rode no SQL Editor depois da 0006. Seguro para rodar mais de uma vez.
--
-- Também: register_movement() passa a exigir o número da OC em TODA saída de quem não é admin.
--
-- register_oc_exit():
--   * qualquer usuário ativo (operador ou admin)
--   * TUDO OU NADA: se faltar estoque em qualquer item, nada é lançado e o erro lista os itens
--   * cada peça vira uma movimentação normal (motivo "OC"), com chave anti-duplicidade por item
--   * reenviar o mesmo lote (duplo clique / queda de rede) não lança nada em dobro
-- =============================================================================

create or replace function public.register_oc_exit(
  p_oc text, p_items jsonb, p_batch_key text, p_obs text default null,
  p_ip text default null, p_ua text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_oc text := nullif(regexp_replace(upper(trim(coalesce(p_oc, ''))), '^OC[[:space:]._-]*', ''), '');
  v_key text := left(coalesce(p_batch_key, ''), 60);
  v_agg jsonb;
  v_item record;
  v_res jsonb;
  v_falta jsonb;
  v_n integer := 0;
  v_pecas bigint := 0;
  v_dups integer := 0;
  v_out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if v_oc is null then
    raise exception 'OC_OBRIGATORIA: informe o número da OC';
  end if;
  if v_oc !~ '^[A-Z0-9./-]{1,20}$' then
    raise exception 'OC_INVALIDA: número de OC inválido';
  end if;
  if char_length(trim(v_key)) < 8 then
    raise exception 'CHAVE_OBRIGATORIA: chave de operação ausente';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'LOTE_VAZIO: nenhum item para lançar';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'LOTE_GRANDE: no máximo 500 itens por saída';
  end if;

  -- itens agregados (a mesma peça repetida soma) e ordenados (evita deadlock entre lotes)
  select jsonb_agg(jsonb_build_object('variant_id', t.variant_id, 'quantidade', t.q) order by t.variant_id)
    into v_agg
  from (
    select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantidade')::integer) as q
    from jsonb_array_elements(p_items) e
    group by 1
  ) t;

  if exists (select 1 from jsonb_to_recordset(v_agg) as i(variant_id uuid, quantidade integer)
             where i.quantidade is null or i.quantidade <= 0 or i.quantidade > 1000000) then
    raise exception 'QUANTIDADE_INVALIDA: a quantidade de cada peça deve ser maior que zero';
  end if;

  -- trava os saldos dos itens ainda não lançados (ordem fixa)
  perform 1
  from public.stock_balances b
  join jsonb_to_recordset(v_agg) as i(variant_id uuid, quantidade integer) on i.variant_id = b.variant_id
  where not exists (select 1 from public.stock_movements m where m.idempotency_key = v_key || ':' || i.variant_id::text)
  order by b.variant_id
  for update of b;

  -- confere TODOS antes de lançar qualquer coisa
  select jsonb_agg(jsonb_build_object(
           'variant_id', i.variant_id, 'produto', p.nome, 'cor', v.cor, 'tamanho', v.tamanho,
           'disponivel', coalesce(b.quantidade, 0), 'solicitado', i.quantidade,
           'faltam', i.quantidade - coalesce(b.quantidade, 0)))
    into v_falta
  from jsonb_to_recordset(v_agg) as i(variant_id uuid, quantidade integer)
  left join public.stock_balances b on b.variant_id = i.variant_id
  left join public.product_variants v on v.id = i.variant_id
  left join public.products p on p.id = v.product_id
  where not exists (select 1 from public.stock_movements m where m.idempotency_key = v_key || ':' || i.variant_id::text)
    and (v.id is null or i.quantidade > coalesce(b.quantidade, 0));

  if v_falta is not null then
    raise exception 'ESTOQUE_INSUFICIENTE: % item(ns) sem estoque suficiente', jsonb_array_length(v_falta)
      using detail = jsonb_build_object('itens', v_falta)::text;
  end if;

  for v_item in
    select i.variant_id, i.quantidade
    from jsonb_to_recordset(v_agg) as i(variant_id uuid, quantidade integer)
    order by i.variant_id
  loop
    v_res := public._apply_movement(
      auth.uid(), v_item.variant_id, 'saida', v_item.quantidade, 'oc',
      v_oc, nullif(trim(coalesce(p_obs, '')), ''), v_key || ':' || v_item.variant_id::text,
      p_ip, p_ua, null, now());
    if (v_res ->> 'duplicado')::boolean then
      v_dups := v_dups + 1;
    else
      v_n := v_n + 1;
      v_pecas := v_pecas + v_item.quantidade;
    end if;
    v_out := v_out || jsonb_build_object('variant_id', v_item.variant_id, 'estoque_posterior', v_res -> 'estoque_posterior');
  end loop;

  if v_n > 0 then
    perform public._write_audit(auth.uid(), 'saida_oc_lote', 'stock_movement', null,
      jsonb_build_object('oc', v_oc, 'itens', v_n, 'pecas', v_pecas), p_ip, p_ua);
  end if;

  return jsonb_build_object('oc', v_oc, 'lancados', v_n, 'repetidos', v_dups, 'pecas', v_pecas, 'itens', v_out);
end $$;

revoke all on function public.register_oc_exit(text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_oc_exit(text, jsonb, text, text, text, text) to authenticated;

-- OC obrigatória nas saídas de operadores (administradores continuam livres para perda, avaria, ajuste…)
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
  if p_motivo = 'contagem_inicial' then
    raise exception 'MOTIVO_INVALIDO: use a tela de Contagem inicial';
  end if;
  -- OC obrigatória: quem NÃO é administrador só registra saída com o número da OC
  if p_tipo = 'saida' and not public.is_admin()
     and nullif(regexp_replace(upper(trim(coalesce(p_oc, ''))), '^OC[[:space:]._-]*', ''), '') is null then
    raise exception 'OC_OBRIGATORIA: informe o número da OC para registrar a saída';
  end if;
  if p_motivo = 'correcao' and not public.is_admin() then
    raise exception 'SEM_PERMISSAO: apenas administradores fazem correções';
  end if;
  return public._apply_movement(auth.uid(), p_variant_id, p_tipo, p_quantidade, p_motivo,
    p_oc, p_observacao, p_idempotency_key, p_ip, p_ua, null, now());
end $$;
-- =============================================================================
-- ESTOQUE BIA — 0008: Saída em lote — OC opcional para ADMINISTRADOR
-- Rode no SQL Editor depois da 0007. Seguro para rodar mais de uma vez.
--
--  * operador: o número da OC continua OBRIGATÓRIO
--  * administrador: pode deixar a OC em branco; nesse caso escolhe o motivo
--    (produção, perda, avaria, ajuste ou outros) — o padrão é "outros"
-- =============================================================================

drop function if exists public.register_oc_exit(text, jsonb, text, text, text, text);

create or replace function public.register_oc_exit(
  p_oc text, p_items jsonb, p_batch_key text, p_obs text default null,
  p_ip text default null, p_ua text default null, p_motivo text default 'oc'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_oc text := nullif(regexp_replace(upper(trim(coalesce(p_oc, ''))), '^OC[[:space:]._-]*', ''), '');
  v_key text := left(coalesce(p_batch_key, ''), 60);
  v_motivo public.movement_reason := 'oc';
  v_agg jsonb;
  v_item record;
  v_res jsonb;
  v_falta jsonb;
  v_n integer := 0;
  v_pecas bigint := 0;
  v_dups integer := 0;
  v_out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if v_oc is null then
    -- sem OC: somente administrador, com um motivo que não seja "OC"
    if not public.is_admin() then
      raise exception 'OC_OBRIGATORIA: informe o número da OC';
    end if;
    v_motivo := case when lower(coalesce(p_motivo, '')) in ('producao', 'perda', 'avaria', 'ajuste_negativo', 'outros')
                     then lower(p_motivo)::public.movement_reason else 'outros' end;
  elsif v_oc !~ '^[A-Z0-9./-]{1,20}$' then
    raise exception 'OC_INVALIDA: número de OC inválido';
  end if;
  if char_length(trim(v_key)) < 8 then
    raise exception 'CHAVE_OBRIGATORIA: chave de operação ausente';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'LOTE_VAZIO: nenhum item para lançar';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'LOTE_GRANDE: no máximo 500 itens por saída';
  end if;

  -- itens agregados (a mesma peça repetida soma) e ordenados (evita deadlock entre lotes)
  select jsonb_agg(jsonb_build_object('variant_id', t.variant_id, 'quantidade', t.q) order by t.variant_id)
    into v_agg
  from (
    select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantidade')::integer) as q
    from jsonb_array_elements(p_items) e
    group by 1
  ) t;

  if exists (select 1 from jsonb_to_recordset(v_agg) as i(variant_id uuid, quantidade integer)
             where i.quantidade is null or i.quantidade <= 0 or i.quantidade > 1000000) then
    raise exception 'QUANTIDADE_INVALIDA: a quantidade de cada peça deve ser maior que zero';
  end if;

  -- trava os saldos dos itens ainda não lançados (ordem fixa)
  perform 1
  from public.stock_balances b
  join jsonb_to_recordset(v_agg) as i(variant_id uuid, quantidade integer) on i.variant_id = b.variant_id
  where not exists (select 1 from public.stock_movements m where m.idempotency_key = v_key || ':' || i.variant_id::text)
  order by b.variant_id
  for update of b;

  -- confere TODOS antes de lançar qualquer coisa
  select jsonb_agg(jsonb_build_object(
           'variant_id', i.variant_id, 'produto', p.nome, 'cor', v.cor, 'tamanho', v.tamanho,
           'disponivel', coalesce(b.quantidade, 0), 'solicitado', i.quantidade,
           'faltam', i.quantidade - coalesce(b.quantidade, 0)))
    into v_falta
  from jsonb_to_recordset(v_agg) as i(variant_id uuid, quantidade integer)
  left join public.stock_balances b on b.variant_id = i.variant_id
  left join public.product_variants v on v.id = i.variant_id
  left join public.products p on p.id = v.product_id
  where not exists (select 1 from public.stock_movements m where m.idempotency_key = v_key || ':' || i.variant_id::text)
    and (v.id is null or i.quantidade > coalesce(b.quantidade, 0));

  if v_falta is not null then
    raise exception 'ESTOQUE_INSUFICIENTE: % item(ns) sem estoque suficiente', jsonb_array_length(v_falta)
      using detail = jsonb_build_object('itens', v_falta)::text;
  end if;

  for v_item in
    select i.variant_id, i.quantidade
    from jsonb_to_recordset(v_agg) as i(variant_id uuid, quantidade integer)
    order by i.variant_id
  loop
    v_res := public._apply_movement(
      auth.uid(), v_item.variant_id, 'saida', v_item.quantidade, v_motivo,
      v_oc, nullif(trim(coalesce(p_obs, '')), ''), v_key || ':' || v_item.variant_id::text,
      p_ip, p_ua, null, now());
    if (v_res ->> 'duplicado')::boolean then
      v_dups := v_dups + 1;
    else
      v_n := v_n + 1;
      v_pecas := v_pecas + v_item.quantidade;
    end if;
    v_out := v_out || jsonb_build_object('variant_id', v_item.variant_id, 'estoque_posterior', v_res -> 'estoque_posterior');
  end loop;

  if v_n > 0 then
    perform public._write_audit(auth.uid(), 'saida_oc_lote', 'stock_movement', null,
      jsonb_build_object('oc', v_oc, 'motivo', v_motivo, 'itens', v_n, 'pecas', v_pecas), p_ip, p_ua);
  end if;

  return jsonb_build_object('oc', v_oc, 'motivo', v_motivo, 'lancados', v_n, 'repetidos', v_dups, 'pecas', v_pecas, 'itens', v_out);
end $$;

revoke all on function public.register_oc_exit(text, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_oc_exit(text, jsonb, text, text, text, text, text) to authenticated;
-- =============================================================================
-- ESTOQUE BIA — 0009: base dos relatórios (saldo + histórico de movimentações)
-- Rode no SQL Editor depois da 0008. Seguro para rodar mais de uma vez. Não altera dados.
--
-- stock_report = stock_overview + resumo do histórico de cada item:
--   movimentos (quantas vezes foi movimentado), total_entradas, total_saidas, ultima_movimentacao
-- Usada em Relatórios: "movimentados com saldo baixo" e "maiores estoques".
-- security_invoker: respeita o RLS (administrador vê tudo; valores em R$ só para admin).
-- =============================================================================

create or replace view public.stock_report with (security_invoker = true) as
select
  o.*,
  coalesce(h.movimentos, 0)       as movimentos,
  coalesce(h.entradas, 0)         as total_entradas,
  coalesce(h.saidas, 0)           as total_saidas,
  h.ultima_movimentacao           as ultima_movimentacao
from public.stock_overview o
left join (
  select
    product_variant_id                                                            as variant_id,
    count(*)::int                                                                 as movimentos,
    coalesce(sum(quantidade) filter (where tipo = 'entrada'), 0)::int             as entradas,
    coalesce(sum(quantidade) filter (where tipo = 'saida'), 0)::int               as saidas,
    max(created_at)                                                               as ultima_movimentacao
  from public.stock_movements
  group by product_variant_id
) h on h.variant_id = o.variant_id;

revoke all on public.stock_report from anon, authenticated;
grant select on public.stock_report to authenticated;
-- =============================================================================
-- ESTOQUE BIA — 0010: valores pendentes (aguardando / revisar) e limpeza segura
-- Rode no SQL Editor depois da 0009. Seguro para rodar mais de uma vez.
--
--  products.valor_pendente:
--    'aguardando' = item novo SEM preço (fica desativado até o administrador informar o valor)
--    'revisar'    = item ativo com valor PROVISÓRIO (aparece como alerta no dashboard)
--  Ao salvar um valor maior que zero, a marca some sozinha e (se aguardando) o item é ativado.
--  purge_unused_products(): apaga itens NUNCA movimentados (uso interno / service role).
-- =============================================================================

alter table public.products
  add column if not exists valor_pendente text
  check (valor_pendente is null or valor_pendente in ('aguardando', 'revisar'));

create index if not exists products_valor_pendente_idx
  on public.products (valor_pendente) where valor_pendente is not null;

create or replace function public.clear_valor_pendente() returns trigger
language plpgsql as $$
begin
  if new.valor_unitario is distinct from old.valor_unitario
     and new.valor_unitario > 0 and old.valor_pendente is not null then
    if old.valor_pendente = 'aguardando' then
      new.ativo := true;
    end if;
    new.valor_pendente := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_products_clear_pendente on public.products;
create trigger trg_products_clear_pendente before update on public.products
  for each row execute function public.clear_valor_pendente();

-- dashboard: acrescenta os alertas de valor
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
                       where tipo = 'entrada' and motivo not in ('correcao', 'contagem_inicial') and created_at >= v_today),
    'saidas_hoje', (select coalesce(sum(quantidade), 0) from public.stock_movements
                       where tipo = 'saida' and motivo <> 'correcao' and created_at >= v_today),
    'estoque_baixo', (select count(*) from public.stock_overview
                       where ativo and estoque_minimo > 0 and estoque <= estoque_minimo),
    'ocs_movimentadas', (select count(distinct oc_number) from public.stock_movements
                       where oc_number is not null and created_at >= now() - interval '30 days'),
    'aguardando_valor', (select count(*) from public.products where valor_pendente = 'aguardando'),
    'revisar_valor', coalesce((
      select jsonb_agg(to_jsonb(t)) from (
        select p.id, p.codigo, p.nome, b.quantidade as estoque
        from public.products p
        join public.product_variants v on v.product_id = p.id
        join public.stock_balances b on b.variant_id = v.id
        where p.valor_pendente = 'revisar'
        order by p.nome
        limit 20) t), '[]'::jsonb),
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

-- Apaga itens nunca movimentados e com saldo zero (confere de novo dentro da função).
create or replace function public.purge_unused_products(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p uuid;
  v_del integer := 0;
  v_skip integer := 0;
begin
  perform set_config('app.stock_write', 'on', true);
  foreach v_p in array coalesce(p_ids, '{}'::uuid[]) loop
    if exists (select 1 from public.stock_movements m
               join public.product_variants v on v.id = m.product_variant_id where v.product_id = v_p)
       or exists (select 1 from public.stock_balances b
                  join public.product_variants v on v.id = b.variant_id
                  where v.product_id = v_p and b.quantidade <> 0) then
      v_skip := v_skip + 1;
      continue;
    end if;
    delete from public.stock_balances where variant_id in (select id from public.product_variants where product_id = v_p);
    delete from public.product_variants where product_id = v_p;
    delete from public.products where id = v_p;
    v_del := v_del + 1;
  end loop;
  perform set_config('app.stock_write', 'off', true);
  return jsonb_build_object('apagados', v_del, 'ignorados', v_skip);
end $$;

revoke all on function public.purge_unused_products(uuid[]) from public, anon, authenticated;
grant execute on function public.purge_unused_products(uuid[]) to service_role;
-- =============================================================================
-- ESTOQUE BIA — 0011: valor unitário visível SOMENTE para administrador (no banco)
-- Rode no SQL Editor depois da 0010. Seguro para rodar mais de uma vez.
--
-- Antes: a tabela products deixava qualquer usuário logado ler valor_unitario pela API.
-- Agora:
--   * a coluna valor_unitario deixa de ser legível por `authenticated`
--   * o valor só sai por: product_price() / views stock_overview e stock_report
--     (devolvem NULL para quem não é admin) e pela view products_admin (vazia para não-admin)
--   * escrever o valor continua permitido só para admin (RLS), sem mudança
-- =============================================================================

create or replace function public.product_price(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select p.valor_unitario from public.products p where p.id = p_id and public.is_admin()
$$;

revoke all on function public.product_price(uuid) from public, anon, authenticated;
grant execute on function public.product_price(uuid) to authenticated;

-- mesma view de antes; só muda a origem do valor (função com checagem de admin)
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
  public.product_price(p.id)                                               as valor_unitario,
  public.product_price(p.id) * b.quantidade                                as valor_total,
  regexp_replace(p.nome, '[[:space:]-]*(PP|P|M|G|GG|XG|EXG|G[1-9]|[0-9]{2})[[:space:]]*$', '', 'i') as nome_base,
  coalesce(
    array_position(
      array['PP','P','M','G','GG','XG','EXG','G1','G2','G3','G4','G5','G6','G7','G8','G9'],
      upper(substring(p.nome from '(?i)(?:^|[[:space:]-])(PP|P|M|G|GG|XG|EXG|G[1-9]|[0-9]{2})[[:space:]]*$'))
    ),
    case
      when substring(p.nome from '(?:^|[[:space:]-])([0-9]{2})[[:space:]]*$') is not null
        then 100 + substring(p.nome from '(?:^|[[:space:]-])([0-9]{2})[[:space:]]*$')::int
      else 999
    end
  )                                  as tamanho_rank
from public.product_variants v
join public.products p on p.id = v.product_id
join public.stock_balances b on b.variant_id = v.id;

-- produtos COM valor, visível apenas para administrador (não-admin recebe 0 linhas)
create or replace view public.products_admin as
select p.* from public.products p where public.is_admin();

revoke all on public.products_admin from anon, authenticated;
grant select on public.products_admin to authenticated;

-- coluna de valor deixa de ser legível diretamente
revoke select on public.products from authenticated;
grant select (id, codigo, nome, categoria, descricao, ativo, valor_pendente, created_at, updated_at)
  on public.products to authenticated;
-- =============================================================================
-- ESTOQUE BIA — 0012: busca que ignora acentos e maiúsculas (Estoque, Produtos, Valores)
-- Rode no SQL Editor depois da 0011. Seguro para rodar mais de uma vez. Não altera dados existentes.
--
-- Problema: buscar "calca" não achava "CALÇA" (ilike diferencia acento).
-- Solução: products.busca = "código nome" sem acento e em minúsculas (coluna gerada, sempre
-- atualizada sozinha quando o nome ou o código mudam).
-- =============================================================================

create or replace function public.busca_norm(t text) returns text
language sql immutable parallel safe as $$
  select lower(translate(t,
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;

alter table public.products
  add column if not exists busca text
  generated always as (public.busca_norm(codigo || ' ' || nome)) stored;

grant select (busca) on public.products to authenticated;

-- stock_overview: mesma view, com a coluna de busca no FINAL
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
  public.product_price(p.id)                                               as valor_unitario,
  public.product_price(p.id) * b.quantidade                                as valor_total,
  regexp_replace(p.nome, '[[:space:]-]*(PP|P|M|G|GG|XG|EXG|G[1-9]|[0-9]{2})[[:space:]]*$', '', 'i') as nome_base,
  coalesce(
    array_position(
      array['PP','P','M','G','GG','XG','EXG','G1','G2','G3','G4','G5','G6','G7','G8','G9'],
      upper(substring(p.nome from '(?i)(?:^|[[:space:]-])(PP|P|M|G|GG|XG|EXG|G[1-9]|[0-9]{2})[[:space:]]*$'))
    ),
    case
      when substring(p.nome from '(?:^|[[:space:]-])([0-9]{2})[[:space:]]*$') is not null
        then 100 + substring(p.nome from '(?:^|[[:space:]-])([0-9]{2})[[:space:]]*$')::int
      else 999
    end
  )                                  as tamanho_rank,
  p.busca                            as busca
from public.product_variants v
join public.products p on p.id = v.product_id
join public.stock_balances b on b.variant_id = v.id;

-- products_admin: recria para incluir a nova coluna (p.* é expandido na criação)
create or replace view public.products_admin as
select p.* from public.products p where public.is_admin();

revoke all on public.products_admin from anon, authenticated;
grant select on public.products_admin to authenticated;
-- =============================================================================
-- ESTOQUE BIA — 0013: regra do "estoque baixo" e estoque mínimo padrão
-- Rode no SQL Editor depois da 0012. Seguro para rodar mais de uma vez.
--
--  * "ESTOQUE BAIXO" = quantidade ABAIXO do mínimo (no mínimo exato ainda é Normal).
--    Zerado continua "Zerado".
--  * mínimo padrão de item NOVO = 50 (antes 0)
--  * o alerta/contador do dashboard considera só itens que JÁ foram movimentados
--    (itens nunca usados não aparecem como "baixo")
--  Depois rode também supabase/manutencao/definir_estoque_minimo.sql (define 100 / 50 nos itens).
-- =============================================================================

alter table public.product_variants alter column estoque_minimo set default 50;

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
    when b.quantidade < v.estoque_minimo then 'baixo'
    else 'normal'
  end                                as status,
  (v.ativo and p.ativo)              as ativo,
  public.product_price(p.id)                                               as valor_unitario,
  public.product_price(p.id) * b.quantidade                                as valor_total,
  regexp_replace(p.nome, '[[:space:]-]*(PP|P|M|G|GG|XG|EXG|G[1-9]|[0-9]{2})[[:space:]]*$', '', 'i') as nome_base,
  coalesce(
    array_position(
      array['PP','P','M','G','GG','XG','EXG','G1','G2','G3','G4','G5','G6','G7','G8','G9'],
      upper(substring(p.nome from '(?i)(?:^|[[:space:]-])(PP|P|M|G|GG|XG|EXG|G[1-9]|[0-9]{2})[[:space:]]*$'))
    ),
    case
      when substring(p.nome from '(?:^|[[:space:]-])([0-9]{2})[[:space:]]*$') is not null
        then 100 + substring(p.nome from '(?:^|[[:space:]-])([0-9]{2})[[:space:]]*$')::int
      else 999
    end
  )                                  as tamanho_rank,
  p.busca                            as busca
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
                       where tipo = 'entrada' and motivo not in ('correcao', 'contagem_inicial') and created_at >= v_today),
    'saidas_hoje', (select coalesce(sum(quantidade), 0) from public.stock_movements
                       where tipo = 'saida' and motivo <> 'correcao' and created_at >= v_today),
    -- só itens que JÁ foram movimentados (os nunca usados não geram alerta)
    'estoque_baixo', (select count(*) from public.stock_report
                       where ativo and movimentos > 0 and estoque_minimo > 0 and estoque < estoque_minimo),
    'ocs_movimentadas', (select count(distinct oc_number) from public.stock_movements
                       where oc_number is not null and created_at >= now() - interval '30 days'),
    'aguardando_valor', (select count(*) from public.products where valor_pendente = 'aguardando'),
    'revisar_valor', coalesce((
      select jsonb_agg(to_jsonb(t)) from (
        select p.id, p.codigo, p.nome, b.quantidade as estoque
        from public.products p
        join public.product_variants v on v.product_id = p.id
        join public.stock_balances b on b.variant_id = v.id
        where p.valor_pendente = 'revisar'
        order by p.nome
        limit 20) t), '[]'::jsonb),
    'atencao', coalesce((
      select jsonb_agg(to_jsonb(t)) from (
        select variant_id, produto, cor, tamanho, estoque, estoque_minimo, status
        from public.stock_report
        where ativo and movimentos > 0 and estoque_minimo > 0 and estoque < estoque_minimo
        order by (estoque::numeric / estoque_minimo) asc, produto
        limit 10) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
-- =============================================================================
-- ESTOQUE BIA — 0014: perfil EXPEDIÇÃO
-- Rode no SQL Editor depois da 0013. Seguro para rodar mais de uma vez.
--
-- Perfil "expedicao": enxerga o estoque e faz SOMENTE saída por OC (register_oc_exit).
-- Não registra entrada, não faz saída avulsa, não corrige movimentação, não vê valores.
-- (O banco bloqueia mesmo que alguém tente chamar a API direto.)
-- Depois de rodar, troque a função do usuário em Usuários → Função → Expedição.
-- =============================================================================

alter type public.user_role add value if not exists 'expedicao';

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
  -- perfil Expedição: só faz SAÍDA POR OC (register_oc_exit); nada de entrada nem saída avulsa
  if exists (select 1 from public.profiles where id = auth.uid() and role::text = 'expedicao') then
    raise exception 'SEM_PERMISSAO: o perfil Expedição só pode fazer saída por OC';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then
    raise exception 'CHAVE_OBRIGATORIA: chave de operação ausente';
  end if;
  if p_motivo = 'contagem_inicial' then
    raise exception 'MOTIVO_INVALIDO: use a tela de Contagem inicial';
  end if;
  -- OC obrigatória: quem NÃO é administrador só registra saída com o número da OC
  if p_tipo = 'saida' and not public.is_admin()
     and nullif(regexp_replace(upper(trim(coalesce(p_oc, ''))), '^OC[[:space:]._-]*', ''), '') is null then
    raise exception 'OC_OBRIGATORIA: informe o número da OC para registrar a saída';
  end if;
  if p_motivo = 'correcao' and not public.is_admin() then
    raise exception 'SEM_PERMISSAO: apenas administradores fazem correções';
  end if;
  return public._apply_movement(auth.uid(), p_variant_id, p_tipo, p_quantidade, p_motivo,
    p_oc, p_observacao, p_idempotency_key, p_ip, p_ua, null, now());
end $$;

-- =============================================================================
-- ESTOQUE BIA — 0015: perfil CORTE (quem talha as peças)
-- Rode no SQL Editor depois da 0014. Seguro para rodar mais de uma vez.
--
-- Perfil "corte": só CONSULTA o estoque e a tela "Para talhar". Não registra entrada, saída
-- (nem por OC), contagem ou correção, e não vê valores. O bloqueio fica no banco: qualquer
-- tentativa de gravar uma movimentação com esse perfil é recusada, mesmo chamando a API direto.
-- Depois de rodar, crie o usuário em Usuários → Novo usuário → Função → Corte.
-- =============================================================================

alter type public.user_role add value if not exists 'corte';

create or replace function public.block_corte_movements() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_role::text = 'corte' or exists (select 1 from public.profiles where id = new.user_id and role::text = 'corte') then
    raise exception 'SEM_PERMISSAO: o perfil Corte só pode consultar o estoque';
  end if;
  return new;
end $$;

drop trigger if exists trg_block_corte_movements on public.stock_movements;
create trigger trg_block_corte_movements before insert on public.stock_movements
  for each row execute function public.block_corte_movements();

-- =============================================================================
-- ESTOQUE BIA — 0016: TALHAÇÃO (lançamento do que cada funcionária talhou)
-- Rode no SQL Editor depois da 0015. Seguro para rodar mais de uma vez.
--
-- Registro de produção do corte: funcionária + data + peça + tamanhos/quantidades.
-- NÃO mexe no estoque (é só o controle do que foi talhado).
-- Quem lança: administrador, operador e Corte. Quem apaga: o administrador, ou quem lançou (no mesmo dia).
-- Tudo é gravado pelas funções abaixo (nada de insert direto) e fica na auditoria.
-- =============================================================================

create or replace function public.can_talhacao() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo and p.role::text in ('admin', 'operator', 'corte')
  )
$$;
revoke all on function public.can_talhacao() from public, anon;
grant execute on function public.can_talhacao() to authenticated;

create table if not exists public.talhacao_funcionarias (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(btrim(nome)) between 2 and 60),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);
create unique index if not exists talhacao_funcionarias_nome_uq on public.talhacao_funcionarias (lower(nome));

create table if not exists public.talhacao_lancamentos (
  id             uuid primary key default gen_random_uuid(),
  lote_key       text not null,
  funcionaria_id uuid not null references public.talhacao_funcionarias (id) on delete restrict,
  data           date not null,
  peca           text not null check (char_length(btrim(peca)) between 2 and 200),
  tamanho        text not null check (char_length(btrim(tamanho)) between 1 and 20),
  quantidade     integer not null check (quantidade > 0 and quantidade <= 999999),
  observacao     text check (char_length(observacao) <= 300),
  user_id        uuid not null references public.profiles (id) on delete restrict,
  user_nome      text not null,
  created_at     timestamptz not null default now(),
  unique (lote_key, tamanho)
);
create index if not exists talhacao_lancamentos_data_idx on public.talhacao_lancamentos (data desc, created_at desc);
create index if not exists talhacao_lancamentos_func_idx on public.talhacao_lancamentos (funcionaria_id, data desc);

alter table public.talhacao_funcionarias enable row level security;
alter table public.talhacao_lancamentos enable row level security;

drop policy if exists talhacao_funcionarias_select on public.talhacao_funcionarias;
create policy talhacao_funcionarias_select on public.talhacao_funcionarias for select to authenticated using (public.can_talhacao());
drop policy if exists talhacao_lancamentos_select on public.talhacao_lancamentos;
create policy talhacao_lancamentos_select on public.talhacao_lancamentos for select to authenticated using (public.can_talhacao());

revoke all on public.talhacao_funcionarias from public, anon, authenticated;
revoke all on public.talhacao_lancamentos from public, anon, authenticated;
grant select on public.talhacao_funcionarias to authenticated;
grant select on public.talhacao_lancamentos to authenticated;

-- ------------------------------------------------------------ funcionárias ------
create or replace function public.talhacao_add_funcionaria(p_nome text, p_ip text default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_id uuid;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if not public.can_talhacao() then raise exception 'SEM_PERMISSAO: sem permissão para a Talhação'; end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 60 then
    raise exception 'NOME_INVALIDO: informe o nome (de 2 a 60 letras)';
  end if;
  insert into public.talhacao_funcionarias (nome, created_by) values (v_nome, auth.uid())
  on conflict (lower(nome)) do update set ativo = true
  returning id into v_id;
  perform public._write_audit(auth.uid(), 'talhacao_funcionaria_criada', 'talhacao_funcionaria', v_id,
    jsonb_build_object('nome', v_nome), p_ip, p_ua);
  return jsonb_build_object('id', v_id, 'nome', v_nome);
end $$;

create or replace function public.talhacao_remove_funcionaria(p_id uuid, p_ip text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if not public.can_talhacao() then raise exception 'SEM_PERMISSAO: sem permissão para a Talhação'; end if;
  update public.talhacao_funcionarias set ativo = false where id = p_id and ativo returning nome into v_nome;
  if v_nome is null then raise exception 'FUNCIONARIA_INVALIDA: funcionária não encontrada'; end if;
  perform public._write_audit(auth.uid(), 'talhacao_funcionaria_removida', 'talhacao_funcionaria', p_id,
    jsonb_build_object('nome', v_nome), p_ip, p_ua);
end $$;

-- ---------------------------------------------------------------- lançamento ---
create or replace function public.register_talhacao(
  p_funcionaria_id uuid, p_data date, p_peca text, p_itens jsonb, p_obs text, p_key text,
  p_ip text default null, p_ua text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_peca text := btrim(coalesce(p_peca, ''));
  v_key text := left(coalesce(p_key, ''), 60);
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_func text;
  v_nome text;
  v_novos integer;
  v_n integer;
  v_pecas bigint;
  v_itens jsonb;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if not public.can_talhacao() then raise exception 'SEM_PERMISSAO: sem permissão para a Talhação'; end if;
  if char_length(btrim(v_key)) < 8 then raise exception 'CHAVE_OBRIGATORIA: chave de operação ausente'; end if;
  if char_length(v_peca) < 2 or char_length(v_peca) > 200 then raise exception 'PECA_INVALIDA: selecione a peça'; end if;
  if p_data is null or p_data > v_hoje then raise exception 'DATA_INVALIDA: a data não pode ser futura'; end if;
  if p_data < v_hoje - 60 and not public.is_admin() then
    raise exception 'DATA_INVALIDA: só o administrador lança datas com mais de 60 dias';
  end if;
  if v_obs is not null and char_length(v_obs) > 300 then raise exception 'OBSERVACAO_INVALIDA: observação muito longa'; end if;
  select nome into v_func from public.talhacao_funcionarias where id = p_funcionaria_id and ativo;
  if v_func is null then raise exception 'FUNCIONARIA_INVALIDA: selecione a funcionária'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'LOTE_VAZIO: informe ao menos um tamanho com quantidade';
  end if;
  if jsonb_array_length(p_itens) > 60 then raise exception 'LOTE_GRANDE: tamanhos demais em um lançamento'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) x
    where jsonb_typeof(x) <> 'object'
       or btrim(coalesce(x->>'tamanho', '')) = '' or char_length(x->>'tamanho') > 20
       or case when coalesce(x->>'quantidade', '') ~ '^[0-9]{1,6}$' then (x->>'quantidade')::int else 0 end < 1
  ) then
    raise exception 'QUANTIDADE_INVALIDA: informe uma quantidade maior que zero em cada tamanho';
  end if;

  select nome into v_nome from public.profiles where id = auth.uid();

  insert into public.talhacao_lancamentos (lote_key, funcionaria_id, data, peca, tamanho, quantidade, observacao, user_id, user_nome)
  select v_key, p_funcionaria_id, p_data, v_peca, t.tamanho, t.qtd, v_obs, auth.uid(), v_nome
  from (
    select upper(btrim(x->>'tamanho')) as tamanho, sum((x->>'quantidade')::int)::int as qtd
    from jsonb_array_elements(p_itens) x group by 1
  ) t
  on conflict (lote_key, tamanho) do nothing;
  get diagnostics v_novos = row_count;

  select count(*), coalesce(sum(quantidade), 0) into v_n, v_pecas from public.talhacao_lancamentos where lote_key = v_key;

  if v_novos > 0 then
    select jsonb_agg(jsonb_build_object('tamanho', tamanho, 'quantidade', quantidade) order by tamanho) into v_itens
      from public.talhacao_lancamentos where lote_key = v_key;
    perform public._write_audit(auth.uid(), 'talhacao_lancada', 'talhacao', null,
      jsonb_build_object('funcionaria', v_func, 'data', p_data, 'peca', v_peca, 'itens', v_itens, 'pecas', v_pecas), p_ip, p_ua);
  end if;
  return jsonb_build_object('lancados', v_n, 'pecas', v_pecas, 'repetido', v_novos = 0);
end $$;

create or replace function public.talhacao_delete_lote(p_key text, p_ip text default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_info jsonb;
  v_pecas bigint;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if not public.can_talhacao() then raise exception 'SEM_PERMISSAO: sem permissão para a Talhação'; end if;
  if not exists (select 1 from public.talhacao_lancamentos where lote_key = p_key) then
    raise exception 'LANCAMENTO_INEXISTENTE: lançamento não encontrado';
  end if;
  if not public.is_admin() and exists (
    select 1 from public.talhacao_lancamentos
    where lote_key = p_key and (user_id <> auth.uid() or (created_at at time zone 'America/Sao_Paulo')::date <> v_hoje)
  ) then
    raise exception 'SEM_PERMISSAO: você só pode excluir lançamentos seus, feitos hoje';
  end if;
  select jsonb_build_object('funcionaria', f.nome, 'data', min(l.data), 'peca', min(l.peca),
           'itens', jsonb_agg(jsonb_build_object('tamanho', l.tamanho, 'quantidade', l.quantidade) order by l.tamanho)),
         sum(l.quantidade)
    into v_info, v_pecas
    from public.talhacao_lancamentos l join public.talhacao_funcionarias f on f.id = l.funcionaria_id
   where l.lote_key = p_key group by f.nome;
  delete from public.talhacao_lancamentos where lote_key = p_key;
  perform public._write_audit(auth.uid(), 'talhacao_excluida', 'talhacao', null, v_info || jsonb_build_object('pecas', v_pecas), p_ip, p_ua);
  return jsonb_build_object('pecas', v_pecas);
end $$;

revoke all on function public.talhacao_add_funcionaria(text, text, text) from public, anon, authenticated;
revoke all on function public.talhacao_remove_funcionaria(uuid, text, text) from public, anon, authenticated;
revoke all on function public.register_talhacao(uuid, date, text, jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function public.talhacao_delete_lote(text, text, text) from public, anon, authenticated;
grant execute on function public.talhacao_add_funcionaria(text, text, text) to authenticated;
grant execute on function public.talhacao_remove_funcionaria(uuid, text, text) to authenticated;
grant execute on function public.register_talhacao(uuid, date, text, jsonb, text, text, text, text) to authenticated;
grant execute on function public.talhacao_delete_lote(text, text, text) to authenticated;

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
