/**
 * Trade Data Providers — contrato comum (provider-agnostic).
 *
 * Toda a plataforma fala com ESTE contrato, nunca com um provedor específico.
 * Trocar ImportGenius por Panjiva (ou usar os dois) é trocar o adaptador,
 * sem tocar no resto do sistema. A camada gratuita (Comex Stat) também
 * implementa este contrato no que é capaz (sem nome de empresa).
 */

export type ProviderId = "comexstat" | "importgenius" | "panjiva";

export interface TradeShipmentRecord {
  /** Data do embarque/registro (ISO) */
  date: string | null;
  hsCode: string | null;
  productDescription: string | null;
  /** Nome da empresa — só disponível em provedores PAGOS */
  supplierName: string | null;
  buyerName: string | null;
  originCountry: string | null;
  destinationCountry: string | null;
  quantity: number | null;
  unit: string | null;
  valueUsd: number | null;
  weightKg: number | null;
  provider: ProviderId;
  raw?: unknown;
}

export interface SupplierLead {
  companyName: string;
  country: string | null;
  hsCodes: string[];
  shipmentCount: number | null;
  lastSeen: string | null;
  contact?: { email?: string | null; phone?: string | null };
  provider: ProviderId;
}

export interface ShipmentSearchParams {
  hsCode?: string;
  productText?: string;
  originCountry?: string;
  destinationCountry?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export interface ProviderCapabilities {
  hasCompanyNames: boolean;   // ComexStat = false; pagos = true
  hasContactInfo: boolean;
  hasShipmentLevel: boolean;
  coverageNote: string;
}

export interface TradeDataProvider {
  readonly id: ProviderId;
  /** Configurado = chave/credencial presente no ambiente. */
  isConfigured(): boolean;
  capabilities(): ProviderCapabilities;
  searchShipments(params: ShipmentSearchParams): Promise<TradeShipmentRecord[]>;
  findSuppliers(hsCode: string, opts?: { originCountry?: string; limit?: number }): Promise<SupplierLead[]>;
}

/** Erro padronizado quando o provedor é chamado sem estar configurado. */
export class ProviderNotConfiguredError extends Error {
  constructor(public providerId: ProviderId) {
    super(`Provedor "${providerId}" não está configurado. Defina as variáveis de ambiente correspondentes.`);
    this.name = "ProviderNotConfiguredError";
  }
}
