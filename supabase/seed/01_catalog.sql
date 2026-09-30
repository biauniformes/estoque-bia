-- Catálogo fictício: 8 produtos / 20 variações (saldo inicial 0; as movimentações
-- fictícias são criadas por `npm run seed`, que usa as funções reais do banco).

insert into public.products (codigo, nome, categoria, descricao) values
  ('CAM-001', 'Camiseta Básica',      'camisetas',       'Camiseta malha 30.1 penteada, gola redonda'),
  ('POL-001', 'Camisa Polo',          'camisas_polo',    'Polo piquet com punho em ribana'),
  ('SOC-001', 'Camisa Social',        'camisas_sociais', 'Social manga longa, tricoline'),
  ('JAQ-001', 'Jaqueta Operacional',  'jaquetas',        'Jaqueta em brim com refletivo'),
  ('CAL-001', 'Calça Operacional',    'calcas',          'Calça em sarja com bolsos laterais'),
  ('BER-001', 'Bermuda Operacional',  'bermudas',        'Bermuda em sarja com bolsos cargo'),
  ('JAL-001', 'Jaleco',               'jalecos',         'Jaleco manga longa em gabardine'),
  ('COL-001', 'Colete Operacional',   'coletes',         'Colete com faixas refletivas')
on conflict do nothing;

with v(codigo, cor, tamanho, modelo, estoque_minimo) as (values
  ('CAM-001', 'Branca', 'P',  'Unissex',   40),
  ('CAM-001', 'Branca', 'M',  'Unissex',   50),
  ('CAM-001', 'Branca', 'G',  'Unissex',   50),
  ('CAM-001', 'Branca', 'GG', 'Unissex',   30),
  ('CAM-001', 'Preta',  'M',  'Unissex',   40),
  ('POL-001', 'Azul',   'M',  'Masculino', 30),
  ('POL-001', 'Azul',   'G',  'Masculino', 30),
  ('SOC-001', 'Branca', 'M',  'Masculino', 20),
  ('SOC-001', 'Branca', 'G',  'Masculino', 20),
  ('JAQ-001', 'Azul',   'M',  'Unissex',   20),
  ('JAQ-001', 'Azul',   'G',  'Unissex',   20),
  ('JAQ-001', 'Azul',   'GG', 'Unissex',   15),
  ('CAL-001', 'Azul',   'M',  'Unissex',   30),
  ('CAL-001', 'Azul',   'G',  'Unissex',   30),
  ('CAL-001', 'Azul',   'GG', 'Unissex',   20),
  ('BER-001', 'Azul',   'M',  'Unissex',   25),
  ('BER-001', 'Azul',   'G',  'Unissex',   25),
  ('JAL-001', 'Branco', 'M',  'Unissex',   15),
  ('JAL-001', 'Branco', 'G',  'Unissex',   15),
  ('COL-001', 'Laranja','G',  'Unissex',   10)
)
insert into public.product_variants (product_id, cor, tamanho, modelo, sku, estoque_minimo)
select p.id, v.cor, v.tamanho, v.modelo,
       v.codigo || '-' || upper(left(v.cor, 3)) || '-' || v.tamanho, v.estoque_minimo
from v join public.products p on p.codigo = v.codigo
on conflict do nothing;
