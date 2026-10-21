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
