/**
 * Agente de Qualidade de Dados (Fase 5) — saúde da base.
 *
 * Varre as bases que crescem com a ingestão (fornecedores, ativos, portfólio
 * declarado, proformas) e aponta:
 *   - DUPLICIDADES: fornecedores/ativos com nomes praticamente iguais
 *   - CAMPOS AUSENTES: sem país, sem setor, sem NCM, sem classe/criticidade,
 *     portfólio sem preço, fornecedor sem contato
 *   - INCONSISTÊNCIAS: mesmo produto com NCMs divergentes, preços de portfólio
 *     desatualizados, proformas paradas sem distribuição
 *
 * É leitura pura: NADA é corrigido automaticamente — o relatório orienta a
 * correção humana (ou via Excambia, item a item).
 */
import * as industriesDb from "../db/industriesDb";
import * as fase5Db from "../db/fase5Db";
import { getProformasByUser } from "../db/proformaDb";
import { normalizeForSearch, tokenSimilarity } from "./productSimilarity";

// Acima deste score dois NOMES são considerados prováveis duplicatas.
const DUP_THRESHOLD = 0.82;
// Preço de portfólio sem cotação há mais tempo que isto é "desatualizado".
const PRECO_DESATUALIZADO_DIAS = 180;
// Proforma não distribuída há mais tempo que isto é "parada".
const PROFORMA_PARADA_DIAS = 14;

export interface DuplicataSuspeita {
  tipo: "fornecedor" | "ativo";
  idA: number;
  nomeA: string;
  idB: number;
  nomeB: string;
  similaridade: number;
}

export interface CampoAusente {
  entidade: "fornecedor" | "ativo" | "portfolio";
  id: number;
  nome: string;
  problemas: string[];
}

export interface Inconsistencia {
  tipo: "ncm_divergente" | "preco_desatualizado" | "proforma_parada";
  descricao: string;
  refIds: number[];
}

export interface RelatorioQualidade {
  duplicatas: DuplicataSuspeita[];
  incompletos: CampoAusente[];
  inconsistencias: Inconsistencia[];
  totais: {
    fornecedores: number;
    ativos: number;
    itensPortfolio: number;
    proformas: number;
    problemas: number;
  };
}

/** Similaridade de nomes p/ dedup: tokens + normalização (acentos, caixa, '×'). */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeForSearch(a);
  const nb = normalizeForSearch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return tokenSimilarity(na, nb);
}

/** Pares suspeitos de duplicidade dentro de uma lista (O(n²) — ok até alguns milhares). */
function acharDuplicatas(
  tipo: "fornecedor" | "ativo",
  rows: Array<{ id: number; nome: string; grupo?: string }>,
): DuplicataSuspeita[] {
  const out: DuplicataSuspeita[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      // Para ativos, só compara dentro do mesmo fornecedor (grupo) — variantes
      // legítimas em fornecedores diferentes não são duplicata.
      if (rows[i].grupo !== rows[j].grupo) continue;
      const s = nameSimilarity(rows[i].nome, rows[j].nome);
      if (s >= DUP_THRESHOLD) {
        out.push({
          tipo,
          idA: rows[i].id, nomeA: rows[i].nome,
          idB: rows[j].id, nomeB: rows[j].nome,
          similaridade: Math.round(s * 100) / 100,
        });
      }
    }
  }
  return out;
}

