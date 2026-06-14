/**
 * Panjiva (S&P Global) Provider — ADAPTADOR EM STANDBY.
 *
 * Ativa quando PANJIVA_API_KEY estiver definida. Panjiva é enterprise
 * (preço sob cotação) e cobre Brasil + América do Sul a nível de embarque.
 * Endpoints/campos são entregues na contratação — ajuste os mapeadores.
 */
import {
  type TradeDataProvider, type TradeShipmentRecord, type SupplierLead,
  type ShipmentSearchParams, type ProviderCapabilities,
  ProviderNotConfiguredError,
} from "../types";

const BASE_URL = process.env.PANJIVA_BASE_URL || "https://api.panjiva.com/v1";
const apiKey = () => process.env.PANJIVA_API_KEY || null;

async function pj<T>(path: string, body: unknown): Promise<T> {
  const key = apiKey();
  if (!key) throw new ProviderNotConfiguredError("panjiva");
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Panjiva ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const panjivaProvider: TradeDataProvider = {
  id: "panjiva",
  isConfigured() { return !!apiKey(); },
  capabilities(): ProviderCapabilities {
    return {
      hasCompanyNames: true,
      hasContactInfo: true,
      hasShipmentLevel: true,
      coverageNote: "Cobertura global incluindo Brasil e América do Sul; 2bi+ registros de embarque.",
    };
  },
  async searchShipments(params: ShipmentSearchParams): Promise<TradeShipmentRecord[]> {
    const data = await pj<{ hits?: any[] }>("/shipment/search", {
      hs_code: params.hsCode, q: params.productText,
      origin: params.originCountry, destination: params.destinationCountry,
      date_from: params.dateFrom, date_to: params.dateTo, size: params.limit ?? 50,
    });
    return (data.hits ?? []).map((r: any): TradeShipmentRecord => ({
      date: r.arrivalDate ?? null, hsCode: r.hsCode ?? null,
      productDescription: r.goodsShipped ?? null,
      supplierName: r.shipper?.name ?? null, buyerName: r.consignee?.name ?? null,
      originCountry: r.originCountry ?? null, destinationCountry: r.destinationCountry ?? null,
      quantity: r.quantity != null ? Number(r.quantity) : null, unit: r.unit ?? null,
      valueUsd: r.valueUsd != null ? Number(r.valueUsd) : null,
      weightKg: r.weightKg != null ? Number(r.weightKg) : null,
      provider: "panjiva", raw: r,
    }));
  },
  async findSuppliers(hsCode, opts = {}): Promise<SupplierLead[]> {
    const data = await pj<{ companies?: any[] }>("/company/search", {
      hs_code: hsCode, country: opts.originCountry, role: "supplier", size: opts.limit ?? 25,
    });
    return (data.companies ?? []).map((c: any): SupplierLead => ({
      companyName: c.name ?? "—", country: c.country ?? null,
      hsCodes: c.hsCodes ?? [], shipmentCount: c.shipmentCount ?? null,
      lastSeen: c.lastSeen ?? null, provider: "panjiva",
    }));
  },
};
