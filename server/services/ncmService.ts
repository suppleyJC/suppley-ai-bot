/**
 * NCM Service - Otimizado para Performance
 * 
 * Melhorias implementadas:
 * - Cache em memória com LRU (500 entradas, TTL 24h)
 * - Cache de busca (search) com TTL de 5 minutos
 * - Batch suggestion para múltiplos produtos em paralelo
 * - Busca otimizada com índice em ncmCode (prefix match prioritário)
 * - Fallback robusto quando IA não responde
 */

import { getDb } from "../db";
import { ncmTaxRates } from "../../drizzle/schema";
import { eq, like, sql, or } from "drizzle-orm";
import { invokeLLM, MODELS } from "../_core/llm";
import { normalizarNcm, ncmCanonico } from "./ncmCodigo";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// CACHE - LRU com TTL
// ============================================================

interface CacheEntry<T> {
  result: T;
  timestamp: number;
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }

  set(key: string, result: T): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Cache de sugestões IA (24h, 500 entradas)
const suggestionCache = new LRUCache<NCMOptimizationResult>(500, 24 * 60 * 60 * 1000);

// Cache de buscas (5 min, 200 entradas)
const searchCache = new LRUCache<any[]>(200, 5 * 60 * 1000);

// Cache de NCM por código (1h, 1000 entradas)
const ncmByCodeCache = new LRUCache<any>(1000, 60 * 60 * 1000);

// ============================================================
// TIPOS
// ============================================================

interface SiscomexNCM {
  Codigo: string;
  Descricao: string;
  Data_Inicio: string;
  Data_Fim: string;
  Tipo_Ato_Ini: string;
  Numero_Ato_Ini: string;
  Ano_Ato_Ini: string;
}

interface SiscomexData {
  Data_Ultima_Atualizacao_NCM: string;
  Ato: string;
  Nomenclaturas: SiscomexNCM[];
}

export interface NCMSuggestion {
  ncmCode: string;
  description: string;
  iiRate: number;
  ipiRate: number;
  pisRate: number;
  cofinsRate: number;
  confidence: number;
  reason: string;
  taxSavingsPotential?: number;
  alternativeClassification?: string;
}

export interface NCMOptimizationResult {
  suggestedNCM: NCMSuggestion;
  alternatives: NCMSuggestion[];
  optimizationTips: string[];
  legalBasis: string[];
  riskLevel: "low" | "medium" | "high";
}

// ============================================================
// ALÍQUOTAS PADRÃO POR CAPÍTULO
// ============================================================

const DEFAULT_II_RATES: Record<string, number> = {
  "01": 400, "02": 1000, "03": 1000, "04": 1600, "05": 600,
  "06": 600, "07": 1000, "08": 1000, "09": 1000, "10": 800,
  "11": 1200, "12": 800, "13": 1400, "14": 800, "15": 1000,
  "16": 1600, "17": 1600, "18": 1400, "19": 1600, "20": 1600,
  "21": 1600, "22": 2000, "23": 800, "24": 2000, "25": 400,
  "26": 400, "27": 0, "28": 1200, "29": 1200, "30": 800,
  "31": 600, "32": 1400, "33": 1800, "34": 1400, "35": 1400,
  "36": 1800, "37": 1400, "38": 1400, "39": 1400, "40": 1400,
  "41": 1000, "42": 2000, "43": 2000, "44": 1000, "45": 1200,
  "46": 1800, "47": 600, "48": 1400, "49": 0, "50": 1400,
  "51": 1200, "52": 1800, "53": 1200, "54": 1800, "55": 1800,
  "56": 1800, "57": 3500, "58": 2600, "59": 1800, "60": 1800,
  "61": 3500, "62": 3500, "63": 3500, "64": 3500, "65": 2000,
  "66": 2000, "67": 2000, "68": 1000, "69": 1200, "70": 1200,
  "71": 1800, "72": 1200, "73": 1400, "74": 1000, "75": 800,
  "76": 1200, "78": 1000, "79": 1000, "80": 1000, "81": 800,
  "82": 1800, "83": 1800, "84": 1400, "85": 1600, "86": 1400,
  "87": 3500, "88": 0, "89": 1400, "90": 1400, "91": 2000,
  "92": 2000, "93": 2000, "94": 1800, "95": 2000, "96": 1800,
  "97": 400, "98": 0, "99": 0,
};

const DEFAULT_IPI_RATES: Record<string, number> = {
  "22": 2000,
  "24": 3000,
  "33": 1200,
  "87": 2500,
  "71": 1500,
};

// ============================================================
// IMPORTAÇÃO DO SISCOMEX
// ============================================================

