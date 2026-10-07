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