export async function analisarQualidadeDados(userId: number): Promise<RelatorioQualidade> {
  const [fornecedores, ativos, portfolio, proformas] = await Promise.all([
    industriesDb.getIndustriesByUserAndType(userId, "fornecedor"),
    fase5Db.listAtivos(userId),
    industriesDb.listIndustryPortfolio(userId),
    getProformasByUser(userId),
  ]);

  const duplicatas: DuplicataSuspeita[] = [];
  const incompletos: CampoAusente[] = [];
  const inconsistencias: Inconsistencia[] = [];

  // ---------- FORNECEDORES ----------
  duplicatas.push(
    ...acharDuplicatas(
      "fornecedor",
      fornecedores.map((f) => ({ id: f.id, nome: f.name, grupo: "todos" })),
    ),
  );
  for (const f of fornecedores) {
    const problemas: string[] = [];
    if (!f.country || /^desconhecido$/i.test(f.country)) problemas.push("país não informado");
    if (!f.sector || f.sector === "other") problemas.push("setor não categorizado");
    if (!f.contactEmail && !f.contactPhone && !f.contactWhatsapp) problemas.push("sem nenhum contato (email/telefone)");
    if (problemas.length) incompletos.push({ entidade: "fornecedor", id: f.id, nome: f.name, problemas });
  }

  // ---------- ATIVOS & INSUMOS ----------
  duplicatas.push(
    ...acharDuplicatas(
      "ativo",
      ativos.map((a) => ({ id: a.id, nome: a.name, grupo: String(a.supplierId ?? "sem-fornecedor") })),
    ),
  );
  for (const a of ativos) {
    const problemas: string[] = [];
    if (!a.ncmCode || a.ncmCode === "00000000") problemas.push("sem NCM");
    else if (a.ncmStatus === "sugerido") problemas.push("NCM sugerida, não validada");
    if (!a.classe) problemas.push("sem classe");
    if (!a.criticidade) problemas.push("sem criticidade");
    if (problemas.length) incompletos.push({ entidade: "ativo", id: a.id, nome: a.name, problemas });
  }

  // NCM divergente: mesmo nome normalizado com NCMs diferentes (fornecedores distintos).
  const porNome = new Map<string, { ids: number[]; ncms: Set<string>; nome: string }>();
  for (const a of ativos) {
    const ncm = a.ncmCode && a.ncmCode !== "00000000" ? a.ncmCode : null;
    if (!ncm) continue;
    const key = normalizeForSearch(a.name);
    const g = porNome.get(key) ?? { ids: [], ncms: new Set<string>(), nome: a.name };
    g.ids.push(a.id);
    g.ncms.add(ncm);
    porNome.set(key, g);
  }
  for (const g of Array.from(porNome.values())) {
    if (g.ncms.size > 1) {
      inconsistencias.push({
        tipo: "ncm_divergente",
        descricao: `"${g.nome}" aparece com ${g.ncms.size} NCMs diferentes (${Array.from(g.ncms).join(", ")}) — unificar a classificação.`,
        refIds: g.ids,
      });
    }
  }

  // ---------- PORTFÓLIO DECLARADO (catálogo dos cards) ----------
  const agora = Date.now();
  for (const r of portfolio) {
    const p = r.product;
    const problemas: string[] = [];
    if (p.priceFob == null && p.priceExw == null && p.priceCif == null) problemas.push("sem preço declarado");
    if (!p.ncmCode) problemas.push("sem NCM");
    if (problemas.length) {
      incompletos.push({
        entidade: "portfolio",
        id: p.id,
        nome: `${p.name} (${r.industryName})`,
        problemas,
      });
    }
    const ultima = p.lastQuotedAt ?? p.priceValidFrom ?? null;
    const temPreco = p.priceFob != null || p.priceExw != null || p.priceCif != null;
    if (temPreco && ultima) {
      const dias = Math.floor((agora - new Date(ultima).getTime()) / 86_400_000);
      if (dias > PRECO_DESATUALIZADO_DIAS) {
        inconsistencias.push({
          tipo: "preco_desatualizado",
          descricao: `Portfólio: "${p.name}" (${r.industryName}) sem cotação há ${Math.floor(dias / 30)} meses — vale pedir preço atualizado (RFQ).`,
          refIds: [p.id],
        });
      }
    }
  }

  // ---------- PROFORMAS PARADAS ----------
  for (const pf of proformas) {
    if (pf.status === "distribuida" || pf.status === "arquivada") continue;
    const criada = pf.createdAt ? new Date(pf.createdAt).getTime() : null;
    if (criada && (agora - criada) / 86_400_000 > PROFORMA_PARADA_DIAS) {
      inconsistencias.push({
        tipo: "proforma_parada",
        descricao: `Proforma ${pf.numero ?? `#${pf.id}`} (${pf.supplierName ?? "fornecedor n/d"}) está "${pf.status}" há mais de ${PROFORMA_PARADA_DIAS} dias sem distribuir para a base.`,
        refIds: [pf.id],
      });
    }
  }

  return {
    duplicatas,
    incompletos,
    inconsistencias,
    totais: {
      fornecedores: fornecedores.length,
      ativos: ativos.length,
      itensPortfolio: portfolio.length,
      proformas: proformas.length,
      problemas: duplicatas.length + incompletos.length + inconsistencias.length,
    },
  };
}
