/**
 * ttceService — integração com a API pública TTCE do Portal Único Siscomex
 * (Tratamento Tributário do Comércio Exterior).
 *
 * O TTCE devolve, por NCM + país + data, o tratamento tributário APLICADO na
 * importação: alíquotas vigentes, preferências de acordos (Mercosul/ALADI),
 * antidumping e EX-TARIFÁRIO — a fonte oficial consolidada da Receita/GECEX,
 * sem depender de cadastro manual em ncm_exceptions.
 *
 * SEGURANÇA FISCAL (regras duras):
 *  1. DESLIGADO por padrão — só ativa com TTCE_ENABLED=true no .env, depois do
 *     smoke test em produção (scripts/ttceSmoke.ts) validar o formato real.
 *  2. FAIL-CLOSED: qualquer erro de rede/parse → retorna null e o motor segue
 *     com as tabelas locais (comportamento atual). Nunca inventa número.
 *  3. Só aplica redução com valor numérico bem formado, e sempre com aviso
 *     citando a fonte (TTCE) para rastreabilidade.
 *
 * Docs: https://docs.portalunico.siscomex.gov.br/api/ttce/
 */

const TTCE_BASE_URL = process.env.TTCE_BASE_URL || "https://portalunico.siscomex.gov.br";
const TTCE_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 12 * 3600 * 1000; // tarifa muda raramente; 12h de cache

export function ttceEnabled(): boolean {
  return process.env.TTCE_ENABLED === "true";
}

/** Códigos de país SISCOMEX (numéricos) das origens mais comuns da plataforma. */
const PAIS_SISCOMEX: Record<string, string> = {
  china: "160",
  "estados unidos": "249", eua: "249", usa: "249",
  alemanha: "023",
  india: "361", "índia": "361",
  argentina: "063",
  paraguai: "586",
  uruguai: "845",
  "coreia do sul": "190", coreia: "190",
  japao: "399", "japão": "399",
  italia: "386", "itália": "386",
  franca: "275", "frança": "275",
  espanha: "245",
  chile: "158",
  mexico: "493", "méxico": "493",
  taiwan: "161", "formosa (taiwan)": "161",
  vietna: "858", "vietnã": "858", vietnam: "858",
  turquia: "827",
  "reino unido": "628",
  canada: "149", "canadá": "149",
  portugal: "607",
};

export function paisParaCodigoSiscomex(pais?: string | null): string | null {
  if (!pais) return null;
  const key = pais.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // tenta com e sem acento normalizado
  return PAIS_SISCOMEX[pais.trim().toLowerCase()] ?? PAIS_SISCOMEX[key] ?? null;
}

export interface TtceTratamento {
  /** Alíquota ad valorem do II em fração (ex.: 0.126) ou null. */
  iiRate: number | null;
  /** Alíquota ad valorem do IPI em fração ou null. */
  ipiRate: number | null;
  /** Ex-tarifário detectado (código/fundamento), se houver. */
  exTarifario: { codigo: string | null; fundamento: string | null } | null;
  /** Preferência de acordo detectada (ex.: Mercosul, ALADI), se houver. */
  preferencia: { acordo: string | null; percentualReducao: number | null } | null;
  /** Fundamentos legais citados na resposta (para o aviso). */
  fundamentos: string[];
}

type CacheEntry = { at: number; val: TtceTratamento | null };
const cache = new Map<string, CacheEntry>();

/**
 * Varre a resposta do TTCE de forma TOLERANTE: procura estruturas de tributo
 * com alíquota ad valorem, marcações de ex-tarifário e preferências. Se não
 * reconhecer o formato com segurança, devolve null (fail-closed).
 */
