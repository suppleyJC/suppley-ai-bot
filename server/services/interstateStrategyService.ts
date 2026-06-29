/**
 * interstateStrategyService — comparador de ROTAS DE IMPORTAÇÃO.
 *
 * Compara importar DIRETO no estado de destino vs. importar por um estado-HUB
 * com benefício (ex.: SC/TTD 409, ICMS antecipado) e depois levar a mercadoria
 * ao destino (transferência/revenda interestadual + DIFAL quando consumidor final).
 *
 * ⚠️ ESTIMATIVA ESTRATÉGICA. O efeito líquido do ICMS depende do regime do
 * destinatário e da cadeia (créditos). A diferença DEFENSÁVEL e direta é o ICMS
 * DE IMPORTAÇÃO (antecipado do hub vs. cheio do destino) — é o destaque. Os
 * eventos a jusante (interestadual 4%, DIFAL) vêm rotulados para leitura, não
 * como número líquido fechado. Valide com o contador antes de decidir.
 *
 * Tudo em centavos / basis points.
 */
import { getIcmsRate } from "../db";

const IMPORTED_INTERSTATE_BP = 400; // 4% — Res. Senado 13/2012 (importados)

const INTERNAL_FALLBACK_BP: Record<string, number> = {
  AC: 1900, AL: 1900, AM: 2000, AP: 1800, BA: 2050, CE: 2000, DF: 2000,
  ES: 1700, GO: 1900, MA: 2200, MG: 1800, MS: 1700, MT: 1700, PA: 1900,
  PB: 2000, PE: 2050, PI: 2100, PR: 1950, RJ: 2200, RN: 2000, RO: 1950,
  RR: 2000, RS: 1700, SC: 1700, SE: 1900, SP: 1800, TO: 2000,
};

export type ModeloRota = "trading_revenda" | "transferencia_filial";
export type EtapaFinal = "consumidor_final" | "revenda_contribuinte";

export interface RouteComparisonInput {
  hubState: string;          // estado de importação (com benefício)
  destinationState: string;  // estado de destino
  /** Base do ICMS importação: CIF + II + IPI + PIS + COFINS + despesas (centavos). */
  baseIcmsCents: number;
  /** Valor da operação de saída do hub p/ destino. Default = baseIcmsCents (proxy). */
  valorSaidaCents?: number;
  modelo: ModeloRota;
  destinatarioCreditaIcms: boolean;
  etapaFinal: EtapaFinal;
  /** Override do antecipado do hub em bp (ex.: 100 = 1%, 260 = 2,6% TTD 409). */
  hubAntecipadoBpOverride?: number;
}

export interface RouteLeg {
  label: string;
  valueCents: number;
  obs?: string;
}
export interface RouteResult {
  rota: string;
  estado: string;
  /** ICMS pago na importação (a diferença defensável entre as rotas). */
  icmsImportacaoCents: number;
  /** Eventos de ICMS a jusante (informativos). */
  legs: RouteLeg[];
}
export interface RouteComparison {
  premissas: {
    modelo: ModeloRota;
    destinatarioCreditaIcms: boolean;
    etapaFinal: EtapaFinal;
    valorSaidaCents: number;
    interestadualBp: number;
  };
  direta: RouteResult;
  viaHub: RouteResult;
  /** Economia no ICMS de IMPORTAÇÃO ao usar o hub (direta − viaHub). Pode ser negativa. */
  economiaImportacaoCents: number;
  alertas: string[];
}

/** Gross-up: ICMS "por dentro" sobre uma base, retornando só o valor do ICMS. */
function icmsPorDentro(baseCents: number, rateBp: number): number {
  if (rateBp <= 0 || rateBp >= 10000) return 0;
  const baseGross = Math.round((baseCents * 10000) / (10000 - rateBp));
  return baseGross - baseCents;
}

async function internalRateBp(uf: string): Promise<number> {
  const row = await getIcmsRate(uf);
  return row?.internalRate ?? INTERNAL_FALLBACK_BP[uf.toUpperCase()] ?? 1700;
}

