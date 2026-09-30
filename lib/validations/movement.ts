import { z } from "zod";
import { normalizeOc } from "@/lib/utils";

const ENTRADA = ["producao", "compra", "devolucao", "ajuste_positivo", "outros"] as const;
const SAIDA = ["oc", "producao", "perda", "avaria", "ajuste_negativo", "outros"] as const;

export const movementSchema = z
  .object({
    variantId: z.string().uuid("Selecione o produto, a cor e o tamanho."),
    tipo: z.enum(["entrada", "saida"]),
    quantidade: z.coerce
      .number({ error: "Informe a quantidade." })
      .int("A quantidade deve ser um número inteiro.")
      .min(1, "A quantidade deve ser maior que zero.")
      .max(1_000_000, "Quantidade acima do limite permitido."),
    motivo: z.enum([...ENTRADA, ...SAIDA], { error: "Selecione o motivo." }),
    oc: z.string().trim().max(30).default(""),
    observacao: z.string().trim().max(500, "Observação muito longa (máx. 500).").default(""),
    key: z.string().min(8).max(100),
  })
  .superRefine((v, ctx) => {
    const allowed: readonly string[] = v.tipo === "entrada" ? ENTRADA : SAIDA;
    if (!allowed.includes(v.motivo)) {
      ctx.addIssue({ code: "custom", path: ["motivo"], message: "Motivo não permitido para este tipo." });
    }
    const oc = normalizeOc(v.oc);
    if (v.motivo === "oc" && !oc) {
      ctx.addIssue({ code: "custom", path: ["oc"], message: "Informe o número da OC." });
    }
    if (oc && !/^[A-Z0-9./-]{1,20}$/.test(oc)) {
      ctx.addIssue({ code: "custom", path: ["oc"], message: "OC inválida (use letras, números, . / -)." });
    }
  });

export type MovementInput = z.input<typeof movementSchema>;

export const correctionSchema = z.object({
  movementId: z.string().uuid(),
  quantidadeCorreta: z.coerce.number().int("Número inteiro.").min(0, "Não pode ser negativa.").max(1_000_000),
  observacao: z.string().trim().min(3, "Descreva o motivo da correção.").max(500),
  key: z.string().min(8).max(100),
});
