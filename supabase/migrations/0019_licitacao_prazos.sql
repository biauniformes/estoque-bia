-- Prazos da licitação (diligência, amostra, recurso, assinatura, entrega...) com alerta na tela.
-- Cada item: { id, tipo, descricao, quando: "AAAA-MM-DDTHH:MM" (horário local), concluido }
alter table public.licitacoes
  add column if not exists prazos jsonb not null default '[]'::jsonb;
