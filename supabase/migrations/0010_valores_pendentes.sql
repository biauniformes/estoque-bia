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
