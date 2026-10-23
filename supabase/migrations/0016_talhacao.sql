-- =============================================================================
-- ESTOQUE BIA — 0016: TALHAÇÃO (lançamento do que cada funcionária talhou)
-- Rode no SQL Editor depois da 0015. Seguro para rodar mais de uma vez.
--
-- Registro de produção do corte: funcionária + data + peça + tamanhos/quantidades.
-- NÃO mexe no estoque (é só o controle do que foi talhado).
-- Quem lança: administrador, operador e Corte. Quem apaga: o administrador, ou quem lançou (no mesmo dia).
-- Tudo é gravado pelas funções abaixo (nada de insert direto) e fica na auditoria.
-- =============================================================================

create or replace function public.can_talhacao() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo and p.role::text in ('admin', 'operator', 'corte')
  )
$$;
revoke all on function public.can_talhacao() from public, anon;
grant execute on function public.can_talhacao() to authenticated;

create table if not exists public.talhacao_funcionarias (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(btrim(nome)) between 2 and 60),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);
create unique index if not exists talhacao_funcionarias_nome_uq on public.talhacao_funcionarias (lower(nome));

create table if not exists public.talhacao_lancamentos (
  id             uuid primary key default gen_random_uuid(),
  lote_key       text not null,
  funcionaria_id uuid not null references public.talhacao_funcionarias (id) on delete restrict,
  data           date not null,
  peca           text not null check (char_length(btrim(peca)) between 2 and 200),
  tamanho        text not null check (char_length(btrim(tamanho)) between 1 and 20),
  quantidade     integer not null check (quantidade > 0 and quantidade <= 999999),
  observacao     text check (char_length(observacao) <= 300),
  user_id        uuid not null references public.profiles (id) on delete restrict,
  user_nome      text not null,
  created_at     timestamptz not null default now(),
  unique (lote_key, tamanho)
);
create index if not exists talhacao_lancamentos_data_idx on public.talhacao_lancamentos (data desc, created_at desc);
create index if not exists talhacao_lancamentos_func_idx on public.talhacao_lancamentos (funcionaria_id, data desc);

alter table public.talhacao_funcionarias enable row level security;
alter table public.talhacao_lancamentos enable row level security;

drop policy if exists talhacao_funcionarias_select on public.talhacao_funcionarias;
create policy talhacao_funcionarias_select on public.talhacao_funcionarias for select to authenticated using (public.can_talhacao());
drop policy if exists talhacao_lancamentos_select on public.talhacao_lancamentos;
create policy talhacao_lancamentos_select on public.talhacao_lancamentos for select to authenticated using (public.can_talhacao());

revoke all on public.talhacao_funcionarias from public, anon, authenticated;
revoke all on public.talhacao_lancamentos from public, anon, authenticated;
grant select on public.talhacao_funcionarias to authenticated;
grant select on public.talhacao_lancamentos to authenticated;

