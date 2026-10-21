-- =============================================================================
-- ESTOQUE BIA — define o ESTOQUE MÍNIMO de todos os itens (rode DEPOIS da 0013)
--
--   mínimo 100: camisetas PV (manga curta e longa) e calças de BRIM azuis ou brancas
--   mínimo  50: todos os outros itens
--
-- Pode rodar de novo quando quiser (recalcula). Para mudar o mínimo de UM item,
-- use Produtos → variação → Editar (essa edição manual vale até rodar este script de novo).
-- As alterações em lote NÃO enchem a auditoria: só um registro-resumo é gravado.
-- =============================================================================

begin;

alter table public.product_variants disable trigger trg_audit_variants;

with regra as (
  select v.id as variant_id,
         case
           when (b ~ 'camiseta' and b ~ '\mpv\M' and b ~ '\m(mc|ml)\M')
             or (b ~ 'calca' and b ~ '\mbrim\M' and b ~ '\m(azul|branca|branco)\M')
           then 100 else 50
         end as minimo
  from public.product_variants v
  join public.products p on p.id = v.product_id,
  lateral (select public.busca_norm(p.nome) as b) x
)
update public.product_variants v
   set estoque_minimo = r.minimo, updated_at = now()
  from regra r
 where r.variant_id = v.id and v.estoque_minimo is distinct from r.minimo;

alter table public.product_variants enable trigger trg_audit_variants;

insert into public.audit_logs (action, entity_type, metadata)
values ('estoque_minimo_definido', 'system',
        jsonb_build_object(
          'regra', 'camiseta PV MC/ML e calça BRIM azul/branca = 100; demais = 50',
          'itens_100', (select count(*) from public.product_variants where estoque_minimo = 100),
          'itens_50',  (select count(*) from public.product_variants where estoque_minimo = 50)));

commit;

-- conferência
select estoque_minimo, count(*) as itens from public.product_variants group by 1 order by 1;
