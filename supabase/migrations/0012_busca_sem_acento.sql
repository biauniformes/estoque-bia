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
