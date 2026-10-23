-- =============================================================================
-- ESTOQUE BIA — 0015: perfil CORTE (quem talha as peças)
-- Rode no SQL Editor depois da 0014. Seguro para rodar mais de uma vez.
--
-- Perfil "corte": só CONSULTA o estoque e a tela "Para talhar". Não registra entrada, saída
-- (nem por OC), contagem ou correção, e não vê valores. O bloqueio fica no banco: qualquer
-- tentativa de gravar uma movimentação com esse perfil é recusada, mesmo chamando a API direto.
-- Depois de rodar, crie o usuário em Usuários → Novo usuário → Função → Corte.
-- =============================================================================

alter type public.user_role add value if not exists 'corte';

create or replace function public.block_corte_movements() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_role::text = 'corte' or exists (select 1 from public.profiles where id = new.user_id and role::text = 'corte') then
    raise exception 'SEM_PERMISSAO: o perfil Corte só pode consultar o estoque';
  end if;
  return new;
end $$;

drop trigger if exists trg_block_corte_movements on public.stock_movements;
create trigger trg_block_corte_movements before insert on public.stock_movements
  for each row execute function public.block_corte_movements();
