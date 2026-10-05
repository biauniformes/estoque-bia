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
