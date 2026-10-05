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
