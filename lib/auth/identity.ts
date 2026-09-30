/** Domínio interno usado quando o usuário digita só o nome (ex.: "estoque"). Nenhum e-mail é enviado. */
export const LOGIN_DOMAIN = "estoquebia.app";

/** "Expedição" → "expedicao@estoquebia.app"; e-mails completos são apenas normalizados. */
export function toLoginEmail(input: string) {
  const v = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "");
  return v.includes("@") ? v : `${v}@${LOGIN_DOMAIN}`;
}

/** Nome de usuário para exibir: "estoque@estoquebia.app" → "estoque". */
export function displayLogin(email: string) {
  return email.endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -(LOGIN_DOMAIN.length + 1)) : email;
}
