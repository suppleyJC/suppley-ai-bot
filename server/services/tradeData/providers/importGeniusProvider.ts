/**
 * ImportGenius Provider — ADAPTADOR EM STANDBY.
 *
 * Ativa-se automaticamente quando IMPORTGENIUS_API_KEY estiver definida.
 * Sem a chave, isConfigured() = false e a plataforma usa o provedor gratuito.
 *
 * ⚠️ ENDPOINTS E CAMPOS: a API ImportGenius é liberada no plano Enterprise
 * (ou add-on no Business) e a documentação exata é entregue na contratação.
 * Os caminhos/campos abaixo são um ESQUELETO REALISTA — confirme contra a doc
 * oficial recebida e ajuste o mapeamento em `mapShipment`/`mapSupplier`.
 * A interface pública (searchShipments/findSuppliers) NÃO muda.
 */
import {
  type TradeDataProvider, type TradeShipmentRecord, type SupplierLead,
  type ShipmentSearchParams, type ProviderCapabilities,
  ProviderNotConfiguredError,
} from "../types";

const BASE_URL = process.env.IMPORTGENIUS_BASE_URL || "https://api.importgenius.com/v1";

function apiKey(): string | null {
  return process.env.IMPORTGENIUS_API_KEY || null;
}

async function ig<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const key = apiKey();
  if (!key) throw new ProviderNotConfiguredError("importgenius");
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`ImportGenius ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// --- Mapeadores: AJUSTAR conforme schema real da resposta ---
function mapShipment(r: any): TradeShipmentRecord {
  return {
    date: r.shipmentDate ?? r.date ?? null,
    hsCode: r.hsCode ?? r.hs_code ?? null,
    productDescription: r.productDescription ?? r.description ?? null,
    supplierName: r.supplier ?? r.shipperName ?? null,
    buyerName: r.consignee ?? r.buyerName ?? null,
    originCountry: r.originCountry ?? r.origin ?? null,
    destinationCountry: r.destinationCountry ?? r.destination ?? null,
    quantity: r.quantity != null ? Number(r.quantity) : null,
    unit: r.unit ?? null,
    valueUsd: r.valueUsd != null ? Number(r.valueUsd) : null,
    weightKg: r.weightKg != null ? Number(r.weightKg) : null,
    provider: "importgenius",
    raw: r,
  };
}

function mapSupplier(r: any): SupplierLead {
  return {
    companyName: r.companyName ?? r.name ?? "—",
    country: r.country ?? null,
    hsCodes: r.hsCodes ?? (r.hsCode ? [r.hsCode] : []),
    shipmentCount: r.shipmentCount != null ? Number(r.shipmentCount) : null,
    lastSeen: r.lastShipmentDate ?? null,
    contact: { email: r.email ?? null, phone: r.phone ?? null },
    provider: "importgenius",
  };
}

export const importGeniusProvider: TradeDataProvider = {
  id: "importgenius",

  isConfigured() {
    return !!apiKey();
  },

  capabilities(): ProviderCapabilities {
    return {
      hasCompanyNames: true,
      hasContactInfo: true,
      hasShipmentLevel: true,
      coverageNote: "EUA + 12 países da América Latina, a partir de registros de bill of lading.",
    };
  },

  async searchShipments(params: ShipmentSearchParams): Promise<TradeShipmentRecord[]> {
    const data = await ig<{ results?: any[] }>("/shipments/search", {
      hs_code: params.hsCode,
      q: params.productText,
      origin: params.originCountry,
      destination: params.destinationCountry,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      limit: params.limit ?? 50,
    });
    return (data.results ?? []).map(mapShipment);
  },

  async findSuppliers(hsCode, opts = {}): Promise<SupplierLead[]> {
    const data = await ig<{ companies?: any[] }>("/companies/suppliers", {
      hs_code: hsCode,
      origin: opts.originCountry,
      limit: opts.limit ?? 25,
    });
    return (data.companies ?? []).map(mapSupplier);
  },
};
