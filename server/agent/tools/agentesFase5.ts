/**
 * FASE 5 · FATIA 4 — Agentes da ingestão e busca, implementados.
 *
 * Cada agente é uma capacidade especializada que o pipeline/Excambia aciona.
 * ANCORAM em serviços que JÁ EXISTEM (não recriar):
 *   - agenteDocumental → storageGet + quotationExtractorService
 *   - agenteFiscalNcm  → ncmService.suggestNCMWithAI
 *
 * GUARDRAIL: NCM e preços saem como SUGESTÃO + confiança, nunca verdade automática.
 * Alíquota/fórmula só do motor determinístico. Humano aprova antes de gravar.
 */
import { storageGet } from "../../storage";
import {
  extractQuotationFromPdf, normalizeExtractedProducts,
  type ExtractedQuotation,
} from "../../services/quotationExtractorService";
import * as ncmService from "../../services/ncmService";
import * as fase5Db from "../../db/fase5Db";
import * as proformaDb from "../../db/proformaDb";
import { catalogMatchScore } from "../../services/productSimilarity";

/* ============================================================
 * Tipos compartilhados do pipeline
 * ============================================================ */
export interface ItemExtraido {
  ref: string;                 // referência interna para casar com preço/ncm
  descricao: string;
  categoria?: string;
  material?: string;
  dimensoes?: string;
  unidade?: string;
  quantidade?: number;
  ncmSugerido?: string;
  origem?: "nacional" | "internacional";
  paisOrigem?: string;
  confianca: number;
}

export interface FornecedorExtraido {
  ref: string;
  nome: string;
  pais?: string;
  cidade?: string;
  tipo?: string;
  origem?: "nacional" | "internacional";
  confianca: number;
}

export interface PrecoExtraido {
  ativoRef: string;
  fornecedorRef: string;
  precoCents: number;
  moeda: string;
  incoterm?: string;
  moq?: number;
  confianca: number;
}

export interface NcmSugestao {
  ativoRef: string;
  ncmSugerido: string;
  confianca: number;
  fonte: string;
}

/* ============================================================
 * Agente Documental — extrai dados brutos do PDF/planilha
 * ============================================================ */
export async function agenteDocumental(input: {
  storageKey: string; tipo: string; userId: number;
}): Promise<ExtractedQuotation> {
  const { url } = await storageGet(input.storageKey);
  // Hoje o extractor cobre PDF de cotação/proforma/invoice (mesmo layout tabular).
  // Planilhas entram como pdf_outro até termos parser dedicado.
  const extraido = await extractQuotationFromPdf(url);
  return {
    ...extraido,
    products: normalizeExtractedProducts(extraido.products || []),
  };
}

/* ============================================================
 * Agente de Ativos & Insumos — identifica/padroniza itens
 * ============================================================ */
export async function agenteAtivos(input: {
  bruto: ExtractedQuotation; userId: number;
}): Promise<ItemExtraido[]> {
  const origem: "nacional" | "internacional" =
    input.bruto.supplierCountry && /brasil|brazil/i.test(input.bruto.supplierCountry)
      ? "nacional" : "internacional";

  return (input.bruto.products || []).map((p, i) => ({
    ref: `item-${i}`,
    descricao: p.productName,
    dimensoes: p.sku,
    unidade: p.unit,
    quantidade: p.quantity,
    ncmSugerido: p.ncmCode || undefined,
    origem,
    paisOrigem: input.bruto.supplierCountry,
    // confiança maior quando o documento já trouxe NCM e descrição não-genérica
    confianca: p.ncmCode ? 80 : (p.productName?.length > 3 ? 60 : 30),
  }));
}

/* ============================================================
 * Agente de Fornecedores / Fabricantes
 * ============================================================ */
export async function agenteFornecedores(input: {
  bruto: ExtractedQuotation; userId: number;
}): Promise<FornecedorExtraido[]> {
  const nome = input.bruto.supplierName?.trim();
  if (!nome) return [];
  const pais = input.bruto.supplierCountry?.trim();
  const origem: "nacional" | "internacional" =
    pais && /brasil|brazil/i.test(pais) ? "nacional" : "internacional";
  return [{
    ref: "forn-0",
    nome,
    pais,
    origem,
    tipo: origem === "nacional" ? "fornecedor_nacional" : "fabrica",
    confianca: pais ? 75 : 50,
  }];
}

/* ============================================================
 * Agente de Preços — valor, moeda, MOQ, Incoterm
 * ============================================================ */