function parseTtceResponse(json: unknown): TtceTratamento | null {
  const fundamentos: string[] = [];
  let iiRate: number | null = null;
  let ipiRate: number | null = null;
  let exTarifario: TtceTratamento["exTarifario"] = null;
  let preferencia: TtceTratamento["preferencia"] = null;

  const asRate = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    // O TTCE publica percentuais (ex.: 12.6); acima de 1 tratamos como %.
    return n > 1 ? n / 100 : n;
  };

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;

    // Identificação do tributo (II/IPI) + alíquota ad valorem no mesmo objeto.
    const tributo = String(o.tributo ?? o.codigoTributo ?? o.siglaTributo ?? "").toUpperCase();
    const aliquota =
      asRate(o.aliquotaAdValorem) ?? asRate(o.percentualAliquota) ??
      asRate((o.aliquota as Record<string, unknown> | undefined)?.percentual) ?? asRate(o.aliquota);
    if (aliquota != null) {
      if ((tributo.includes("II") && !tributo.includes("IPI")) || tributo === "IMPOSTO DE IMPORTACAO") {
        iiRate = iiRate == null ? aliquota : Math.min(iiRate, aliquota);
      } else if (tributo.includes("IPI")) {
        ipiRate = ipiRate == null ? aliquota : Math.min(ipiRate, aliquota);
      }
    }

    // Ex-tarifário: campos com "ex" + fundamento/ato legal.
    const exCodigo = o.codigoEx ?? o.numeroEx ?? o.ex ?? null;
    if (exCodigo != null && (typeof exCodigo === "string" || typeof exCodigo === "number")) {
      exTarifario = {
        codigo: String(exCodigo),
        fundamento: typeof o.fundamentoLegal === "string" ? o.fundamentoLegal : null,
      };
    }

    // Preferência tarifária (acordos).
    const acordo = o.acordo ?? o.nomeAcordo ?? o.acordoInternacional ?? null;
    const reducao = asRate(o.percentualReducao ?? o.reducao);
    if (acordo != null && reducao != null) {
      preferencia = { acordo: String(acordo), percentualReducao: reducao };
    }

    // Fundamentos legais soltos.
    for (const k of ["fundamentoLegal", "atoLegal", "descricaoFundamento"]) {
      if (typeof o[k] === "string" && (o[k] as string).length > 3) fundamentos.push(o[k] as string);
    }

    Object.values(o).forEach(visit);
  };

  visit(json);

  if (iiRate == null && ipiRate == null && !exTarifario && !preferencia) return null;
  return { iiRate, ipiRate, exTarifario, preferencia, fundamentos: Array.from(new Set(fundamentos)).slice(0, 3) };
}

/**
 * Consulta o tratamento tributário de importação no TTCE.
 * Retorna null quando desabilitado, sem código de país, erro de rede ou
 * resposta em formato não reconhecido — o chamador segue com as tabelas locais.
 */
export async function consultarTtce(params: {
  ncm: string;
  paisOrigem?: string | null;
  data?: Date;
}): Promise<TtceTratamento | null> {
  if (!ttceEnabled()) return null;
  const ncm = params.ncm.replace(/\D/g, "");
  if (ncm.length !== 8) return null;
  const codigoPais = paisParaCodigoSiscomex(params.paisOrigem);
  if (!codigoPais) return null; // TTCE exige país; sem código confiável, não consulta

  const dataFato = (params.data ?? new Date()).toISOString().slice(0, 10);
  const key = `${ncm}|${codigoPais}|${dataFato}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.val;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TTCE_TIMEOUT_MS);
    const resp = await fetch(
      `${TTCE_BASE_URL}/ttce/api/ext/tratamentos-tributarios/importacao`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          listaNcm: [{ ncm }],
          codigoPais,
          dataFatoGerador: dataFato,
          tipoOperacao: "I",
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`TTCE HTTP ${resp.status}`);
    const json = await resp.json();
    const parsed = parseTtceResponse(json);
    cache.set(key, { at: Date.now(), val: parsed });
    return parsed;
  } catch (err) {
    console.warn(`[ttceService] consulta falhou (${key}) — seguindo com tabelas locais:`, err);
    cache.set(key, { at: Date.now(), val: null });
    return null;
  }
}
