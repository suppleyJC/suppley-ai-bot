/**
 * FASE 5 · FATIA 5 — Inteligência de Mercado: provedores externos plugáveis.
 *
 * Cruza dados internos (ativos, preços) com externos (câmbio, commodities,
 * Bloomberg). Segue o padrão de provider de server/services/tradeData/.
 *
 * Bloomberg é PAGO/licenciado: provider plugável, ativado só por config.
 * Fontes gratuitas (BCB câmbio, Comex Stat) entram primeiro.
 */
import { getExchangeRate } from "../../services/exchangeService";
import * as fase5Db from "../../db/fase5Db";

export interface MarketSignal {
  ativoOuNcm: string;
  tendencia: "alta" | "baixa" | "estavel";
  confianca: number;            // 0-100
  fonte: string;
  detalhe?: string;
}

/** Interface comum a todos os provedores externos. */
export interface MarketDataProvider {
  nome: string;
  disponivel(): boolean;
  getSignals(query: { ncm?: string; commodity?: string }): Promise<MarketSignal[]>;
}

/* ---------- Provider: BCB (câmbio) — gratuito, via exchangeService ---------- */
export const bcbProvider: MarketDataProvider = {
  nome: "BCB",
  disponivel: () => true,
  async getSignals() {
    try {
      const usd = await getExchangeRate("USD", "BRL");
      return [{
        ativoOuNcm: "USD/BRL",
        tendencia: "estavel", // sem série histórica aqui; tendência exige histórico
        confianca: 50,
        fonte: "BCB/PTAX",
        detalhe: `Câmbio de referência USD/BRL ≈ ${usd.rate.toFixed(4)}.`,
      }];
    } catch {
      return [];
    }
  },
};

/* ---------- Provider: Comex Stat — gratuito ---------- */
export const comexProvider: MarketDataProvider = {
  nome: "ComexStat",
  disponivel: () => true,
  async getSignals(_query) {
    // Série de preço/volume por NCM exige endpoint de estatística do Comex.
    // Mantido disponível; integração de série histórica é incremento futuro.
    return [];
  },
};

/* ---------- Provider: Bloomberg — PAGO, plugável, desativado por padrão ---------- */
export const bloombergProvider: MarketDataProvider = {
  nome: "Bloomberg",
  disponivel: () => Boolean(process.env.BLOOMBERG_API_KEY),
  async getSignals() {
    if (!bloombergProvider.disponivel()) return [];
    return []; // integrar quando houver contrato
  },
};

const PROVIDERS: MarketDataProvider[] = [bcbProvider, comexProvider, bloombergProvider];

/** Consulta todos os providers disponíveis e consolida os sinais. */
export async function consolidarSinaisMercado(query: { ncm?: string; commodity?: string }) {
  const ativos = PROVIDERS.filter((p) => p.disponivel());
  const resultados = await Promise.all(ativos.map((p) => p.getSignals(query).catch(() => [])));
  return resultados.flat();
}

/**
 * Benchmark: cruza interno (ativo_precos nacional × internacional) com sinais
 * externos para responder "vale importar ou comprar nacional?".
 */
export async function analiseBenchmark(input: {
  ativoId: number; userId: number;
}): Promise<{
  custoNacionalCents?: number;
  custoImportadoCents?: number;
  recomendacao: string;
  sinais: MarketSignal[];
}> {
  const ativo = await fase5Db.getAtivo(input.ativoId, input.userId);
  if (!ativo) return { recomendacao: "Ativo não encontrado.", sinais: [] };

  const precos = await fase5Db.precosDoAtivo(input.ativoId);
  const media = (origem: string) => {
    const cents = precos.filter((p) => p.origem === origem).map((p) => p.precoCents).filter((v) => v > 0);
    return cents.length ? Math.round(cents.reduce((a, b) => a + b, 0) / cents.length) : undefined;
  };
  const custoNacionalCents = media("nacional") ?? ativo.custoNacionalRefCents ?? undefined;
  const custoImportadoCents = media("internacional") ?? ativo.custoImportadoRefCents ?? undefined;

  const sinais = await consolidarSinaisMercado({ ncm: ativo.ncmCode });

  let recomendacao: string;
  if (custoNacionalCents == null && custoImportadoCents == null) {
    recomendacao = "Sem preços registrados para este ativo — ingira cotações para gerar benchmark.";
  } else if (custoNacionalCents != null && custoImportadoCents != null) {
    recomendacao = custoImportadoCents < custoNacionalCents
      ? "Base aponta importado mais barato. Rode montar_calculo para o custo nacionalizado real (impostos/câmbio) antes de decidir."
      : "Base aponta nacional mais barato. Considere comprar nacional; confirme prazo e disponibilidade.";
  } else {
    recomendacao = "Só há uma origem registrada — sem par para comparar. Ingira a outra origem para benchmark completo.";
  }

  return { custoNacionalCents, custoImportadoCents, recomendacao, sinais };
}