export async function agentePrecos(input: {
  bruto: ExtractedQuotation; itens: ItemExtraido[]; fornecedores: FornecedorExtraido[];
}): Promise<PrecoExtraido[]> {
  const fornecedorRef = input.fornecedores[0]?.ref ?? "forn-0";
  const moeda = (input.bruto.currency || "USD").toUpperCase().slice(0, 3);
  return (input.bruto.products || []).map((p, i) => ({
    ativoRef: `item-${i}`,
    fornecedorRef,
    precoCents: Math.round((p.unitPrice || 0) * 100),
    moeda: (p.currency || moeda).toUpperCase().slice(0, 3),
    incoterm: input.bruto.incoterm,
    confianca: p.unitPrice > 0 ? 80 : 30,
  }));
}

/* ============================================================
 * Agente Fiscal / NCM — sugere classificação (com confiança)
 * Limita chamadas ao LLM para conter custo: só itens sem NCM, até 8.
 * ============================================================ */
export async function agenteFiscalNcm(input: {
  itens: ItemExtraido[];
}): Promise<NcmSugestao[]> {
  const sugestoes: NcmSugestao[] = [];
  let llmCalls = 0;
  const MAX_LLM = 8;

  for (const item of input.itens) {
    if (item.ncmSugerido) {
      sugestoes.push({ ativoRef: item.ref, ncmSugerido: item.ncmSugerido, confianca: 80, fonte: "documento" });
      continue;
    }
    if (llmCalls >= MAX_LLM) {
      sugestoes.push({ ativoRef: item.ref, ncmSugerido: "", confianca: 0, fonte: "pendente" });
      continue;
    }
    try {
      llmCalls++;
      const r = await ncmService.suggestNCMWithAI(item.descricao);
      sugestoes.push({
        ativoRef: item.ref,
        ncmSugerido: r.suggestedNCM?.ncmCode ?? "",
        confianca: typeof r.suggestedNCM?.confidence === "number" ? Math.round(r.suggestedNCM.confidence) : 40,
        fonte: "ia",
      });
    } catch {
      sugestoes.push({ ativoRef: item.ref, ncmSugerido: "", confianca: 0, fonte: "erro" });
    }
  }
  return sugestoes;
}

/* ============================================================
 * Agente de Qualidade — alertas e confiança consolidada
 * ============================================================ */
export async function agenteQualidade(input: {
  itens: ItemExtraido[]; fornecedores: FornecedorExtraido[]; precos: PrecoExtraido[];
}): Promise<{ alertas: string[]; confianca: number }> {
  const alertas: string[] = [];

  if (input.itens.length === 0) alertas.push("Nenhum item identificado no documento.");
  if (input.fornecedores.length === 0) alertas.push("Fornecedor não identificado — preencha manualmente.");

  const semPreco = input.precos.filter((p) => p.precoCents <= 0).length;
  if (semPreco > 0) alertas.push(`${semPreco} item(ns) sem preço legível.`);

  const semNcm = input.itens.filter((i) => !i.ncmSugerido).length;
  if (semNcm > 0) alertas.push(`${semNcm} item(ns) sem NCM — sugestão pendente de validação.`);

  // duplicidade de descrição dentro do próprio documento
  const vistos = new Set<string>();
  for (const i of input.itens) {
    const k = i.descricao.toLowerCase().trim();
    if (vistos.has(k)) { alertas.push(`Item duplicado no documento: "${i.descricao}".`); }
    vistos.add(k);
  }

  // confiança média ponderada (itens + preços)
  const confs = [
    ...input.itens.map((i) => i.confianca),
    ...input.precos.map((p) => p.confianca),
  ];
  const confianca = confs.length
    ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length)
    : 0;

  return { alertas, confianca };
}

/* ============================================================
 * Tools de BUSCA (lado "leitura" do ciclo) — usadas pela Excambia
 * ============================================================ */
// Abaixo deste score a correspondência é fraca demais para sugerir.
const CATALOGO_MATCH_THRESHOLD = 0.45;

export interface AtivoHit {
  id: number;
  nome: string;
  ncm: string | null;
  origem: string | null;
  precoMedioCents: number | null;
  menorPrecoCents: number | null;
  totalRegistros: number;
}

export interface ProformaHit {
  proformaId: number;
  numero: string | null;
  productName: string;
  ncm: string | null;
  supplierName: string | null;
  unitPriceCents: number;
  currency: string;
  unit: string;
  quantity: number;
  quotationDate: Date;
}

/**
 * Busca no CATÁLOGO inteiro: Ativos & Insumos (products) E Proformas cadastradas
 * (proformaItems). O casamento é fuzzy (token/containment via catalogMatchScore),
 * então identifica o produto mesmo que a pessoa escreva de outra forma no chat
 * ("prego 17×27 cabeça simples" acha "Prego cabeça simples 17x27"). Inclui a
 * proforma mesmo que ainda não tenha sido distribuída para a base — é a fonte de
 * preço real que a pessoa cadastrou.
 */