-- ------------------------------------------------------------ funcionárias ------
create or replace function public.talhacao_add_funcionaria(p_nome text, p_ip text default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_id uuid;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if not public.can_talhacao() then raise exception 'SEM_PERMISSAO: sem permissão para a Talhação'; end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 60 then
    raise exception 'NOME_INVALIDO: informe o nome (de 2 a 60 letras)';
  end if;
  insert into public.talhacao_funcionarias (nome, created_by) values (v_nome, auth.uid())
  on conflict (lower(nome)) do update set ativo = true
  returning id into v_id;
  perform public._write_audit(auth.uid(), 'talhacao_funcionaria_criada', 'talhacao_funcionaria', v_id,
    jsonb_build_object('nome', v_nome), p_ip, p_ua);
  return jsonb_build_object('id', v_id, 'nome', v_nome);
end $$;

create or replace function public.talhacao_remove_funcionaria(p_id uuid, p_ip text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if not public.can_talhacao() then raise exception 'SEM_PERMISSAO: sem permissão para a Talhação'; end if;
  update public.talhacao_funcionarias set ativo = false where id = p_id and ativo returning nome into v_nome;
  if v_nome is null then raise exception 'FUNCIONARIA_INVALIDA: funcionária não encontrada'; end if;
  perform public._write_audit(auth.uid(), 'talhacao_funcionaria_removida', 'talhacao_funcionaria', p_id,
    jsonb_build_object('nome', v_nome), p_ip, p_ua);
end $$;

-- ---------------------------------------------------------------- lançamento ---
create or replace function public.register_talhacao(
  p_funcionaria_id uuid, p_data date, p_peca text, p_itens jsonb, p_obs text, p_key text,
  p_ip text default null, p_ua text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_peca text := btrim(coalesce(p_peca, ''));
  v_key text := left(coalesce(p_key, ''), 60);
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_func text;
  v_nome text;
  v_novos integer;
  v_n integer;
  v_pecas bigint;
  v_itens jsonb;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if not public.can_talhacao() then raise exception 'SEM_PERMISSAO: sem permissão para a Talhação'; end if;
  if char_length(btrim(v_key)) < 8 then raise exception 'CHAVE_OBRIGATORIA: chave de operação ausente'; end if;
  if char_length(v_peca) < 2 or char_length(v_peca) > 200 then raise exception 'PECA_INVALIDA: selecione a peça'; end if;
  if p_data is null or p_data > v_hoje then raise exception 'DATA_INVALIDA: a data não pode ser futura'; end if;
  if p_data < v_hoje - 60 and not public.is_admin() then
    raise exception 'DATA_INVALIDA: só o administrador lança datas com mais de 60 dias';
  end if;
  if v_obs is not null and char_length(v_obs) > 300 then raise exception 'OBSERVACAO_INVALIDA: observação muito longa'; end if;
  select nome into v_func from public.talhacao_funcionarias where id = p_funcionaria_id and ativo;
  if v_func is null then raise exception 'FUNCIONARIA_INVALIDA: selecione a funcionária'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'LOTE_VAZIO: informe ao menos um tamanho com quantidade';
  end if;
  if jsonb_array_length(p_itens) > 60 then raise exception 'LOTE_GRANDE: tamanhos demais em um lançamento'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) x
    where jsonb_typeof(x) <> 'object'
       or btrim(coalesce(x->>'tamanho', '')) = '' or char_length(x->>'tamanho') > 20
       or case when coalesce(x->>'quantidade', '') ~ '^[0-9]{1,6}$' then (x->>'quantidade')::int else 0 end < 1
  ) then
    raise exception 'QUANTIDADE_INVALIDA: informe uma quantidade maior que zero em cada tamanho';
  end if;

  select nome into v_nome from public.profiles where id = auth.uid();

  insert into public.talhacao_lancamentos (lote_key, funcionaria_id, data, peca, tamanho, quantidade, observacao, user_id, user_nome)
  select v_key, p_funcionaria_id, p_data, v_peca, t.tamanho, t.qtd, v_obs, auth.uid(), v_nome
  from (
    select upper(btrim(x->>'tamanho')) as tamanho, sum((x->>'quantidade')::int)::int as qtd
    from jsonb_array_elements(p_itens) x group by 1
  ) t
  on conflict (lote_key, tamanho) do nothing;
  get diagnostics v_novos = row_count;

  select count(*), coalesce(sum(quantidade), 0) into v_n, v_pecas from public.talhacao_lancamentos where lote_key = v_key;

  if v_novos > 0 then
    select jsonb_agg(jsonb_build_object('tamanho', tamanho, 'quantidade', quantidade) order by tamanho) into v_itens
      from public.talhacao_lancamentos where lote_key = v_key;
    perform public._write_audit(auth.uid(), 'talhacao_lancada', 'talhacao', null,
      jsonb_build_object('funcionaria', v_func, 'data', p_data, 'peca', v_peca, 'itens', v_itens, 'pecas', v_pecas), p_ip, p_ua);
  end if;
  return jsonb_build_object('lancados', v_n, 'pecas', v_pecas, 'repetido', v_novos = 0);
end $$;

create or replace function public.talhacao_delete_lote(p_key text, p_ip text default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_info jsonb;
  v_pecas bigint;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'NAO_AUTENTICADO: sessão inválida ou usuário inativo';
  end if;
  if not public.can_talhacao() then raise exception 'SEM_PERMISSAO: sem permissão para a Talhação'; end if;
  if not exists (select 1 from public.talhacao_lancamentos where lote_key = p_key) then
    raise exception 'LANCAMENTO_INEXISTENTE: lançamento não encontrado';
  end if;
  if not public.is_admin() and exists (
    select 1 from public.talhacao_lancamentos
    where lote_key = p_key and (user_id <> auth.uid() or (created_at at time zone 'America/Sao_Paulo')::date <> v_hoje)
  ) then
    raise exception 'SEM_PERMISSAO: você só pode excluir lançamentos seus, feitos hoje';
  end if;
  select jsonb_build_object('funcionaria', f.nome, 'data', min(l.data), 'peca', min(l.peca),
           'itens', jsonb_agg(jsonb_build_object('tamanho', l.tamanho, 'quantidade', l.quantidade) order by l.tamanho)),
         sum(l.quantidade)
    into v_info, v_pecas
    from public.talhacao_lancamentos l join public.talhacao_funcionarias f on f.id = l.funcionaria_id
   where l.lote_key = p_key group by f.nome;
  delete from public.talhacao_lancamentos where lote_key = p_key;
  perform public._write_audit(auth.uid(), 'talhacao_excluida', 'talhacao', null, v_info || jsonb_build_object('pecas', v_pecas), p_ip, p_ua);
  return jsonb_build_object('pecas', v_pecas);
end $$;

revoke all on function public.talhacao_add_funcionaria(text, text, text) from public, anon, authenticated;
revoke all on function public.talhacao_remove_funcionaria(uuid, text, text) from public, anon, authenticated;
revoke all on function public.register_talhacao(uuid, date, text, jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function public.talhacao_delete_lote(text, text, text) from public, anon, authenticated;
grant execute on function public.talhacao_add_funcionaria(text, text, text) to authenticated;
grant execute on function public.talhacao_remove_funcionaria(uuid, text, text) to authenticated;
grant execute on function public.register_talhacao(uuid, date, text, jsonb, text, text, text, text) to authenticated;
grant execute on function public.talhacao_delete_lote(text, text, text) to authenticated;