export async function importNCMsFromSiscomex(filePath?: string): Promise<{
  success: boolean;
  imported: number;
  updated: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) {
    return { success: false, imported: 0, updated: 0, errors: ["Database not available"] };
  }

  const errors: string[] = [];
  let imported = 0;
  let updated = 0;

  try {
    const defaultPath = path.join(process.cwd(), "data", "ncm_siscomex.json");
    const jsonPath = filePath || defaultPath;

    if (!fs.existsSync(jsonPath)) {
      return { success: false, imported: 0, updated: 0, errors: ["NCM file not found"] };
    }

    const fileContent = fs.readFileSync(jsonPath, "utf-8");
    const data: SiscomexData = JSON.parse(fileContent);

    const fullNCMs = data.Nomenclaturas.filter(n => {
      const code = n.Codigo.replace(/\./g, "");
      return code.length === 8;
    });

    console.log(`[NCM Import] Processing ${fullNCMs.length} NCMs...`);

    const batchSize = 100;
    for (let i = 0; i < fullNCMs.length; i += batchSize) {
      const batch = fullNCMs.slice(i, i + batchSize);

      for (const ncm of batch) {
        try {
          const ncmCode = ncm.Codigo.replace(/\./g, "");
          const chapter = ncmCode.substring(0, 2);

          const existing = await db
            .select()
            .from(ncmTaxRates)
            .where(eq(ncmTaxRates.ncmCode, ncmCode))
            .limit(1);

          const iiRate = DEFAULT_II_RATES[chapter] || 1400;
          const ipiRate = DEFAULT_IPI_RATES[chapter] || 0;

          if (existing.length > 0) {
            if (existing[0].description !== ncm.Descricao) {
              await db
                .update(ncmTaxRates)
                .set({ description: ncm.Descricao })
                .where(eq(ncmTaxRates.ncmCode, ncmCode));
              updated++;
            }
          } else {
            await db.insert(ncmTaxRates).values({
              ncmCode,
              description: ncm.Descricao,
              iiRate,
              ipiRate,
              pisRate: 210, // 2.1% (atualizado 2026)
              cofinsRate: 1025, // 10.25% (atualizado 2026)
              mercosulIiRate: 0,
              notes: "Importado do Siscomex",
            });
            imported++;
          }
        } catch (err) {
          errors.push(`Error processing NCM ${ncm.Codigo}: ${err}`);
        }
      }

      if ((i + batchSize) % 1000 === 0) {
        console.log(`[NCM Import] Processed ${Math.min(i + batchSize, fullNCMs.length)}/${fullNCMs.length}`);
      }
    }

    // Limpar caches após importação
    searchCache.clear();
    ncmByCodeCache.clear();

    return { success: true, imported, updated, errors };
  } catch (error) {
    return {
      success: false,
      imported,
      updated,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

// ============================================================
// BUSCA DE NCM - Otimizada com cache
// ============================================================

/**
 * Busca NCMs por código ou descrição (com cache de 5 min)
 */
/** Palavras sem valor classificatório — não viram termo de busca. */
const NCM_STOPWORDS = new Set([
  "com", "sem", "para", "por", "das", "dos", "the", "and", "una", "uma",
  "que", "nao", "não", "tipo", "modelo", "item", "unidade", "unidades",
  "outros", "outras", "acabamento",
]);

/**
 * Quebra o nome do produto em termos de busca relevantes.
 * "WPC Skirting / Rodapé WPC com acabamento PVC (2,4m)" →
 * ["skirting", "rodapé", "wpc", "pvc"] — cada termo busca sozinho; o nome
 * inteiro num único LIKE nunca casa com descrição de NCM e deixava a IA
 * classificar sem nenhum candidato do banco.
 */
export function tokenizarBuscaNcm(query: string): string[] {
  const brutos = query
    .toLowerCase()
    // remove medidas ("2,4m", "10mm", "3x25kg") — nunca aparecem na TEC
    .replace(/\d+(?:[.,]\d+)?\s*(?:mm|cm|m|km|kg|g|l|ml|un|pcs?|x)?\b/gi, " ")
    .split(/[^a-zÀ-ſ]+/)
    .filter((t) => t.length >= 3 && !NCM_STOPWORDS.has(t));
  // dedup preservando ordem; termos mais longos primeiro (mais específicos)
  return Array.from(new Set(brutos))
    .sort((a, b) => b.length - a.length)
    .slice(0, 6);
}

/**
 * A descrição da NCM é um CAMINHO: "39 Plástico e suas obras. > 39.26 Outras
 * obras... > 3926.90 - Outras > 3926.90.90 Outras". A última seção é o item de
 * fato; tudo antes é contexto herdado do capítulo e da posição.
 */
export function folhaDaDescricao(descricao: string | null | undefined): string {
  const texto = String(descricao ?? "");
  const partes = texto.split(" > ");
  return (partes[partes.length - 1] ?? texto).trim();
}

/**
 * O índice FULLTEXT é criado por migração SQL aplicada à mão (0049), então o
 * código não pode assumir que ele existe: entre o deploy e a aplicação da
 * migração a busca precisa continuar funcionando. Detectado uma vez por
 * processo — é DDL, não muda em tempo de execução.
 */
let indiceFulltext: boolean | null = null;

async function temIndiceFulltext(db: any): Promise<boolean> {
  if (indiceFulltext !== null) return indiceFulltext;
  try {
    const r: any = await db.execute(sql`
      SELECT COUNT(*) AS n FROM information_schema.STATISTICS
      WHERE table_schema = DATABASE()
        AND table_name   = 'ncm_tax_rates'
        AND index_name   = 'ft_ncm_description'
    `);
    // mysql2 devolve [linhas, campos]; drizzle repassa cru.
    const linhas = Array.isArray(r) ? r[0] : r;
    const n = Number(linhas?.[0]?.n ?? 0);
    indiceFulltext = n > 0;
    if (!indiceFulltext) {
      console.warn(
        "[NCM] índice ft_ncm_description ausente — busca em modo degradado (LIKE). " +
        "Aplique drizzle/0049_ncm_fulltext.sql.",
      );
    }
  } catch {
    indiceFulltext = false;
  }
  return indiceFulltext;
}

/** Só para os testes: força a redetecção do índice. */
export function resetDeteccaoFulltext(): void {
  indiceFulltext = null;
}

/** Dobra acentos: a consulta vem de proforma, muitas vezes sem acentuação. */
function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Ordena candidatos: quantos termos casam na FOLHA primeiro, relevância do
 * FULLTEXT só como desempate.
 *
 * A ordem entre os dois critérios foi decidida por medição contra a base real,
 * não por preferência. Buscando "garrafa térmica inox":
 *
 *   9617.00.10 Garrafas térmicas...            folha 2   score 24,94
 *   8422.30.10 Máquinas para encher garrafas   folha 1   score 37,84
 *
 * A máquina de encher garrafas tem a MAIOR pontuação bruta. Uma combinação
 * multiplicativa (que era o que estava aqui) a colocaria em primeiro. Quem
 * descreve o ITEM tem que ganhar de quem só compartilha vocabulário, e é a
 * contagem na folha que expressa isso.
 */
function ordenarPorFolha(linhas: any[], termos: string[], limit: number): any[] {
  const alvos = termos.map(semAcento);
  return linhas
    .map((r) => {
      const folha = semAcento(folhaDaDescricao(r.description));
      const naFolha = alvos.reduce((n, t) => n + (folha.includes(t) ? 1 : 0), 0);
      return { r, naFolha, score: Number(r.score ?? 0) || 0 };
    })
    .sort(
      (a, b) =>
        b.naFolha - a.naFolha ||
        b.score - a.score ||
        String(a.r.ncmCode).localeCompare(String(b.r.ncmCode)),
    )
    .slice(0, limit)
    .map((x) => x.r);
}

/**
 * Busca NCMs por código ou descrição (com cache de 5 min).
 *
 * @param contexto  Descrição/especificações do produto. ENTRA na recuperação —
 *   antes só o nome curto era usado para achar candidatos, e a descrição ia
 *   direto para o modelo. Um item chamado "Cabo Flex 750V" cujo detalhe diz
 *   "condutor de cobre isolado em PVC" era procurado apenas pelo nome
 *   comercial, e o candidato certo nunca chegava à lista.
 */
export async function searchNCMs(
  query: string,
  limit: number = 20,
  contexto?: string,
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const cleanQuery = query.replace(/\./g, "").trim();
  if (!cleanQuery) return [];

  const cacheKey = `search:${cleanQuery}:${limit}:${(contexto ?? "").slice(0, 120)}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  try {
    // Código: casamento por prefixo, que usa o índice e é exato.
    if (/^\d+$/.test(cleanQuery)) {
      const results = await db
        .select()
        .from(ncmTaxRates)
        .where(like(ncmTaxRates.ncmCode, `${cleanQuery}%`))
        .limit(limit);
      searchCache.set(cacheKey, results);
      return results;
    }

    const termos = tokenizarBuscaNcm([cleanQuery, contexto ?? ""].join(" "));
    if (!termos.length) return [];

    let results: any[] = [];

    if (await temIndiceFulltext(db)) {
      // BOOLEAN MODE com CURINGA DE PREFIXO, e não natural language.
      //
      // O FULLTEXT do MySQL não faz stemming: 'solenoide' e 'solenoides' são
      // tokens distintos, 'escoramento' não casa 'escoramentos'. Medido contra
      // a base real, o termo que deveria decidir simplesmente não entrava na
      // conta e o ranking ficava por conta das palavras comuns — "escora
      // metálica" devolvia Albacora-laje (um atum), casado por "laje".
      //
      // O sufixo '*' resolve a morfologia sem stemmer. Acento NÃO precisa de
      // tratamento aqui: a collation da coluna é accent-insensitive (verificado
      // — 'metalica' casa 'metálica').
      const expressao = termos.map((t) => `${t}*`).join(" ");
      const r: any = await db.execute(sql`
        SELECT *, MATCH(description) AGAINST (${expressao} IN BOOLEAN MODE) AS score
        FROM ncm_tax_rates
        WHERE MATCH(description) AGAINST (${expressao} IN BOOLEAN MODE)
        ORDER BY score DESC
        LIMIT ${Math.max(limit * 6, 90)}
      `);
      const linhas = (Array.isArray(r) ? r[0] : r) ?? [];
      results = ordenarPorFolha(Array.isArray(linhas) ? linhas : [], termos, limit);
    }

    if (!results.length) {
      // Degradação: sem índice, ou quando o FULLTEXT não casou nada (termos
      // abaixo do token mínimo, por exemplo).
      //
      // O LIMIT aqui é generoso DE PROPÓSITO. A versão anterior cortava em 200
      // sem ORDER BY e ranqueava só o que sobrava — com descrições que carregam
      // o capítulo inteiro, um termo genérico casa centenas de linhas e a
      // resposta certa não entrava no recorte. Ranquear antes de cortar é o
      // ponto; o custo é aceitável numa tabela de 11 mil linhas.
      const brutos = await db
        .select()
        .from(ncmTaxRates)
        .where(or(...termos.map((t) => like(ncmTaxRates.description, `%${t}%`))))
        .limit(1500);

      const pontuados = (Array.isArray(brutos) ? brutos : []).map((r: any) => {
        const d = String(r.description ?? "").toLowerCase();
        return { ...r, score: termos.reduce((n, t) => n + (d.includes(t) ? 1 : 0), 0) };
      });
      results = ordenarPorFolha(pontuados, termos, limit);
    }

    searchCache.set(cacheKey, results);
    return results;
  } catch (error) {
    console.error("[NCM] Error searching NCMs:", error);
    return [];
  }
}

// ============================================================
// EXPANSÃO DE PREFIXO — SH4/SH6 → todas as NCMs de 8 dígitos
// ============================================================

/**
 * Expande códigos parciais (capítulo, posição SH4 ou subposição SH6) para as
 * NCMs de 8 dígitos que existem sob eles.
 *
 * Por que isso importa: o Comex Stat só aceita filtro por NCM de 8 dígitos. Um
 * mercado real ("pregos", "arames") não vive numa NCM só — vive numa POSIÇÃO
 * inteira. Sem expandir, uma consulta por "7317" volta vazia e o dimensionamento
 * do mercado fica impossível.
 *
 * Códigos já com 8 dígitos passam direto. Se a base local não tiver a posição
 * cadastrada, devolvemos o que veio (o chamador trata) em vez de silenciar.
 */
export async function expandNcmPrefixes(
  codes: string[],
): Promise<{ ncms: string[]; naoEncontrados: string[] }> {
  const limpos = Array.from(
    new Set(codes.map((c) => String(c ?? "").replace(/\D/g, "")).filter(Boolean)),
  );
  const completos = new Set<string>();
  const prefixos: string[] = [];
  const naoEncontrados: string[] = [];

  for (const c of limpos) {
    if (c.length === 8) completos.add(c);
    else if (c.length >= 2) prefixos.push(c);
  }

  if (prefixos.length) {
    const db = await getDb();
    if (db) {
      for (const p of prefixos) {
        try {
          const linhas = await db
            .select({ ncmCode: ncmTaxRates.ncmCode })
            .from(ncmTaxRates)
            .where(like(ncmTaxRates.ncmCode, `${p}%`))
            .limit(500);
          const oito = linhas
            .map((l) => String(l.ncmCode).replace(/\D/g, ""))
            .filter((n) => n.length === 8);
          if (oito.length) oito.forEach((n) => completos.add(n));
          else naoEncontrados.push(p);
        } catch (error) {
          console.error(`[NCM] Erro ao expandir prefixo ${p}:`, error);
          naoEncontrados.push(p);
        }
      }
    } else {
      naoEncontrados.push(...prefixos);
    }
  }

  return { ncms: Array.from(completos).sort(), naoEncontrados };
}

/**
 * Obtém NCM por código (com cache de 1h)
 */
export async function getNCMByCode(ncmCode: string): Promise<any | null> {
  // Normaliza pela MESMA regra da escrita: tirar só os pontos deixava
  // '3923300000' (10 dígitos, 87 produtos na base) sem correspondência, e o
  // produto ficava sem alíquota como se a NCM não existisse.
  const cleanCode = ncmCanonico(ncmCode) ?? ncmCode.replace(/\D/g, "");
  if (!cleanCode) return null;

  // Check cache
  const cached = ncmByCodeCache.get(cleanCode);
  if (cached) return cached;

  const db = await getDb();
  if (!db) return null;

  try {
    const results = await db
      .select()
      .from(ncmTaxRates)
      .where(eq(ncmTaxRates.ncmCode, cleanCode))
      .limit(1);

    const result = results[0] || null;
    if (result) {
      ncmByCodeCache.set(cleanCode, result);
    }
    return result;
  } catch (error) {
    console.error("[NCM] Error getting NCM:", error);
    return null;
  }
}

// ============================================================
// SUGESTÃO DE NCM COM IA - Otimizada
// ============================================================

/**
 * Sugere NCM com base no nome do produto usando IA
 * Usa cache de 24h e fallback robusto
 */
export async function suggestNCMWithAI(
  productName: string,
  productDescription?: string,
  /**
   * CRUZAMENTO COM O DOCUMENTO (proforma/cotação): a linha completa do item
   * como consta no documento — especificações, material, dimensões, uso.
   * Melhora a precisão: a NCM é decidida pelas características REAIS do item,
   * não só pelo nome curto.
   */
  documentContext?: string,
): Promise<NCMOptimizationResult> {
  const normalizedName = productName.toLowerCase().trim();
  const normalizedDesc = (productDescription || "").toLowerCase().trim();
  const normalizedDoc = (documentContext || "").toLowerCase().trim().slice(0, 400);
  const cacheKey = `${normalizedName}|${normalizedDesc}|${normalizedDoc}`;

  // Check cache
  const cached = suggestionCache.get(cacheKey);
  if (cached) {
    console.log(`[NCM] Cache hit for: ${productName}`);
    return cached;
  }

  // A RECUPERAÇÃO usa nome + descrição + linha do documento. O modelo só
  // escolhe bem entre candidatos que a busca trouxe; procurar apenas pelo nome
  // comercial curto deixava de fora o candidato certo sempre que o detalhe
  // técnico (material, processo, tensão) era o que decidia a posição.
  const similarNCMs = await searchNCMs(
    productName,
    30,
    [productDescription ?? "", documentContext ?? ""].join(" ").trim() || undefined,
  );

  // Cada candidato vai com o CAMINHO hierárquico completo — capítulo, posição,
  // subposição e item. Sem ele, um quarto da nomenclatura chega ao modelo como
  // "Outros" e não há como aplicar a RGI 6, que compara no mesmo nível.
  const ncmContext = similarNCMs.slice(0, 15).map(n =>
    `${n.ncmCode}: ${n.description} (II: ${(n.iiRate / 100).toFixed(1)}%)`
  ).join("\n");

  const prompt = `Você é um especialista em classificação fiscal de mercadorias (NCM) no Brasil.

PRODUTO A CLASSIFICAR:
Nome: ${productName}
${productDescription ? `Descrição: ${productDescription}` : ""}
${documentContext ? `Como consta no documento (proforma/cotação): ${documentContext}
IMPORTANTE: cruze o nome com a descrição do documento — material, dimensões, uso e especificações do documento DECIDEM a posição correta quando o nome for genérico.` : ""}

NCMs DISPONÍVEIS NO SISTEMA:
${ncmContext || "Nenhum NCM similar encontrado no banco de dados."}

MÉTODO DE CLASSIFICAÇÃO (siga nesta ordem — RGI 1 a 6):
1. FORMA E MATÉRIA decidem o capítulo, antes de qualquer uso comercial. Percorra a hierarquia
   capítulo → posição (4 díg.) → subposição (6 díg.) → item (8 díg.) e só desça quando o nível
   acima estiver certo. Um erro de capítulo é o erro mais caro que existe aqui.
2. Os candidatos vêm com o CAMINHO completo ("39 Plástico e suas obras. > 39.26 Outras obras...
   > 3926.90 - Outras > 3926.90.90 Outras"). Compare no MESMO nível (RGI 6): dois itens só se
   comparam depois que a posição está decidida. Uma folha que se lê "Outros" não descreve nada
   sozinha — leia-a junto com o caminho que a precede.
3. RESIDUAL É ÚLTIMO RECURSO. Posições "Outros/Outras" existem para o que não cabe em nenhuma
   posição específica. Antes de escolher uma, verifique se há item específico na MESMA subposição.
   Escolher residual sem justificar por que os específicos não servem é classificar por desistência.
4. NUNCA complete uma subposição com zeros para chegar a 8 dígitos. "3923.30" é SUBPOSIÇÃO; os
   itens reais são 3923.30.10 e 3923.30.90 — "3923.30.00" NÃO EXISTE e é rejeitado na declaração.
   Se não souber descer ao item, diga isso e baixe a confiança; não invente o último par de dígitos.
5. Eixos que decidem a classificação, nesta ordem de força: MATÉRIA (do que é feito) → FORMA/PROCESSO
   (como se apresenta: fio, chapa, obra acabada) → USO. O uso comercial quase nunca vence a matéria.
   Exemplo do capítulo 73, onde a forma mais confunde: FIO/ARAME de ferro ou aço não ligado
   (mesmo zincado ou recozido) = 7217, inox = 7223; PREGOS e tachas = 7317; ARAME FARPADO = 7313;
   ESTRUTURA de construção (pontes, torres, andaimes) = 7308, sendo andaimes e escoramentos
   7308.40.00; FIO-MÁQUINA laminado a quente = 7213. O mesmo raciocínio vale em qualquer capítulo:
   a matéria fixa o capítulo, a forma fixa a posição, o uso só desempata no fim.
6. Prefira SEMPRE um código da lista acima quando ele descrever corretamente o produto. Só proponha
   um código fora da lista se a lista não contiver a posição correta — e nesse caso o código precisa
   existir de fato na NCM vigente. Nunca invente dígitos para completar 8 posições.
7. A confiança deve refletir a evidência: acima de 85 só quando matéria, forma e uso estiverem
   determinados E os candidatos convergirem na mesma subposição. Se os dois melhores candidatos
   estiverem em CAPÍTULOS diferentes, a confiança fica abaixo de 60 e o risco é alto — diga qual
   informação resolveria a dúvida (matéria? processo? apresentação? uso?).

TAREFA:
1. Identifique a NCM mais adequada para este produto
2. Sugira até 2 classificações alternativas com menor carga tributária
3. Avalie o risco de cada classificação
4. Cite base legal quando possível (RGI aplicada, nota de seção/capítulo)

Responda em JSON com o formato especificado.`;

  try {
    const response = await invokeLLM({
      // Classificação NCM não é tarefa determinística: exige percorrer a hierarquia
      // da TEC e aplicar as RGI. No modelo rápido a taxa de erro de CAPÍTULO era
      // alta demais (arame caindo em 7308, estrutura de construção) — e capítulo
      // errado contamina alíquota, barreira e todo o cálculo a jusante.
      model: MODELS.balanced,
      messages: [
        { role: "system", content: "Você é um especialista em classificação fiscal NCM. Responda sempre em JSON válido. Seja conciso." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ncm_suggestion",
          strict: true,
          schema: {
            type: "object",
            properties: {
              suggestedNCM: {
                type: "object",
                properties: {
                  ncmCode: { type: "string" },
                  description: { type: "string" },
                  iiRate: { type: "number" },
                  confidence: { type: "number" },
                  reason: { type: "string" },
                },
                required: ["ncmCode", "description", "iiRate", "confidence", "reason"],
                additionalProperties: false,
              },
              alternatives: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ncmCode: { type: "string" },
                    description: { type: "string" },
                    iiRate: { type: "number" },
                    confidence: { type: "number" },
                    reason: { type: "string" },
                    taxSavingsPotential: { type: "number" },
                    alternativeClassification: { type: "string" },
                  },
                  required: ["ncmCode", "description", "iiRate", "confidence", "reason"],
                  additionalProperties: false,
                },
              },
              optimizationTips: {
                type: "array",
                items: { type: "string" },
              },
              legalBasis: {
                type: "array",
                items: { type: "string" },
              },
              riskLevel: {
                type: "string",
                enum: ["low", "medium", "high"],
              },
            },
            required: ["suggestedNCM", "alternatives", "optimizationTips", "legalBasis", "riskLevel"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (content && typeof content === "string") {
      // Claude às vezes embrulha o JSON em cercas markdown (```json ... ```).
      // Removemos as cercas antes do parse para evitar SyntaxError.
      const cleaned = content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const result: NCMOptimizationResult = JSON.parse(cleaned);

      // NORMALIZA a saída do modelo antes de qualquer coisa: o código gravado e
      // o código consultado têm que ser a MESMA string. Foi a ausência disso em
      // todos os caminhos de escrita que espalhou a mesma NCM em cinco grafias.
      const canonicoPrincipal = ncmCanonico(result.suggestedNCM.ncmCode);
      if (canonicoPrincipal) result.suggestedNCM.ncmCode = canonicoPrincipal;
      for (const alt of result.alternatives) {
        const c = ncmCanonico(alt.ncmCode);
        if (c) alt.ncmCode = c;
      }

      // Enriquecer com dados do banco em paralelo (não sequencial)
      const allCodes = [
        result.suggestedNCM.ncmCode,
        ...result.alternatives.map(a => a.ncmCode),
      ];
      const dbResults = await Promise.all(allCodes.map(code => getNCMByCode(code)));

      // Enriquecer sugestão principal
      const mainDb = dbResults[0];
      if (mainDb) {
        result.suggestedNCM.ipiRate = mainDb.ipiRate;
        result.suggestedNCM.pisRate = mainDb.pisRate;
        result.suggestedNCM.cofinsRate = mainDb.cofinsRate;
        // A descrição OFICIAL da NCM vence a que o modelo escreveu — é o que a
        // pessoa vai conferir na TEC.
        if (mainDb.description) result.suggestedNCM.description = mainDb.description;
      } else {
        result.suggestedNCM.ipiRate = 0;
        result.suggestedNCM.pisRate = 210;
        result.suggestedNCM.cofinsRate = 1025;
      }

      // VALIDAÇÃO DE EXISTÊNCIA — um código que não existe na nomenclatura vigente
      // não pode sair com confiança alta: ele contamina alíquota, barreira e todo
      // o cálculo a jusante. Rebaixa a confiança e eleva o risco, em vez de
      // apresentar um palpite com cara de certeza.
      //
      // O teste de 8 dígitos sozinho NÃO basta: '39233000' tem oito dígitos e
      // não existe — é a subposição 3923.30 completada com zeros, o padrão que
      // respondia por 736 produtos do catálogo. Quem decide é a presença na
      // nomenclatura (`mainDb`), e o aviso diz qual dos dois defeitos ocorreu.
      const normalizado = normalizarNcm(result.suggestedNCM.ncmCode);
      if (!mainDb || !normalizado.canonico) {
        const motivo = !normalizado.canonico
          ? `não é um item de 8 dígitos (${normalizado.classe})`
          : `não consta na nomenclatura da base — pode ser subposição completada com zeros`;
        result.suggestedNCM.confidence = Math.min(result.suggestedNCM.confidence ?? 0, 45);
        result.riskLevel = "high";
        result.suggestedNCM.reason =
          `${result.suggestedNCM.reason ?? ""} ` +
          `[Código ${result.suggestedNCM.ncmCode}: ${motivo}. Confirmar na TEC antes de fechar.]`.trim();
      }

      // Enriquecer alternativas
      for (let i = 0; i < result.alternatives.length; i++) {
        const altDb = dbResults[i + 1];
        if (altDb) {
          result.alternatives[i].ipiRate = altDb.ipiRate;
          result.alternatives[i].pisRate = altDb.pisRate;
          result.alternatives[i].cofinsRate = altDb.cofinsRate;
        } else {
          result.alternatives[i].ipiRate = 0;
          result.alternatives[i].pisRate = 210;
          result.alternatives[i].cofinsRate = 1025;
        }
      }

      // Cache resultado
      suggestionCache.set(cacheKey, result);
      return result;
    }
  } catch (error) {
    console.error("[NCM] Error suggesting NCM with AI:", error);
  }

  // Fallback: retornar melhor match do banco
  return buildFallbackResult(similarNCMs);
}

/**
 * Sugestão em batch - processa múltiplos produtos em paralelo
 * Limita concorrência para não sobrecarregar a API de IA
 */
export async function suggestNCMBatch(
  products: Array<{ name: string; description?: string }>
): Promise<Map<string, NCMOptimizationResult>> {
  const results = new Map<string, NCMOptimizationResult>();
  const MAX_CONCURRENT = 3; // Máximo de chamadas IA simultâneas

  // Separar em cached e não-cached
  const uncached: Array<{ name: string; description?: string; key: string }> = [];

  for (const product of products) {
    const key = `${product.name.toLowerCase().trim()}|${(product.description || "").toLowerCase().trim()}`;
    const cached = suggestionCache.get(key);
    if (cached) {
      results.set(product.name, cached);
    } else {
      uncached.push({ ...product, key });
    }
  }

  console.log(`[NCM Batch] ${results.size} cached, ${uncached.length} to process`);

  // Processar não-cached com concorrência limitada
  for (let i = 0; i < uncached.length; i += MAX_CONCURRENT) {
    const batch = uncached.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map(p => suggestNCMWithAI(p.name, p.description))
    );

    for (let j = 0; j < batch.length; j++) {
      const result = batchResults[j];
      if (result.status === "fulfilled") {
        results.set(batch[j].name, result.value);
      } else {
        console.error(`[NCM Batch] Failed for ${batch[j].name}:`, result.reason);
        // Usar fallback
        const fallback = buildFallbackResult([]);
        results.set(batch[j].name, fallback);
      }
    }
  }

  return results;
}

// ============================================================
// COMPARAÇÃO E ESTATÍSTICAS
// ============================================================

/**
 * Compara alíquotas entre NCMs
 */
export async function compareNCMRates(ncmCodes: string[]): Promise<{
  ncms: any[];
  cheapest: string;
  mostExpensive: string;
  potentialSavings: number;
}> {
  // Buscar todos em paralelo
  const ncmsRaw = await Promise.all(ncmCodes.map(code => getNCMByCode(code)));
  const ncms = ncmsRaw
    .filter(Boolean)
    .map(ncm => ({
      ...ncm,
      totalRate: ncm.iiRate + ncm.ipiRate + ncm.pisRate + ncm.cofinsRate,
    }));

  ncms.sort((a, b) => a.totalRate - b.totalRate);

  const cheapest = ncms[0]?.ncmCode || "";
  const mostExpensive = ncms[ncms.length - 1]?.ncmCode || "";
  const potentialSavings = ncms.length > 1
    ? ncms[ncms.length - 1].totalRate - ncms[0].totalRate
    : 0;

  return { ncms, cheapest, mostExpensive, potentialSavings };
}

/**
 * Obtém estatísticas do banco de NCMs
 */
export async function getNCMStats(): Promise<{
  totalNCMs: number;
  lastUpdate: string;
  byChapter: Record<string, number>;
  cacheStats: { suggestions: number; searches: number; codes: number };
}> {
  const db = await getDb();
  if (!db) {
    return {
      totalNCMs: 0,
      lastUpdate: "N/A",
      byChapter: {},
      cacheStats: { suggestions: 0, searches: 0, codes: 0 },
    };
  }

  try {
    // Contar total sem carregar todos os registros
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(ncmTaxRates);

    const totalNCMs = Number(countResult[0]?.count || 0);

    return {
      totalNCMs,
      lastUpdate: new Date().toISOString(),
      byChapter: {},
      cacheStats: {
        suggestions: suggestionCache.size,
        searches: searchCache.size,
        codes: ncmByCodeCache.size,
      },
    };
  } catch (error) {
    return {
      totalNCMs: 0,
      lastUpdate: "N/A",
      byChapter: {},
      cacheStats: { suggestions: 0, searches: 0, codes: 0 },
    };
  }
}

/**
 * Limpa todos os caches (útil após importação ou atualização)
 */
export function clearNCMCaches(): void {
  suggestionCache.clear();
  searchCache.clear();
  ncmByCodeCache.clear();
  console.log("[NCM] All caches cleared");
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function buildFallbackResult(similarNCMs: any[]): NCMOptimizationResult {
  const bestMatch = similarNCMs[0];
  return {
    suggestedNCM: {
      ncmCode: bestMatch?.ncmCode || "00000000",
      description: bestMatch?.description || "NCM não encontrado",
      iiRate: bestMatch?.iiRate || 1400,
      ipiRate: bestMatch?.ipiRate || 0,
      pisRate: bestMatch?.pisRate || 210,
      cofinsRate: bestMatch?.cofinsRate || 1025,
      confidence: bestMatch ? 50 : 0,
      reason: bestMatch
        ? "Melhor correspondência encontrada no banco de dados"
        : "Nenhuma correspondência encontrada. Consulte um despachante.",
    },
    alternatives: similarNCMs.slice(1, 3).map(n => ({
      ncmCode: n.ncmCode,
      description: n.description,
      iiRate: n.iiRate,
      ipiRate: n.ipiRate,
      pisRate: n.pisRate,
      cofinsRate: n.cofinsRate,
      confidence: 30,
      reason: "Alternativa baseada em similaridade de descrição",
    })),
    optimizationTips: ["Consulte um despachante aduaneiro para validar a classificação"],
    legalBasis: [],
    riskLevel: "medium",
  };
}


/**
 * Importa NCMs a partir de conteúdo de arquivo (JSON ou CSV)
 */
export async function importNCMsFromFile(
  fileContent: string,
  fileType: "json" | "csv"
): Promise<{ success: boolean; imported: number; updated: number; errors: string[] }> {
  const db = await getDb();
  if (!db) {
    return { success: false, imported: 0, updated: 0, errors: ["Database not available"] };
  }

  const errors: string[] = [];
  let imported = 0;
  let updated = 0;

  try {
    let ncms: Array<{ code: string; description: string }> = [];

    if (fileType === "json") {
      const data = JSON.parse(fileContent);
      if (data.Nomenclaturas) {
        // Formato Siscomex
        ncms = data.Nomenclaturas
          .filter((n: any) => n.Codigo.replace(/\./g, "").length === 8)
          .map((n: any) => ({ code: n.Codigo.replace(/\./g, ""), description: n.Descricao }));
      } else if (Array.isArray(data)) {
        ncms = data.map((n: any) => ({
          code: (n.ncmCode || n.code || n.Codigo || "").replace(/\./g, ""),
          description: n.description || n.Descricao || "",
        }));
      }
    } else if (fileType === "csv") {
      const lines = fileContent.split("\n").filter(l => l.trim());
      // Skip header
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length >= 2) {
          ncms.push({
            code: parts[0].replace(/[.\s"]/g, ""),
            description: parts.slice(1).join(",").replace(/"/g, "").trim(),
          });
        }
      }
    }

    // Filtrar apenas códigos válidos (8 dígitos)
    ncms = ncms.filter(n => /^\d{8}$/.test(n.code));

    for (const ncm of ncms) {
      try {
        const chapter = ncm.code.substring(0, 2);
        const existing = await db
          .select()
          .from(ncmTaxRates)
          .where(eq(ncmTaxRates.ncmCode, ncm.code))
          .limit(1);

        const iiRate = DEFAULT_II_RATES[chapter] || 1400;
        const ipiRate = DEFAULT_IPI_RATES[chapter] || 0;

        if (existing.length > 0) {
          if (existing[0].description !== ncm.description && ncm.description) {
            await db
              .update(ncmTaxRates)
              .set({ description: ncm.description })
              .where(eq(ncmTaxRates.ncmCode, ncm.code));
            updated++;
          }
        } else {
          await db.insert(ncmTaxRates).values({
            ncmCode: ncm.code,
            description: ncm.description,
            iiRate,
            ipiRate,
            pisRate: 210,
            cofinsRate: 1025,
            mercosulIiRate: 0,
            notes: `Importado via upload (${fileType})`,
          });
          imported++;
        }
      } catch (err) {
        errors.push(`Error processing NCM ${ncm.code}: ${err}`);
      }
    }

    // Limpar caches
    searchCache.clear();
    ncmByCodeCache.clear();

    return { success: true, imported, updated, errors };
  } catch (error) {
    return {
      success: false,
      imported,
      updated,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
