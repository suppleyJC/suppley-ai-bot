/**
 * Comex Stat Provider — implementa o contrato comum com a fonte GRATUITA.
 *
 * Limitação honesta: dados estatísticos agregados, SEM nome de empresa.
 * Por isso searchShipments retorna registros agregados (supplierName = null)
 * e findSuppliers retorna vazio (não há nome de fornecedor na fonte oficial).
 * É sempre o fallback: está "configurado" por padrão (não exige chave).
 */
import {
  type TradeDataProvider, type TradeShipmentRecord, type SupplierLead,
  type ShipmentSearchParams, type ProviderCapabilities,
} from "../types";
import { queryGeneral } from "../../marketData/comexStatClient";

export const comexStatProvider: TradeDataProvider = {
  id: "comexstat",
  isConfigured() { return true; }, // fonte pública, sempre disponível
  capabilities(): ProviderCapabilities {
    return {
      hasCompanyNames: false,
      hasContactInfo: false,
      hasShipmentLevel: false,
      coverageNote: "Oficial (MDIC/Siscomex), agregado por NCM/país/UF/porto. Sem nome de empresa.",
    };
  },
  async searchShipments(params: ShipmentSearchParams): Promise<TradeShipmentRecord[]> {
    if (!params.hsCode) return [];
    const ncm = params.hsCode.replace(/\D/g, "").slice(0, 8);
    const to = params.dateTo?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
    const from = params.dateFrom?.slice(0, 7) ?? to;
    const rows = await queryGeneral({
      flow: "import", monthDetail: true, period: { from, to },
      filters: [{ filter: "ncm", values: [ncm] }],
      details: ["ncm", "country"],
      metrics: ["metricFOB", "metricKG", "metricStatistic", "metricCIF"],
    });
    return rows.map((r): TradeShipmentRecord => ({
      date: r.year && r.month ? `${r.year}-${String(r.month).padStart(2, "0")}` : null,
      hsCode: r.coNcm ?? ncm,
      productDescription: null,
      supplierName: null, buyerName: null,
      originCountry: r.country ?? r.noPaip ?? null, destinationCountry: "BR",
      quantity: r.metricStatistic ? Number(r.metricStatistic) : null, unit: null,
      valueUsd: r.metricFOB ? Number(r.metricFOB) : null,
      weightKg: r.metricKG ? Number(r.metricKG) : null,
      provider: "comexstat", raw: r,
    }));
  },
  async findSuppliers(): Promise<SupplierLead[]> {
    return []; // a fonte oficial não traz nome de fornecedor
  },
};
