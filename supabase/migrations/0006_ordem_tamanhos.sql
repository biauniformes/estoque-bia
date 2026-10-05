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
