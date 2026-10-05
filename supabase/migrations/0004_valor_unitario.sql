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