export async function compareImportRoutes(input: RouteComparisonInput): Promise<RouteComparison> {
  const hub = input.hubState.toUpperCase().slice(0, 2);
  const dest = input.destinationState.toUpperCase().slice(0, 2);
  const base = Math.max(0, Math.round(input.baseIcmsCents));
  const valorSaida = Math.max(0, Math.round(input.valorSaidaCents ?? base));
  const alertas: string[] = [];

  const rDest = await internalRateBp(dest);
  const rHubInterno = await internalRateBp(hub);
  const hubRow = await getIcmsRate(hub);

  // Antecipado do hub: override > benefício cadastrado > (sem benefício → cheio).
  let hubAntecipadoBp: number | null = input.hubAntecipadoBpOverride ?? null;
  if (hubAntecipadoBp == null && hubRow?.hasIncentive) {
    hubAntecipadoBp = hubRow.icmsAntecipadoRate ?? null;
  }

  /* ---------- ROTA DIRETA (importar no destino) ---------- */
  const icmsImportDireta = icmsPorDentro(base, rDest);
  const diretaLegs: RouteLeg[] = [];
  if (input.etapaFinal === "consumidor_final") {
    diretaLegs.push({
      label: "ICMS na venda interna ao consumidor (destino)",
      valueCents: Math.round((valorSaida * rDest) / 10000),
      obs: "Operação interna; sem DIFAL. Crédito da importação compensa o débito.",
    });
  } else {
    diretaLegs.push({
      label: "Revenda a contribuinte (destino)",
      valueCents: 0,
      obs: `Débito/crédito normais à alíquota interna (${(rDest / 100).toFixed(1)}%); ICMS recuperável na cadeia.`,
    });
  }

  /* ---------- ROTA VIA HUB ---------- */
  let icmsImportHub: number;
  let importHubObs: string;
  if (hubAntecipadoBp != null) {
    icmsImportHub = Math.round((base * hubAntecipadoBp) / 10000);
    importHubObs = `Antecipado de ${hub} (${(hubAntecipadoBp / 100).toFixed(2)}%) sobre a base.`;
  } else {
    icmsImportHub = icmsPorDentro(base, rHubInterno);
    importHubObs = `Sem benefício cadastrado em ${hub}: ICMS cheio por dentro (${(rHubInterno / 100).toFixed(1)}%).`;
    alertas.push(`Nenhum benefício de ICMS cadastrado para ${hub} — a rota via hub usou o ICMS cheio. Cadastre o benefício (ex.: TTD) em Parâmetros › Benefícios / ICMS para refletir a vantagem.`);
  }

  const interestadualCents = Math.round((valorSaida * IMPORTED_INTERSTATE_BP) / 10000);
  const viaHubLegs: RouteLeg[] = [];

  if (input.modelo === "trading_revenda") {
    viaHubLegs.push({
      label: `ICMS interestadual na saída ${hub}→${dest} (4%)`,
      valueCents: interestadualCents,
      obs: input.destinatarioCreditaIcms
        ? "Débito do hub; o destinatário (contribuinte) credita os 4% — recuperável."
        : "Destinatário não credita (Simples/consumo) — tende a virar custo.",
    });
  } else {
    viaHubLegs.push({
      label: `Transferência entre estabelecimentos ${hub}→${dest}`,
      valueCents: interestadualCents,
      obs: "Transferência interestadual (mesmo titular); tratamento de crédito conforme legislação vigente.",
    });
  }

  if (input.etapaFinal === "consumidor_final") {
    const difal = Math.max(0, Math.round((valorSaida * (rDest - IMPORTED_INTERSTATE_BP)) / 10000));
    viaHubLegs.push({
      label: "DIFAL devido ao estado de destino",
      valueCents: difal,
      obs: `Consumidor final: diferencial (${(rDest / 100).toFixed(1)}% − 4%) recolhido ao destino.`,
    });
  }

  /* ---------- comparativo + alertas ---------- */
  if (input.valorSaidaCents == null) {
    alertas.push("Valor de saída não informado — usei a base do ICMS como proxy; informe o valor da operação de saída para precisão dos eventos a jusante.");
  }
  if (input.etapaFinal === "revenda_contribuinte" && input.destinatarioCreditaIcms) {
    alertas.push("Como há revenda a contribuinte que credita ICMS, o tributo é recuperável na cadeia: a diferença entre rotas é de fluxo de caixa/competitividade, não de custo final.");
  }
  alertas.push("Estimativa estratégica de ICMS — valide com o contador antes de decidir a rota. Tributos federais (II/IPI/PIS/COFINS) não mudam entre as rotas.");

  return {
    premissas: {
      modelo: input.modelo,
      destinatarioCreditaIcms: input.destinatarioCreditaIcms,
      etapaFinal: input.etapaFinal,
      valorSaidaCents: valorSaida,
      interestadualBp: IMPORTED_INTERSTATE_BP,
    },
    direta: {
      rota: `Importação direta em ${dest}`,
      estado: dest,
      icmsImportacaoCents: icmsImportDireta,
      legs: diretaLegs,
    },
    viaHub: {
      rota: `Importação via ${hub} → ${dest}`,
      estado: hub,
      icmsImportacaoCents: icmsImportHub,
      legs: [{ label: "ICMS na importação (hub)", valueCents: icmsImportHub, obs: importHubObs }, ...viaHubLegs],
    },
    economiaImportacaoCents: icmsImportDireta - icmsImportHub,
    alertas,
  };
}
