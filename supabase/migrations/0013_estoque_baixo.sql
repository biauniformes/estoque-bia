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
