/**
 * tradeBarrierService — detecção estruturada de barreiras comerciais por NCM.
 *
 * Camada 1 do compliance de barreiras: a tabela `trade_barriers` (defesa
 * comercial CAMEX/GECEX + CIDE) é consultada AUTOMATICAMENTE em todo cálculo.
 * O casamento é por PREFIXO de NCM (prefixo mais longo vence) + país de
 * origem (registro sem país vale para qualquer origem).
 *
 * A camada 2 continua sendo a verificação do agente (web search nas fontes
 * oficiais) — a base estruturada garante que medidas conhecidas NUNCA passem
 * em branco, e o agente confirma valor/vigência quando `valor` é nulo.
 */
import { getDb } from "../db";
import { tradeBarriers, type TradeBarrier } from "../../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

export interface BarreiraDetectada {
  tipo: TradeBarrier["tipo"];
  ncmPrefix: string;
  paisOrigem: string | null;
  mecanismo: TradeBarrier["mecanismo"] | null;
  /** bp (ad_valorem) ou cents USD (específicos); null = valor a confirmar. */
  valor: number | null;
  descricao: string | null;
  baseLegal: string | null;
  /** Impacto estimado em R$ quando o valor é parametrizado e há dados p/ calcular. */
  impactoEstimadoBrl: number | null;
  /** Rótulo humano do tipo. */
  rotulo: string;
}

const TIPO_LABEL: Record<TradeBarrier["tipo"], string> = {
  antidumping: "ANTIDUMPING",
  medida_compensatoria: "MEDIDA COMPENSATÓRIA",
  salvaguarda: "SALVAGUARDA",
  cide: "CIDE",
  direito_provisorio: "DIREITO PROVISÓRIO",
};

/** Normaliza país p/ comparação (minúsculo, sem acento). */
function normPais(p?: string | null): string {
  return (p ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Consulta as barreiras ativas que casam com a NCM (por prefixo) e origem.
 * Falha aberta: erro de banco (ex.: tabela ainda não migrada) → lista vazia,
 * sem derrubar o cálculo.
 */
export async function detectarBarreiras(params: {
  ncm: string;
  paisOrigem?: string | null;
  /** Dados p/ estimar o impacto (todos opcionais). */
  valorAduaneiroBrl?: number;
  pesoTotalKg?: number;
  quantidade?: number;
  cambio?: number;
}): Promise<BarreiraDetectada[]> {
  const ncm = params.ncm.replace(/\D/g, "");
  if (!ncm) return [];

  let rows: TradeBarrier[] = [];
  try {
    const db = await getDb();
    if (!db) return [];
    // Prefixo: a NCM do item começa com o ncmPrefix do registro.
    rows = await db
      .select()
      .from(tradeBarriers)
      .where(and(
        eq(tradeBarriers.isActive, true),
        sql`${ncm} LIKE CONCAT(${tradeBarriers.ncmPrefix}, '%')`,
      ));
  } catch {
    return []; // tabela ausente/erro → detecção estruturada indisponível, segue
  }

  const origem = normPais(params.paisOrigem);
  const aplicaveis = rows.filter((r) => {
    if (!r.paisOrigem) return true;               // medida sem origem = qualquer
    if (!origem) return true;                     // origem não informada: evidencia mesmo assim
    return normPais(r.paisOrigem) === origem;
  });

  // Vigência: expirada → ignora.
  const agora = Date.now();
  const vigentes = aplicaveis.filter(
    (r) => !r.vigenciaAte || new Date(r.vigenciaAte).getTime() >= agora,
  );

  // Um registro por (tipo): prefixo mais longo vence (medida mais específica).
  const porTipo = new Map<string, TradeBarrier>();
  for (const r of vigentes) {
    const key = `${r.tipo}|${normPais(r.paisOrigem)}`;
    const prev = porTipo.get(key);
    if (!prev || r.ncmPrefix.length > prev.ncmPrefix.length) porTipo.set(key, r);
  }

  return Array.from(porTipo.values()).map((r) => ({
    tipo: r.tipo,
    ncmPrefix: r.ncmPrefix,
    paisOrigem: r.paisOrigem,
    mecanismo: r.mecanismo ?? null,
    valor: r.valor ?? null,
    descricao: r.descricao ?? null,
    baseLegal: r.baseLegal ?? null,
    impactoEstimadoBrl: estimarImpacto(r, params),
    rotulo: TIPO_LABEL[r.tipo],
  }));
}

/** Impacto estimado em R$ — só quando o valor é parametrizado e há base p/ calcular. */
function estimarImpacto(
  r: TradeBarrier,
  p: { valorAduaneiroBrl?: number; pesoTotalKg?: number; quantidade?: number; cambio?: number },
): number | null {
  if (r.valor == null || !r.mecanismo) return null;
  switch (r.mecanismo) {
    case "ad_valorem":
      return p.valorAduaneiroBrl != null ? p.valorAduaneiroBrl * (r.valor / 10000) : null;
    case "usd_por_kg":
      return p.pesoTotalKg != null && p.cambio != null
        ? (r.valor / 100) * p.pesoTotalKg * p.cambio
        : null;
    case "usd_por_ton":
      return p.pesoTotalKg != null && p.cambio != null
        ? (r.valor / 100) * (p.pesoTotalKg / 1000) * p.cambio
        : null;
    case "usd_por_unidade":
      return p.quantidade != null && p.cambio != null
        ? (r.valor / 100) * p.quantidade * p.cambio
        : null;
    default:
      return null;
  }
}

/** Frase de evidência p/ warnings do cálculo e resposta do agente. */
export function formatarBarreira(b: BarreiraDetectada, ncmItem: string): string {
  const origem = b.paisOrigem ? ` origem ${b.paisOrigem}` : "";
  const brl = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const valorTxt = b.impactoEstimadoBrl != null
    ? ` Impacto estimado: R$ ${brl(b.impactoEstimadoBrl)} nesta operação (NÃO incluído no custo do motor — some ao custo final).`
    : b.valor != null
      ? ""
      : " Valor vigente a confirmar na resolução atual antes de fechar.";
  return (
    `${b.rotulo} detectado para NCM ${ncmItem}${origem}: ${b.descricao ?? "medida de defesa comercial vigente"}` +
    (b.baseLegal ? ` (${b.baseLegal}).` : ".") +
    valorTxt
  );
}
