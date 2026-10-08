import axios from "axios";
import { saveExchangeRate, getLatestExchangeRate } from "../db";

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Moedas suportadas pela API do BCB
const BCB_SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "DKK", "NOK", "SEK"];

interface AwesomeApiResponse {
  [key: string]: {
    code: string;
    codein: string;
    name: string;
    high: string;
    low: string;
    varBid: string;
    pctChange: string;
    bid: string;
    ask: string;
    timestamp: string;
    create_date: string;
  };
}

interface ExchangeRateResult {
  rate: number;
  source: string;
  timestamp: Date;
}

/**
 * Format date as MM-DD-YYYY for BCB API
 */
function formatDateForBcb(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
}

/**
 * Fetch USD/BRL exchange rate from BCB (Banco Central do Brasil)
 * Uses PTAX official rate
 */
async function fetchUsdFromBcb(): Promise<ExchangeRateResult | null> {
  try {
    // Try today first
    const today = new Date();
    const dateStr = formatDateForBcb(today);
    
    console.log(`[ExchangeService] Fetching USD from BCB for date: ${dateStr}`);
    
    const response = await axios.get(
      `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`,
      { timeout: 10000 }
    );
    
    let data = response.data?.value?.[0];
    
    // If no data for today, try previous days (weekends/holidays)
    if (!data) {
      for (let i = 1; i <= 5; i++) {
        const prevDate = new Date(today);
        prevDate.setDate(prevDate.getDate() - i);
        const prevDateStr = formatDateForBcb(prevDate);
        
        console.log(`[ExchangeService] No data for today, trying: ${prevDateStr}`);
        
        const fallbackResponse = await axios.get(
          `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${prevDateStr}'&$format=json`,
          { timeout: 10000 }
        );
        
        data = fallbackResponse.data?.value?.[0];
        if (data) break;
      }
    }
    
    if (!data) {
      console.warn("[ExchangeService] No USD data from BCB");
      return null;
    }
    
    console.log(`[ExchangeService] BCB USD rate: ${data.cotacaoVenda}`);
    
    return {
      rate: data.cotacaoVenda,
      source: "BCB-PTAX",
      timestamp: new Date(data.dataHoraCotacao),
    };
  } catch (error) {
    console.error("[ExchangeService] BCB USD API error:", error);
    return null;
  }
}

/**
 * Fetch other currency rates from BCB (EUR, GBP, etc.)
 * Uses PTAX closing rate (Fechamento PTAX)
 */
async function fetchCurrencyFromBcb(currency: string): Promise<ExchangeRateResult | null> {
  if (!BCB_SUPPORTED_CURRENCIES.includes(currency) || currency === "USD") {
    return null;
  }
  
  try {
    const today = new Date();
    
    // Try today and previous days
    for (let i = 0; i <= 5; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() - i);
      const dateStr = formatDateForBcb(targetDate);
      
      console.log(`[ExchangeService] Fetching ${currency} from BCB for date: ${dateStr}`);
      
      const response = await axios.get(
        `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='${currency}'&@dataCotacao='${dateStr}'&$format=json`,
        { timeout: 10000 }
      );
      
      const values = response.data?.value;
      if (values && values.length > 0) {
        // Get the PTAX closing rate (last entry or "Fechamento PTAX")
        const ptaxRate = values.find((v: any) => v.tipoBoletim === "Fechamento PTAX") || values[values.length - 1];
        
        console.log(`[ExchangeService] BCB ${currency} rate: ${ptaxRate.cotacaoVenda}`);
        
        return {
          rate: ptaxRate.cotacaoVenda,
          source: "BCB-PTAX",
          timestamp: new Date(ptaxRate.dataHoraCotacao),
        };
      }
    }
    
    console.warn(`[ExchangeService] No ${currency} data from BCB`);
    return null;
  } catch (error) {
    console.error(`[ExchangeService] BCB ${currency} API error:`, error);
    return null;
  }
}

/**
 * Fetch exchange rate from AwesomeAPI (fallback for currencies not in BCB)
 */
