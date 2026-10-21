-- =============================================================================
-- ESTOQUE BIA — 0014: perfil EXPEDIÇÃO
-- Rode no SQL Editor depois da 0013. Seguro para rodar mais de uma vez.
--
-- Perfil "expedicao": enxerga o estoque e faz SOMENTE saída por OC (register_oc_exit).
-- Não registra entrada, não faz saída avulsa, não corrige movimentação, não vê valores.
-- (O banco bloqueia mesmo que alguém tente chamar a API direto.)
-- Depois de rodar, troque a função do usuário em Usuários → Função → Expedição.
-- =============================================================================

alter type public.user_role add value if not exists 'expedicao';

create or replace function public.register_movement(
  p_variant_id uuid, p_tipo public.movement_type, p_quantidade integer,
  p_motivo public.movement_reason, p_oc text, p_observacao text, p_idempotency_key text,
  p_ip text default null, p_ua text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  -- perfil Expedição: só faz SAÍDA POR OC (register_oc_exit); nada de entrada nem saída avulsa
  if exists (select 1 from public.profiles where id = auth.uid() and role::text = 'expedicao') then
    raise exception 'SEM_PERMISSAO: o perfil Expedição só pode fazer saída por OC';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then
    raise exception 'CHAVE_OBRIGATORIA: chave de operação ausente';
  end if;
  if p_motivo = 'contagem_inicial' then
    raise exception 'MOTIVO_INVALIDO: use a tela de Contagem inicial';
  end if;
  -- OC obrigatória: quem NÃO é administrador só registra saída com o número da OC
  if p_tipo = 'saida' and not public.is_admin()
     and nullif(regexp_replace(upper(trim(coalesce(p_oc, ''))), '^OC[[:space:]._-]*', ''), '') is null then
    raise exception 'OC_OBRIGATORIA: informe o número da OC para registrar a saída';
  end if;
  if p_motivo = 'correcao' and not public.is_admin() then
    raise exception 'SEM_PERMISSAO: apenas administradores fazem correções';
  end if;
  return public._apply_movement(auth.uid(), p_variant_id, p_tipo, p_quantidade, p_motivo,
    p_oc, p_observacao, p_idempotency_key, p_ip, p_ua, null, now());
end $$;
