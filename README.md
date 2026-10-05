# ESTOQUE BIA

**Controle inteligente de estoque para confecção** — MVP (v1).

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · componentes no estilo shadcn/ui · Supabase (Postgres, Auth, RLS) · Vercel.

> **Princípio central:** ninguém edita o saldo. O estoque é consequência das movimentações
> (`ESTOQUE ATUAL = ENTRADAS − SAÍDAS`), gravadas por funções transacionais no banco. O histórico é imutável;
> erros são corrigidos com uma **nova movimentação de ajuste**, nunca apagando ou editando a original.

---

## Sumário

1. [Instalação](#instalação)
2. [Configuração do Supabase](#configuração-do-supabase)
3. [Variáveis de ambiente](#variáveis-de-ambiente)
4. [Criação das tabelas](#criação-das-tabelas)
5. [Criação dos usuários e dados fictícios](#criação-dos-usuários-e-dados-fictícios)
6. [Execução local](#execução-local)
7. [Testes](#testes)
8. [Deploy na Vercel](#deploy-na-vercel)
9. [Estrutura do projeto](#estrutura-do-projeto)
10. [Controle de permissões](#controle-de-permissões)
11. [Como o estoque e a auditoria funcionam](#como-o-estoque-e-a-auditoria-funcionam)
12. [Preparado para o futuro](#preparado-para-o-futuro)

---

## Instalação

Requisitos: Node.js 20+ e npm.

```bash
npm install
```

## Configuração do Supabase

1. Crie um projeto em <https://supabase.com>.
2. **Authentication → Sign In / Providers → Email**: mantenha *Enable email provider* ligado e **desative “Allow new users to sign up”**
   (cadastro público). Os usuários são criados apenas por administradores — isso é importante para a segurança dos papéis.
3. Em **Project Settings → API**, copie a *Project URL*, a chave *anon* e a chave *service_role*.

## Variáveis de ambiente

```bash
cp .env.example .env.local
```

| Variável | Onde usar | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador + servidor | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador + servidor | pública (protegida por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **somente servidor** | secreta. Ignora RLS. Nunca use `NEXT_PUBLIC_`. Usada pelo painel de Usuários e pelo seed. |
| `SEED_PASSWORD` | só no `npm run seed` | opcional; se vazio, o seed gera uma senha aleatória |

Nenhum segredo fica no código. `.env*` está no `.gitignore` (exceto `.env.example`).

## Criação das tabelas

Execute **em ordem** no **SQL Editor** do Supabase (ou com `supabase db push` se usar a CLI):

1. `supabase/migrations/0001_schema.sql` — enums, tabelas, índices, triggers (imutabilidade, guarda de saldo)
2. `supabase/migrations/0002_functions.sql` — views, auditoria automática, `register_movement`, `correct_movement`, resumos
3. `supabase/migrations/0003_rls_grants.sql` — RLS, policies e privilégios
4. `supabase/migrations/0004_valor_unitario.sql` — valor unitário por produto, valor total em estoque (visível só a administradores) e auditoria de exportações
5. `supabase/migrations/0005_contagem_inicial.sql` — motivo "Contagem inicial" e lançamento em lote
6. `supabase/migrations/0006_ordem_tamanhos.sql` — ordena itens por modelo e tamanho (PP, P, M, G, GG, XG, G1…G5) a partir do nome

`supabase/setup_completo.sql` reúne 0001–0006 num arquivo só (instalação nova, **sem** dados fictícios).
`supabase/seed/01_catalog.sql` é um catálogo fictício **opcional**, só para demonstração.

## Importar o catálogo real (planilha) e remover os dados fictícios

1. **Remover os dados de demonstração** (uma vez, irreversível): rode `supabase/manutencao/limpar_dados_demonstracao.sql` no SQL Editor.
   (`supabase/ATUALIZAR_E_LIMPAR.sql` = migration 0004 + limpeza, para colar de uma vez.)
2. **Importar os itens** da planilha do sistema (código, nome e valor unitário; a quantidade é ignorada — o estoque começa em 0):

```bash
npm run import:itens -- "C:\caminho
elatório de estoque.xlsx" --simular   # só mostra o que faria
npm run import:itens -- "C:\caminho
elatório de estoque.xlsx"             # importa
```
Pode ser repetido: itens novos são criados e nome/valor dos existentes são atualizados (saldo e histórico nunca mudam).
3. Lance as quantidades na tela **Contagem inicial** (somente administrador): digite as quantidades da tabela e clique em *Lançar contagem*. Cada item preenchido vira uma entrada com o motivo "Contagem inicial"; o lote é tudo-ou-nada e protegido contra duplicidade; o rascunho fica salvo no aparelho.

## Relatórios (Excel)

Menu **Relatórios** (administrador): baixa **Estoque atual** (código, produto, quantidade, valor unitário, valor total com fórmulas, situação e linha de totais) e **Movimentações** por período. Cada exportação fica registrada na auditoria.

## Criação dos usuários e dados fictícios (opcional — só demonstração)

```bash
npm run seed
```

Cria pela **autenticação real do Supabase**: 2 administradores e 3 operadores, e ~20 dias de movimentações
(entradas de produção/compra e saídas para OCs 18–25) usando a mesma função do banco que o sistema usa — então saldo,
“estoque anterior/posterior” e auditoria ficam consistentes. Inclui o caso do enunciado: **Jaqueta Operacional Azul G = 30** unidades e OC 22.

- Usuários de demonstração: `admin`, `estoque` e `expedicao` (o login aceita só o nome; o sistema completa `@estoquebia.app` internamente).
- A senha vem de `SEED_PASSWORD`; se não definida, é gerada e **exibida uma única vez** no terminal.
- Não há senha fixa no código. Em produção, desative/troque os usuários de demonstração e crie os reais em **Usuários**.
- Para criar o primeiro administrador real sem o seed: crie o usuário em *Authentication → Users* e promova o perfil via SQL:
  `update public.profiles set role='admin' where email='voce@empresa.com';`
  (o papel vem sempre da tabela `profiles`; usuários criados pelo painel já recebem a função escolhida).

## Execução local

```bash
npm run dev      # http://localhost:3000
```

Testes em tablet: abra `http://IP-DO-SEU-PC:3000` na mesma rede. (Em HTTP puro o sistema continua funcionando; a chave
anti-duplicidade usa um fallback quando `crypto.randomUUID` não está disponível.)

## Testes

```bash
npm run check        # typecheck + lint + testes do banco
npm run test:db      # só os testes do banco
```

`npm run test:db` aplica as migrations em um Postgres local embarcado (PGlite, emulando `auth.uid()` e os papéis do Supabase) e verifica,
entre outros (57 verificações):

| Cenário da especificação | Resultado esperado |
|---|---|
| T1 entrada de 30 jaquetas | estoque = 30 |
| T2 saída de 10 p/ OC 22 | estoque = 20 |
| T3 saída de 20 p/ OC 22 | estoque = 0 |
| T4 retirar 1 com estoque 0 | **bloqueado** (`ESTOQUE_INSUFICIENTE`), saldo inalterado |
| T5 operador consulta auditoria | sem acesso (RLS) |
| T6 admin consulta auditoria | acesso |
| T7 saída p/ OC | registra produto, qtd, OC, usuário, data/hora, estoque anterior/posterior, IP e user-agent |
| T8 excluir/editar movimentação | **bloqueado** (inclusive para admin e service role — trigger) |
| T9 duas confirmações rápidas (inclusive simultâneas) | **uma** movimentação |

Também cobre: quantidade 0/negativa, OC obrigatória/inválida, motivo incompatível, produto inexistente/inativo, usuário
desativado, edição direta de saldo (bloqueada), correção administrativa, último administrador protegido, operador só enxerga as próprias movimentações.

> **O que o teste automático não cobre:** as telas e a integração com o Supabase real (Auth, PostgREST). Após subir seu projeto, faça um
> roteiro manual de fumaça: login como operador → entrada → saída para OC → estoque insuficiente → login como admin → Auditoria/OCs/Usuários.

## Deploy na Vercel

GitHub → Vercel → Supabase:

1. Suba o projeto para um repositório no GitHub (o `.gitignore` já protege `.env*`).
2. Na Vercel: **Add New → Project**, importe o repositório (framework detectado: Next.js).
3. Em **Environment Variables**, cadastre as 3 variáveis (marque `SUPABASE_SERVICE_ROLE_KEY` como *Sensitive*; não use `NEXT_PUBLIC_` nela).
4. Deploy. Depois, no Supabase em **Authentication → URL Configuration**, defina *Site URL* com o domínio da Vercel.
5. Rode `npm run seed` **localmente** (apontando para o mesmo projeto Supabase) se quiser os dados de demonstração.

O build (`npm run build`), TypeScript e ESLint passam sem erros.

## Estrutura do projeto

```text
app/
  (auth)/login/          login
  (app)/                 área autenticada (layout com menu)
    page.tsx             início: operador = 4 botões grandes; admin → /dashboard
    dashboard/ estoque/ entrada/ saida/ movimentacoes/
    produtos/ ocs/ usuarios/ auditoria/ acesso-negado/
  actions/               Server Actions (movimentos, produtos, usuários, login)
  auth/                  route handlers: signout, inactive
components/
  ui/                    Button, Input/Select, Card, Badge, Dialog (estilo shadcn)
  shared/                DataTable, Filters, Pagination, ConfirmDialog, badges, estados, AppShell
  estoque/               MovementForm, ProductSelector, QuantityInput
  movimentacoes/ produtos/ usuarios/
lib/
  supabase/              clientes server / admin (service role) / env
  auth/session.ts        requireUser, requireAdmin
  validations/           schemas zod (movimento, produto)
  errors.ts constants.ts utils.ts request-meta.ts
services/                consultas (estoque, movimentações, auditoria)
supabase/
  migrations/            0001 schema · 0002 funções · 0003 RLS
  seed/                  catálogo fictício
scripts/                 seed.ts (usuários + histórico) · test-db.ts
proxy.ts                 renova sessão e bloqueia rotas privadas (Next 16: "proxy" = antigo middleware)
```

## Controle de permissões

Verificado em **três camadas**: `proxy.ts` (otimista) → servidor (`requireUser`/`requireAdmin` em cada página e action) → **banco (RLS + funções)**.
Mesmo chamando o Supabase direto com a chave anon, um operador não consegue nada além do permitido.

| Recurso | Administrador | Operador de estoque |
|---|:---:|:---:|
| Ver estoque, detalhe do item | ✅ | ✅ |
| Registrar entrada / saída (com OC) | ✅ | ✅ |
| Movimentações | todas | só as próprias |
| Dashboard, Produtos, OCs | ✅ | ❌ |
| Corrigir movimentação (ajuste) | ✅ | ❌ |
| Usuários (criar, função, desativar, senha) | ✅ | ❌ |
| Auditoria completa | ✅ | ❌ |
| Editar/excluir movimentação ou saldo | ❌ ninguém | ❌ ninguém |

Tentativas de operadores em áreas administrativas são **registradas** na auditoria (`operacao_invalida`).

## Como o estoque e a auditoria funcionam

- **`register_movement`** (Postgres, `SECURITY DEFINER`) numa única transação: trava a linha do saldo → valida (quantidade > 0, motivo x tipo, OC, produto ativo, usuário ativo, **saldo nunca negativo**) → atualiza o saldo → grava a movimentação (com snapshots de usuário, estoque anterior/posterior, IP, user-agent) → grava a auditoria. Se algo falhar, nada é gravado.
- **Duplo clique:** o botão é travado e cada operação carrega uma `idempotency_key`; o banco devolve a mesma movimentação se a chave se repetir (mesmo em requisições simultâneas).
- **Imutabilidade:** triggers bloqueiam `UPDATE`/`DELETE`/`TRUNCATE` em `stock_movements` e `audit_logs`, e o saldo só muda dentro das funções.
- **Correção:** `correct_movement` (admin) mantém o registro original e cria um ajuste com a diferença (ex.: entrada 50 corrigida para 40 → saída de ajuste de 10).
- **Auditoria de cadastros** (produtos, variações, usuários, papéis) por triggers no banco; login/logout/acessos administrativos/tentativas inválidas pela aplicação.
- “Entradas/Saídas hoje” usam o fuso `America/Sao_Paulo` e não contam ajustes de correção.
- OC: `OC 22`, `oc-22` e `22` são normalizadas para `22`.

## Preparado para o futuro

Sem reconstruir o sistema: `stock_balances.quantidade_reservada` (físico × reservado × disponível, hoje sempre 0, já exposto como `disponivel` na view `stock_overview`);
`product_variants.barcode` (QR/código de barras); `stock_movements.corrige_movement_id`/`idempotency_key` (integrações); camada `services/` para relatórios/Excel;
OCs como texto normalizado (podem virar tabela `purchase_orders` ligada por `oc_number`).

**Limites conhecidos da v1:** os formulários de entrada/saída carregam todas as variações ativas de uma vez (ok para alguns milhares; acima disso, trocar por busca no servidor);
não há recuperação de senha por e-mail (um administrador redefine em Usuários).
