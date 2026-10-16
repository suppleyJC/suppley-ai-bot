/**
 * portalUnicoAuth — autenticação no Portal Único Siscomex por PAR DE CHAVES.
 *
 * COMO FUNCIONA (documentação oficial, `/api/plat/` → plat-auth.json):
 *   1. uma PESSOA entra no portal com certificado digital e gera o par de
 *      chaves em "Perfil do usuário";
 *   2. o par vai para o `.env` deste servidor;
 *   3. aqui trocamos o par por um token de sessão.
 *
 *   POST /api/autenticar/chave-acesso
 *     Client-Id, Client-Secret, Role-Type  (todos obrigatórios)
 *     → 200 devolve os cabeçalhos `Set-Token` e `X-CSRF-Token`
 *
 * O certificado NUNCA toca este servidor — é usado uma vez, no navegador, para
 * emitir as chaves. Não há mTLS aqui.
 *
 * SEGURANÇA. A documentação é explícita: quem se autentica com a chave "terá
 * acesso ao perfil do usuário podendo acessar os serviços do portal COMO SE
 * FOSSE o proprietário da chave". Ou seja, não é credencial de leitura — é a
 * identidade do titular. Vale a mesma regra do JWT_SECRET: vive só no `.env`,
 * nunca no git, nunca em log. Nada neste arquivo imprime chave nem token.
 *
 * FAIL-CLOSED. Sem chaves configuradas, ou com falha de rede, devolve null e
 * quem chamou segue pelo caminho local. Nunca inventa credencial nem finge
 * sessão válida.
 *
 * VALIDADE DO TOKEN. O spec não declara o tempo de vida, então não há número
 * inventado aqui: o cache usa um teto conservador E quem consome reautentica
 * ao receber 401 (`invalidarToken`). Reautenticar no 401 é correto qualquer
 * que seja a validade real.
 */

const BASE_URL = process.env.PORTAL_UNICO_BASE_URL || "https://portalunico.siscomex.gov.br";
const TIMEOUT_MS = 10_000;

/**
 * Teto conservador de reuso do token. Não é a validade oficial — essa não
 * consta do spec. A rede de segurança de verdade é reautenticar no 401.
 */
const REUSO_MAX_MS = 20 * 60 * 1000;

export interface SessaoPortal {
  /** Valor de `Set-Token`, enviado depois em `Authorization`. */
  authorization: string;
  /** Valor de `X-CSRF-Token`. */
  csrf: string;
  obtidaEm: number;
}

let sessao: SessaoPortal | null = null;
let emAndamento: Promise<SessaoPortal | null> | null = null;

interface Credenciais {
  clientId: string;
  clientSecret: string;
  roleType: string;
}

function lerCredenciais(): Credenciais | null {
  const clientId = (process.env.PORTAL_UNICO_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.PORTAL_UNICO_CLIENT_SECRET ?? "").trim();
  const roleType = (process.env.PORTAL_UNICO_ROLE_TYPE ?? "").trim();
  if (!clientId || !clientSecret || !roleType) return null;
  return { clientId, clientSecret, roleType };
}

/** Há par de chaves e perfil configurados? */
export function portalUnicoConfigurado(): boolean {
  return lerCredenciais() !== null;
}

/** Descarta a sessão — chame ao receber 401 de qualquer serviço do portal. */
export function invalidarToken(): void {
  sessao = null;
}

/** Só para teste: zera estado de módulo. */
export function resetPortalUnicoAuth(): void {
  sessao = null;
  emAndamento = null;
}

async function autenticar(cred: Credenciais): Promise<SessaoPortal | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${BASE_URL}/api/autenticar/chave-acesso`, {
      method: "POST",
      headers: {
        "Client-Id": cred.clientId,
        "Client-Secret": cred.clientSecret,
        "Role-Type": cred.roleType,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      // Status e perfil ajudam a diagnosticar; a chave jamais é registrada.
      console.warn(
        `[portalUnicoAuth] autenticação recusada: HTTP ${resp.status} (Role-Type "${cred.roleType}")`,
      );
      return null;
    }

    const authorization = resp.headers.get("Set-Token") ?? "";
    const csrf = resp.headers.get("X-CSRF-Token") ?? "";
    if (!authorization || !csrf) {
      console.warn("[portalUnicoAuth] resposta 200 sem Set-Token/X-CSRF-Token — contrato mudou?");
      return null;
    }

    return { authorization, csrf, obtidaEm: Date.now() };
  } catch (err) {
    console.warn("[portalUnicoAuth] falha de rede na autenticação:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sessão válida, reaproveitando a anterior enquanto fizer sentido.
 * Chamadas concorrentes compartilham a mesma autenticação em andamento — sem
 * isso, uma rajada de consultas abriria uma sessão por consulta.
 */
export async function obterSessao(forcar = false): Promise<SessaoPortal | null> {
  const cred = lerCredenciais();
  if (!cred) return null;

  if (!forcar && sessao && Date.now() - sessao.obtidaEm < REUSO_MAX_MS) return sessao;
  if (emAndamento) return emAndamento;

  emAndamento = autenticar(cred)
    .then((s) => {
      sessao = s;
      return s;
    })
    .finally(() => {
      emAndamento = null;
    });

  return emAndamento;
}

/**
 * Cabeçalhos prontos para qualquer serviço do portal, ou null quando não há
 * sessão. O 401 do TTCE pede o token em `Authorization`.
 */
export async function cabecalhosPortal(forcar = false): Promise<Record<string, string> | null> {
  const s = await obterSessao(forcar);
  if (!s) return null;
  return { Authorization: s.authorization, "X-CSRF-Token": s.csrf };
}