async function fetchFromAwesomeApi(from: string, to: string): Promise<ExchangeRateResult | null> {
  try {
    const pair = `${from}-${to}`;
    console.log(`[ExchangeService] Fetching from AwesomeAPI: ${pair}`);
    
    const response = await axios.get<AwesomeApiResponse>(
      `https://economia.awesomeapi.com.br/json/last/${pair}`,
      { timeout: 10000 }
    );
    
    const key = `${from}${to}`;
    const data = response.data[key];
    
    if (!data) {
      console.warn(`[ExchangeService] No data for pair ${pair}`);
      return null;
    }
    
    const rate = parseFloat(data.bid);
    if (isNaN(rate)) {
      console.warn(`[ExchangeService] Invalid rate for pair ${pair}`);
      return null;
    }
    
    console.log(`[ExchangeService] AwesomeAPI ${pair} rate: ${rate}`);
    
    return {
      rate,
      source: "AwesomeAPI",
      timestamp: new Date(data.create_date),
    };
  } catch (error) {
    console.error("[ExchangeService] AwesomeAPI error:", error);
    return null;
  }
}

/**
 * Get exchange rate with caching
 * Priority: BCB (official) > AwesomeAPI (fallback) > Cache > Default
 */
export async function getExchangeRate(from: string, to: string): Promise<ExchangeRateResult> {
  // Check cache first
  const cached = await getLatestExchangeRate(from, to);
  
  if (cached) {
    const cacheAge = Date.now() - cached.fetchedAt.getTime();
    if (cacheAge < CACHE_DURATION_MS) {
      return {
        rate: cached.rate / 1000000, // Convert back from stored format
        source: cached.source,
        timestamp: cached.fetchedAt,
      };
    }
  }
  
  let result: ExchangeRateResult | null = null;
  
  // Try BCB first (official source) for supported currencies
  if (to === "BRL") {
    if (from === "USD") {
      result = await fetchUsdFromBcb();
    } else if (BCB_SUPPORTED_CURRENCIES.includes(from)) {
      result = await fetchCurrencyFromBcb(from);
    }
  }
  
  // Fallback to AwesomeAPI for unsupported currencies or if BCB fails
  if (!result) {
    result = await fetchFromAwesomeApi(from, to);
  }
  
  if (!result) {
    // Use cached value if available, even if stale
    if (cached) {
      console.warn("[ExchangeService] Using stale cached rate");
      return {
        rate: cached.rate / 1000000,
        source: `${cached.source} (cached)`,
        timestamp: cached.fetchedAt,
      };
    }
    
    // Last resort: use a default rate
    console.error("[ExchangeService] All sources failed, using default rate");
    return {
      rate: 5.0,
      source: "default",
      timestamp: new Date(),
    };
  }
  
  // Save to cache
  await saveExchangeRate({
    fromCurrency: from,
    toCurrency: to,
    rate: Math.round(result.rate * 1000000), // Store as integer
    source: result.source,
    fetchedAt: result.timestamp,
  });
  
  return result;
}

/**
 * Convert amount from one currency to another
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<{ converted: number; rate: number; source: string }> {
  if (from === to) {
    return { converted: amount, rate: 1, source: "same-currency" };
  }
  
  const { rate, source } = await getExchangeRate(from, to);
  return {
    converted: amount * rate,
    rate,
    source,
  };
}

/**
 * Get multiple exchange rates at once
 */
export async function getMultipleRates(pairs: Array<{ from: string; to: string }>) {
  const results: Record<string, ExchangeRateResult> = {};
  
  for (const { from, to } of pairs) {
    const key = `${from}/${to}`;
    results[key] = await getExchangeRate(from, to);
  }
  
  return results;
}

// Supported currencies for the application
export const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "Dólar Americano", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "Libra Esterlina", symbol: "£" },
  { code: "PYG", name: "Guarani Paraguaio", symbol: "₲" },
  { code: "ARS", name: "Peso Argentino", symbol: "$" },
  { code: "UYU", name: "Peso Uruguaio", symbol: "$" },
  { code: "CNY", name: "Yuan Chinês", symbol: "¥" },
  { code: "BRL", name: "Real Brasileiro", symbol: "R$" },
];
