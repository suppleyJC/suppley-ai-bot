/**
 * Cache em memória simples para operações determinísticas (NCM, câmbio, alíquotas).
 *
 * Em produção single-node isso já corta latência e custo de chamadas repetidas à
 * IA/APIs. Para multi-node, trocar por Redis mantendo a mesma interface.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** TTLs padrão por tipo de operação (em ms). */
export const TTL = {
  ncm: 30 * 24 * 60 * 60 * 1000, // 30 dias — classificação NCM é estável
  exchange: 60 * 60 * 1000, // 1 hora — câmbio PTAX
  taxRate: 7 * 24 * 60 * 60 * 1000, // 7 dias — alíquotas mudam pouco
  short: 5 * 60 * 1000, // 5 minutos — uso genérico
} as const;

export function getCache<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCache<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Wrapper memoizado: retorna do cache se existir, senão executa fn, grava e devolve.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = getCache<T>(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  setCache(key, value, ttlMs);
  return value;
}

/** Invalida uma chave específica ou tudo (sem argumento). */
export function clearCache(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}
