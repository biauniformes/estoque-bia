-- =============================================================================
-- STOCK UNIFORMES — 0003: Row Level Security e privilégios
-- Regras:
--   * anon não acessa nada.
--   * movimentações, saldo e auditoria NÃO têm INSERT/UPDATE/DELETE para usuários:
--     só as funções SECURITY DEFINER escrevem.
--   * admin lê tudo; operador lê apenas as próprias movimentações.
--   * nada é apagado (sem DELETE em nenhuma tabela).
-- =============================================================================

alter table public.profiles         enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.stock_balances   enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.audit_logs       enable row level security;

-- ----------------------------------------------------------------- PRIVILÉGIOS
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated, service_role;

grant select on public.profiles, public.products, public.product_variants,
  public.stock_balances, public.stock_movements, public.audit_logs to authenticated;
grant select on public.stock_overview, public.movements_detailed, public.oc_summary to authenticated;
-- cadastros: escrita controlada por RLS (somente admin); sem DELETE
grant insert, update on public.products, public.product_variants to authenticated;
grant update (nome, role, ativo) on public.profiles to authenticated;

grant execute on function
  public.is_admin(), public.is_active_user(),
  public.register_movement(uuid, public.movement_type, integer, public.movement_reason, text, text, text, text, text),
  public.correct_movement(uuid, integer, text, text, text, text),
  public.dashboard_summary(),
  public.variant_summary(uuid),
  public.log_audit_event(text, text, uuid, jsonb, text, text)
to authenticated;

-- uso interno (seed / backend com service role)
grant execute on function
  public._apply_movement(uuid, uuid, public.movement_type, integer, public.movement_reason, text, text, text, text, text, uuid, timestamptz)
to service_role;

-- ----------------------------------------------------------------- POLICIES --
-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- products / variants: todos os usuários ativos leem; só admin escreve
create policy products_select on public.products for select to authenticated
  using (public.is_active_user());
create policy products_insert on public.products for insert to authenticated
  with check (public.is_admin());
create policy products_update on public.products for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy variants_select on public.product_variants for select to authenticated
  using (public.is_active_user());
create policy variants_insert on public.product_variants for insert to authenticated
  with check (public.is_admin());
create policy variants_update on public.product_variants for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- saldo: somente leitura
create policy balances_select on public.stock_balances for select to authenticated
  using (public.is_active_user());

-- movimentações: admin vê tudo; operador só as suas. Sem policy de escrita.
create policy movements_select_admin on public.stock_movements for select to authenticated
  using (public.is_admin());
create policy movements_select_own on public.stock_movements for select to authenticated
  using (user_id = auth.uid() and public.is_active_user());

-- auditoria: somente admin lê. Sem policy de escrita.
create policy audit_select_admin on public.audit_logs for select to authenticated
  using (public.is_admin());

-- Impede rebaixar/desativar o último administrador ativo.
create or replace function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.ativo and (new.role <> 'admin' or not new.ativo) then
    if not exists (select 1 from public.profiles where role = 'admin' and ativo and id <> old.id) then
      raise exception 'ULTIMO_ADMIN: deve existir ao menos um administrador ativo';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_last_admin before update on public.profiles
  for each row execute function public.guard_last_admin();
