-- =============================================================================
-- ESTOQUE BIA — define o ESTOQUE MÍNIMO de todos os itens (rode DEPOIS da 0013)
--
--   mínimo 100: camisetas PV (manga curta e longa) e calças de BRIM azuis ou brancas,
--               estas SOMENTE nos tamanhos P ao XG e 36 ao 50 (tamanho = última palavra do nome)
--   mínimo  50: todos os outros itens (inclusive calça BRIM em PP, G1+ e 34, 52 em diante)
--               e QUALQUER item nos tamanhos grandes G2, G3, G4, G5… (sempre 50)
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
           when upper(substring(btrim(p.nome) from '(\S+)$')) ~ '^G([2-9]|[0-9]{2,})$' then 50
           when (b ~ 'camiseta' and b ~ '\mpv\M' and b ~ '\m(mc|ml)\M')
             or (b ~ 'calca' and b ~ '\mbrim\M' and b ~ '\m(azul|branca|branco)\M'
                 and upper(substring(btrim(p.nome) from '(\S+)$')) in ('P','M','G','GG','XG','36','38','40','42','44','46','48','50'))
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
          'regra', 'camiseta PV MC/ML = 100; calça BRIM azul/branca = 100 só nos tamanhos P-XG e 36-50; demais = 50; tamanhos G2 em diante = sempre 50',
          'itens_100', (select count(*) from public.product_variants where estoque_minimo = 100),
          'itens_50',  (select count(*) from public.product_variants where estoque_minimo = 50)));

commit;

-- conferência
select estoque_minimo, count(*) as itens from public.product_variants group by 1 order by 1;
