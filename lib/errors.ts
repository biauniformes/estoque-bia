import type { ActionResult } from "@/types";

const MESSAGES: Record<string, string> = {
  ESTOQUE_INSUFICIENTE: "Estoque insuficiente para esta saída.",
  QUANTIDADE_INVALIDA: "Informe uma quantidade válida (maior que zero).",
  OC_OBRIGATORIA: "Informe o número da OC.",
  OC_INVALIDA: "Número de OC inválido. Use apenas letras, números, ponto, barra ou hífen.",
  MOTIVO_INVALIDO: "Motivo não permitido para este tipo de movimentação.",
  PRODUTO_INEXISTENTE: "Produto não encontrado.",
  PRODUTO_INATIVO: "Este produto está desativado.",
  USUARIO_INVALIDO: "Usuário inexistente ou inativo.",
  NAO_AUTENTICADO: "Sessão expirada. Entre novamente.",
  SEM_PERMISSAO: "Você não tem permissão para esta ação.",
  CHAVE_OBRIGATORIA: "Operação inválida. Recarregue a página e tente novamente.",
  CHAVE_DUPLICADA: "Esta operação já foi processada.",
  OBSERVACAO_OBRIGATORIA: "Descreva o motivo da correção.",
  OBSERVACAO_INVALIDA: "Observação muito longa.",
  MOVIMENTACAO_INEXISTENTE: "Movimentação não encontrada.",
  NAO_CORRIGIR_CORRECAO: "Corrija a movimentação original, não a correção.",
  SEM_DIFERENCA: "A quantidade informada já é a quantidade efetiva.",
  ULTIMO_ADMIN: "Deve existir pelo menos um administrador ativo.",
  SALDO_PROTEGIDO: "O saldo não pode ser alterado diretamente.",
  LOTE_VAZIO: "Preencha ao menos uma quantidade.",
  LOTE_GRANDE: "No máximo 1000 itens por lançamento.",
  REGISTRO_IMUTAVEL: "Movimentações e auditoria não podem ser editadas ou apagadas.",
};

type DbError = { message?: string; details?: string | null; code?: string };

/** Converte erro do Postgres/PostgREST ("CODIGO: texto") em resultado amigável. */
export function dbErrorToResult(error: DbError): Extract<ActionResult, { ok: false }> {
  const raw = error.message ?? "";
  const m = raw.match(/^([A-Z_]{4,}):\s*([\s\S]*)$/);
  if (m) {
    const code = m[1];
    let detail: Record<string, unknown> | undefined;
    if (error.details) {
      try {
        detail = JSON.parse(error.details);
      } catch {
        detail = undefined;
      }
    }
    return { ok: false, code, error: MESSAGES[code] ?? m[2] ?? "Operação não permitida.", detail };
  }
  if (error.code === "42501" || /permission denied|row-level security/i.test(raw)) {
    return { ok: false, code: "SEM_PERMISSAO", error: MESSAGES.SEM_PERMISSAO };
  }
  if (error.code === "23505") {
    return { ok: false, code: "DUPLICADO", error: "Já existe um registro com esses dados (código, SKU ou combinação)." };
  }
  console.error("[db-error]", error);
  return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
}
