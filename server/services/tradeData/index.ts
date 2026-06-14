/**
 * Trade Data — registry e facade.
 *
 * A plataforma chama SEMPRE `tradeData.findSuppliers(...)` / `searchShipments(...)`.
 * O registry decide qual provedor usar com base no que está configurado:
 *  - Para nome de fornecedor/empresa: usa o primeiro PAGO configurado
 *    (ordem de preferência), porque a fonte gratuita não tem isso.
 *  - Para dados agregados de mercado: a fonte gratuita já resolve.
 *
 * Ativar a camada paga = definir a env var da chave. Nada mais muda no código.
 */
import { comexStatProvider } from "./providers/comexStatProvider";
import { importGeniusProvider } from "./providers/importGeniusProvider";
import { panjivaProvider } from "./providers/panjivaProvider";
import type {
  TradeDataProvider, ProviderId, SupplierLead, TradeShipmentRecord, ShipmentSearchParams,
} from "./types";

// Ordem de preferência quando vários pagos estiverem configurados.
const PAID_PREFERENCE: ProviderId[] = ["panjiva", "importgenius"];

const ALL: Record<ProviderId, TradeDataProvider> = {
  comexstat: comexStatProvider,
  importgenius: importGeniusProvider,
  panjiva: panjivaProvider,
};

/** Lista o status de cada provedor (para a tela de Configurações/Integrações). */
export function listProviders() {
  return (Object.keys(ALL) as ProviderId[]).map((id) => ({
    id,
    configured: ALL[id].isConfigured(),
    capabilities: ALL[id].capabilities(),
  }));
}

/** Primeiro provedor PAGO configurado (ou null). */
function firstPaidConfigured(): TradeDataProvider | null {
  for (const id of PAID_PREFERENCE) {
    if (ALL[id].isConfigured()) return ALL[id];
  }
  return null;
}

/** True se a camada paga está pronta para uso. */
export function paidLayerActive(): boolean {
  return firstPaidConfigured() !== null;
}

/**
 * Busca fornecedores (leads). Requer provedor pago — sem ele, retorna
 * lista vazia e um aviso, porque a fonte oficial não tem nomes de empresa.
 */
export async function findSuppliers(
  hsCode: string,
  opts: { originCountry?: string; limit?: number } = {}
): Promise<{ leads: SupplierLead[]; provider: ProviderId | null; note?: string }> {
  const paid = firstPaidConfigured();
  if (!paid) {
    return {
      leads: [],
      provider: null,
      note: "Busca de fornecedores por nome requer a camada paga (ImportGenius/Panjiva). " +
            "Defina a chave de API para ativar. A inteligência de mercado agregada continua disponível via Comex Stat.",
    };
  }
  const leads = await paid.findSuppliers(hsCode, opts);
  return { leads, provider: paid.id };
}

/** Busca embarques. Prefere provedor pago (nível embarque); cai p/ agregado oficial. */
export async function searchShipments(
  params: ShipmentSearchParams
): Promise<{ records: TradeShipmentRecord[]; provider: ProviderId }> {
  const paid = firstPaidConfigured();
  const provider = paid ?? comexStatProvider;
  const records = await provider.searchShipments(params);
  return { records, provider: provider.id };
}

export const tradeData = { listProviders, paidLayerActive, findSuppliers, searchShipments };
