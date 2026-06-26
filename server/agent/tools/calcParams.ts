/**
 * calcParams — mapeamento compartilhado dos parâmetros de cálculo vindos do LLM.
 *
 * Tanto `montar_calculo` quanto `gerar_relatorio_calculo` recebem os MESMOS
 * parâmetros de importação (em português, mais naturais para o modelo) e os
 * convertem para a interface real do motor (`EstimativaInput`). Centralizar aqui
 * garante que cálculo e relatório usem exatamente os mesmos dados — sem divergência.
 */
import type * as estimativaService from "../../services/estimativaService";

export interface ItemArg {
  descricao?: string;
  quantidade: number;
  precoFobUnitarioUsd: number;
  ncm?: string;
}

/** Propriedades de cálculo do schema (reusadas por montar_calculo e o relatório). */
export const CALC_SCHEMA_PROPERTIES = {
  ncm: { type: "string", description: "Código NCM de 8 dígitos (ex: 7308.40.00)" },
  itens: {
    type: "array",
    description: "Itens da importação",
    items: {
      type: "object",
      properties: {
        descricao: { type: "string" },
        quantidade: { type: "number" },
        precoFobUnitarioUsd: { type: "number", description: "Preço FOB unitário em USD" },
      },
      required: ["quantidade", "precoFobUnitarioUsd"],
    },
  },
  freteUsd: { type: "number", description: "Frete internacional total em USD" },
  seguroUsd: { type: "number", description: "Seguro em USD (opcional)" },
  cambioBrl: { type: "number", description: "Taxa de câmbio USD→BRL (PTAX)" },
  regimeTributario: {
    type: "string",
    enum: ["lucro_real", "lucro_presumido", "simples_nacional"],
    description: "Regime tributário do importador",
  },
  estadoDestino: {
    type: "string",
    description:
      "UF de destino do desembaraço (ex: SC, SP, RS). Define o regime de ICMS importação: " +
      "SC usa o benefício TTD 409 (antecipado); demais estados usam o ICMS importação cheio " +
      "com a alíquota interna do estado. Impacta diretamente o custo — sempre pergunte se não souber.",
  },
  modal: {
    type: "string",
    enum: ["maritimo", "aereo", "rodoviario", "ferroviario"],
    description:
      "Modal logístico da importação. Afeta o AFRMM (incide só no marítimo). " +
      "Pergunte se não souber.",
  },
  ttdFase: {
    type: "string",
    description: "Fase do TTD/benefício estadual de SC: 'primeiros_36m' (2,6%) ou 'apos_36m' (1,0%)",
  },
  incluirComprador: {
    type: "boolean",
    description:
      "Se true, inclui também a estimativa de custo e venda do COMPRADOR (cliente da trading " +
      "que revende em Lucro Real) — o cenário 'x Lucro Real' do modelo. Use ao gerar a planilha " +
      "completa de trading ou quando perguntarem o preço de revenda do cliente.",
  },
} as const;

/** Normaliza o modal textual vindo do LLM para o enum do motor. */
export function mapModal(modal?: unknown): estimativaService.ModalLogistico | undefined {
  if (typeof modal !== "string") return undefined;
  const m = modal
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
  if (m.includes("marit") || m.includes("mar") || m.includes("navio")) return "maritimo";
  if (m.includes("aere") || m.includes("aviao") || m.includes("air")) return "aereo";
  if (m.includes("rodov") || m.includes("caminhao") || m.includes("truck")) return "rodoviario";
  if (m.includes("ferrov") || m.includes("trem")) return "ferroviario";
  return undefined;
}

/** Mapeia a fase TTD textual vinda do LLM para o enum esperado pelo motor. */
export function mapTtdPhase(ttdFase?: unknown): "primeiros_36m" | "apos_36m" | undefined {
  if (typeof ttdFase !== "string") return undefined;
  const f = ttdFase.toLowerCase();
  if (f.includes("primeiros") || f.includes("2.6") || f.includes("2,6")) return "primeiros_36m";
  if (f.includes("apos") || f.includes("após") || f.includes("1.0") || f.includes("1,0") || f === "1%") return "apos_36m";
  return undefined;
}

/** Converte os args do LLM em EstimativaInput (lança nada — valide antes). */
export function mapArgsToEstimativaInput(
  args: Record<string, unknown>,
): estimativaService.EstimativaInput {
  const itens = (Array.isArray(args.itens) ? args.itens : []) as ItemArg[];
  const ncmTopo = typeof args.ncm === "string" ? args.ncm : "";
  return {
    products: itens.map((i) => ({
      productName: i.descricao ?? "Item",
      ncmCode: i.ncm ?? ncmTopo,
      quantity: Number(i.quantidade),
      unitPrice: Number(i.precoFobUnitarioUsd),
    })),
    exchangeRate: args.cambioBrl as number,
    currency: "USD",
    freight: typeof args.freteUsd === "number" ? args.freteUsd : undefined,
    insurance: typeof args.seguroUsd === "number" ? args.seguroUsd : undefined,
    taxRegime: args.regimeTributario as estimativaService.EstimativaInput["taxRegime"],
    estadoDestino: typeof args.estadoDestino === "string" ? args.estadoDestino : undefined,
    modal: mapModal(args.modal),
    ttdPhase: mapTtdPhase(args.ttdFase),
    incluirComprador: args.incluirComprador === true,
  };
}
