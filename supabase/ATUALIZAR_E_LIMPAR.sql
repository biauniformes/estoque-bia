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
-- ESTOQUE BIA — LIMPEZA DOS DADOS FICTÍCIOS (executar UMA vez, no SQL Editor)
--
-- Apaga: todas as movimentações, toda a auditoria, todos os produtos/variações/saldos
--        de demonstração e as contas de demonstração antigas (@stockuniformes.demo).
-- Mantém: as contas admin / estoque / expedicao (e suas senhas).
--
-- ATENÇÃO: é irreversível e remove TODO o histórico. Os gatilhos de imutabilidade são
-- desligados só dentro desta transação e religados antes do COMMIT.
-- NÃO rode depois de começar a usar o sistema de verdade.
-- =============================================================================

begin;

alter table public.stock_movements disable trigger trg_movements_immutable;
alter table public.audit_logs      disable trigger trg_audit_immutable;

delete from public.stock_movements;
delete from public.audit_logs;

alter table public.stock_movements enable trigger trg_movements_immutable;
alter table public.audit_logs      enable trigger trg_audit_immutable;

-- saldos só podem ser apagados com a permissão interna da transação
select set_config('app.stock_write', 'on', true);
delete from public.stock_balances;
select set_config('app.stock_write', 'off', true);

delete from public.product_variants;
delete from public.products;

-- contas de demonstração antigas (já desativadas); as reais permanecem
delete from auth.users where email like '%@stockuniformes.demo';

-- deixa um registro da limpeza na auditoria
insert into public.audit_logs (action, entity_type, metadata)
values ('limpeza_dados_demonstracao', 'system',
        jsonb_build_object('observacao', 'Dados fictícios removidos antes da importação do catálogo real'));

commit;

-- conferência (deve mostrar 0, 0, 0, 0 e 3 usuários)
select
  (select count(*) from public.products)         as produtos,
  (select count(*) from public.product_variants) as variacoes,
  (select count(*) from public.stock_movements)  as movimentacoes,
  (select count(*) from public.stock_balances)   as saldos,
  (select count(*) from public.profiles)         as usuarios;
