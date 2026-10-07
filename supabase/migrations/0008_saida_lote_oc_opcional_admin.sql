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
