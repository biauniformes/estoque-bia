-- =============================================================================
-- 0018 — Exequibilidade / licitações: análises salvas no banco, anexos e documentos da empresa
--   • licitacoes         → uma análise de exequibilidade por licitação (JSON) + checklist de habilitação
--   • licitacao_anexos   → cotações, notas fiscais, certidões, atestados, laudos… (licitacao_id nulo = documento da empresa)
--   • bucket privado "licitacoes" no Storage (só administrador)
-- Tudo restrito a ADMINISTRADOR. Pode rodar de novo (idempotente).
-- =============================================================================

create table if not exists public.licitacoes (
  id                    uuid primary key default gen_random_uuid(),
  titulo                text not null check (char_length(btrim(titulo)) between 2 and 200),
  orgao                 text,
  edital                text,
  status                text not null default 'em_analise'
                        check (status in ('em_analise', 'proposta_enviada', 'diligencia', 'vencida', 'perdida', 'arquivada')),
  data_sessao           date,
  valor_estimado        numeric(14, 2),
  preco_ofertado        numeric(14, 2),
  status_exequibilidade text,
  analise               jsonb not null default '{}'::jsonb,
  checklist             jsonb not null default '{}'::jsonb,
  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists licitacoes_status_idx on public.licitacoes (status, updated_at desc);

create table if not exists public.licitacao_anexos (
  id            uuid primary key default gen_random_uuid(),
  licitacao_id  uuid references public.licitacoes (id) on delete cascade,
  categoria     text not null
                check (categoria in ('cotacao', 'nota_fiscal', 'contrato', 'atestado', 'certidao', 'balanco', 'laudo', 'declaracao', 'planilha', 'outro')),
  item          text,
  descricao     text not null check (char_length(btrim(descricao)) between 2 and 300),
  emissor       text,
  numero        text,
  emissao       date,
  validade      date,
  arquivo_path  text not null,
  arquivo_nome  text not null,
  mime          text,
  tamanho       integer,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now()
);
create index if not exists licitacao_anexos_lic_idx on public.licitacao_anexos (licitacao_id);
create index if not exists licitacao_anexos_validade_idx on public.licitacao_anexos (validade) where validade is not null;

alter table public.licitacoes enable row level security;
alter table public.licitacao_anexos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['licitacoes', 'licitacao_anexos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Storage: bucket privado, arquivos até 5 MB, só administrador lê/grava
insert into storage.buckets (id, name, public, file_size_limit)
values ('licitacoes', 'licitacoes', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;

drop policy if exists licitacoes_storage_admin on storage.objects;
create policy licitacoes_storage_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'licitacoes' and public.is_admin())
  with check (bucket_id = 'licitacoes' and public.is_admin());