export async function buscarCatalogo(input: { termo: string; userId: number }): Promise<{
  ativos: AtivoHit[];
  proformas: ProformaHit[];
}> {
  // 1) ATIVOS (products) — fuzzy sobre nome + descrição
  const todos = await fase5Db.listAtivos(input.userId);
  const ativosRank = todos
    .map((a) => ({ a, score: catalogMatchScore(input.termo, `${a.name} ${a.description ?? ""}`) }))
    .filter((r) => r.score >= CATALOGO_MATCH_THRESHOLD)
    .sort((x, y) => y.score - x.score)
    .slice(0, 8);

  const ativos: AtivoHit[] = await Promise.all(
    ativosRank.map(async ({ a }) => {
      const precos = await fase5Db.precosDoAtivo(a.id);
      const cents = precos.map((p) => p.precoCents).filter((v) => v > 0);
      const medio = cents.length
        ? Math.round(cents.reduce((x, y) => x + y, 0) / cents.length)
        : (a.custoImportadoRefCents ?? a.custoNacionalRefCents ?? null);
      const menor = cents.length
        ? Math.min(...cents)
        : (a.custoImportadoRefCents ?? a.custoNacionalRefCents ?? null);
      return {
        id: a.id, nome: a.name, ncm: a.ncmCode, origem: a.origem,
        precoMedioCents: medio, menorPrecoCents: menor, totalRegistros: precos.length,
      };
    }),
  );

  // 2) PROFORMAS (proformaItems) — preço cotado direto, mesmo sem distribuir.
  //    Dedup por produto+fornecedor, mantendo a cotação MAIS RECENTE.
  const itens = await proformaDb.getProformaItemsWithContext(input.userId);
  const byKey = new Map<string, { it: (typeof itens)[number]; score: number }>();
  for (const it of itens) {
    const score = catalogMatchScore(input.termo, it.productName);
    if (score < CATALOGO_MATCH_THRESHOLD) continue;
    const key = `${it.productName.toLowerCase()}::${(it.supplierName ?? "").toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev || it.quotationDate > prev.it.quotationDate) byKey.set(key, { it, score });
  }
  const proformas: ProformaHit[] = Array.from(byKey.values())
    .sort((x, y) => y.score - x.score)
    .slice(0, 8)
    .map(({ it }) => ({
      proformaId: it.proformaId, numero: it.numero, productName: it.productName,
      ncm: it.ncmCode, supplierName: it.supplierName, unitPriceCents: it.unitPriceCents,
      currency: it.currency, unit: it.unit, quantity: it.quantity, quotationDate: it.quotationDate,
    }));

  return { ativos, proformas };
}

/** Compat: retorna só os ativos (products). Usado pelo router fase5. */
export async function buscarAtivo(input: { termo: string; userId: number }): Promise<AtivoHit[]> {
  const { ativos } = await buscarCatalogo(input);
  return ativos;
}

export async function compararNacionalImportado(input: {
  ativoId: number; userId: number;
}): Promise<{ nacionalCents?: number; importadoCents?: number; recomendacao: string }> {
  const ativo = await fase5Db.getAtivo(input.ativoId, input.userId);
  if (!ativo) return { recomendacao: "Ativo não encontrado." };

  const precos = await fase5Db.precosDoAtivo(input.ativoId);
  const media = (origem: string) => {
    const cents = precos.filter((p) => p.origem === origem).map((p) => p.precoCents).filter((v) => v > 0);
    return cents.length ? Math.round(cents.reduce((a, b) => a + b, 0) / cents.length) : undefined;
  };

  const nacionalCents = media("nacional") ?? ativo.custoNacionalRefCents ?? undefined;
  const importadoCents = media("internacional") ?? ativo.custoImportadoRefCents ?? undefined;

  let recomendacao: string;
  if (nacionalCents == null && importadoCents == null) {
    recomendacao = "Sem dados suficientes para comparar.";
  } else if (nacionalCents != null && importadoCents != null) {
    const dif = importadoCents - nacionalCents;
    recomendacao = dif > 0
      ? `Nacional mais barato em ${(dif / 100).toFixed(2)} (por unidade na base). Considere comprar nacional — confirme prazo e impostos no motor.`
      : `Importado mais barato em ${(-dif / 100).toFixed(2)} (por unidade na base). Avalie importar — rode montar_calculo para o custo nacionalizado real.`;
  } else {
    recomendacao = nacionalCents != null
      ? "Só há referência nacional registrada. Sem base importada para comparar."
      : "Só há referência importada registrada. Sem base nacional para comparar.";
  }

  return { nacionalCents, importadoCents, recomendacao };
}
