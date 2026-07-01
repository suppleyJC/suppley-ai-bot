/**
 * Excel Estimativa Service — gera a pasta de trabalho no LAYOUT DO MODELO de
 * referência ("Escoras · Trade · Lucro Real x Lucro Real"), com FÓRMULAS VIVAS:
 * o destinatário pode alterar câmbio, FOB, alíquotas ou despesas e tudo
 * recalcula no próprio Excel.
 *
 * Abas (espelham o modelo):
 *  1. INVOICE                          — fatura/packing list (com colunas de
 *     royalties, zeradas por padrão — sem subfaturamento: declarado = real)
 *  2. CUSTO MERCADORIA - IMP. PRÓPRIA  — grade por item: nacionalização +
 *     venda do IMPORTADOR + venda do COMPRADOR (Lucro Real)
 *  3. EST. DE CUSTO - IMP. PRÓPRIA     — consolidação, NF-e, ESTIMATIVA DE VENDA
 *     DO IMPORTADOR, GANHO DA OPERAÇÃO e ESTIMATIVA DO COMPRADOR (Lucro Real)
 *
 * Modos:
 *  - "internal": visão da trading (mostra o ganho do benefício/operação).
 *  - "client":   versão para enviar ao cliente (oculta o spread).
 *
 * GUARDRAIL FISCAL: o motor certificado (importCostEngine) é a fonte dos
 * valores; aqui só montamos a planilha. As fórmulas refletem a metodologia,
 * mas os números base vêm do motor — nunca do LLM.
 */
import ExcelJS from "exceljs";
import type { EngineResult, EngineItemResult } from "./importCostEngine";

const SHEET_INVOICE = "INVOICE";
const SHEET_CUSTO = "CUSTO MERCADORIA - IMP. PRÓPRIA";
const SHEET_EST = "EST. DE CUSTO - IMP. PRÓPRIA";

const COLORS = {
  header: "FF311260",   // roxo SUPPLEY
  accent: "FF28E7C5",   // turquesa
  buyer: "FF1AA885",    // verde (bloco comprador)
  light: "FFF3F4F6",
  param: "FFFFFF00",    // amarelo (células editáveis) — espelha o modelo
  white: "FFFFFFFF",
  section: "FFEDE7F6",
  bandHeader: "FFD9D2E9", // lavanda (cabeçalhos de bloco)
};
const MONEY = "#,##0.00";
const MONEY_BRL = '"R$"\\ #,##0.00';
const MONEY_USD = '"$"\\ #,##0.00';
const PCT = "0.00%";
const PCT3 = "0.000%";
const THIN = { style: "thin" as const, color: { argb: "FFBBBBBB" } };
const ALL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const isMoney = (f?: string) => f === MONEY || f === MONEY_BRL || f === MONEY_USD;

export interface ExcelEstimativaOptions {
  quotationName: string;
  supplierName?: string;
  originCountry?: string;
  clientName?: string;
  mode: "internal" | "client";
  regime: "lucro_real" | "lucro_presumido" | "simples_nacional";
  currency?: string;
}

// ============================================================
// Helpers de coluna/estilo
// ============================================================
function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function regimeLabel(r: string) {
  return r === "lucro_real" ? "Lucro Real" : r === "lucro_presumido" ? "Lucro Presumido" : "Simples Nacional";
}
function styleTitle(row: ExcelJS.Row) {
  row.font = { bold: true, size: 13, color: { argb: COLORS.header } };
}
function fillCell(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

// ============================================================
// Definição da grade da aba CUSTO MERCADORIA (colunas fixas)
// ============================================================
interface GridCol {
  key: string;
  header: string;
  fmt?: string;
  group: "id" | "nac" | "imp" | "buyer";
  /** Valor do motor para a linha do item. */
  value: (it: EngineItemResult, idx: number) => number | string | undefined;
  /** Fórmula Excel viva. `C` resolve a letra de outra coluna; `P` resolve param. `inv` = linha na INVOICE. */
  formula?: (r: number, C: (k: string) => string, P: (k: string) => string, inv: number) => string;
}

export async function generateEstimativaExcel(
  result: EngineResult,
  opts: ExcelEstimativaOptions
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SUPPLEY Calc";
  wb.created = new Date();
  const s = result.summary;
  const internal = opts.mode === "internal";
  const hasBuyer = !!s.buyer;
  const cur = opts.currency ?? "USD";

  // ============================================================
  // ABA 1 — INVOICE / PACKING LIST (espelha o modelo)
  //  Colunas: A Description · B Size · C G.W(kg) · D Espec. · E Q'ty/Unit ·
  //  F Unit price · G Amount · H Unit price dec. · I Amount dec. ·
  //  J Royalties Un. · K Royalties Total · L NCM
  // ============================================================
  const inv = wb.addWorksheet(SHEET_INVOICE);
  // Título "PACKING LIST" mesclado sobre todas as colunas (linha 1).
  const invTitle = inv.getRow(1).getCell(1);
  invTitle.value = "PACKING LIST";
  inv.mergeCells(1, 1, 1, 12);
  invTitle.alignment = { horizontal: "center", vertical: "middle" };
  invTitle.font = { bold: true, size: 14, color: { argb: COLORS.white } };
  fillCell(invTitle, COLORS.header);
  inv.getRow(1).height = 24;

  const INV_HDR = 2;
  const INV_ITEM0 = 3; // primeira linha de item
  const invCols = [
    "Description", "Size", "G.W (kg)", "Espec.", `Q'ty/Unit`, `Unit price (${cur})`, "Amount",
    "Unit price dec.", "Amount dec.", "Royalties Un.", "Royalties Total", "NCM",
  ];
  const invHdr = inv.getRow(INV_HDR);
  invCols.forEach((h, i) => (invHdr.getCell(i + 1).value = h));
  invHdr.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: COLORS.header } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, COLORS.bandHeader);
    cell.border = ALL_BORDERS;
  });
  invHdr.height = 28;

  result.items.forEach((it, i) => {
    const r = INV_ITEM0 + i;
    const row = inv.getRow(r);
    row.getCell(1).value = it.description;                 // A Description
    row.getCell(2).value = "";                             // B Size
    row.getCell(3).value = it.weightKgTotal || 0;          // C G.W (kg)
    row.getCell(4).value = "";                             // D Espec.
    row.getCell(5).value = it.quantity;                    // E Q'ty/Unit
    row.getCell(6).value = it.unitPriceFob;                // F Unit price (real)
    row.getCell(7).value = { formula: `E${r}*F${r}`, result: it.totalFob };   // G Amount
    row.getCell(8).value = { formula: `F${r}`, result: it.unitPriceFob };     // H Unit price dec. = real (sem subfaturamento)
    row.getCell(9).value = { formula: `E${r}*H${r}`, result: it.totalFob };   // I Amount dec.
    row.getCell(10).value = { formula: `IF(F${r}>H${r},F${r}-H${r},0)`, result: 0 }; // J Royalties Un. = 0
    row.getCell(11).value = { formula: `E${r}*J${r}`, result: 0 };            // K Royalties Total = 0
    row.getCell(12).value = it.ncm;                        // L NCM
    [6, 7, 8, 9].forEach((c) => (row.getCell(c).numFmt = MONEY_USD));
    row.eachCell((cell) => { cell.alignment = { horizontal: "center", vertical: "middle" }; cell.border = ALL_BORDERS; });
    row.getCell(1).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  });
  const invTotR = INV_ITEM0 + result.items.length;
  const invTot = inv.getRow(invTotR);
  invTot.getCell(1).value = "TOTAL";
  invTot.getCell(5).value = { formula: `SUM(E${INV_ITEM0}:E${invTotR - 1})`, result: result.items.reduce((a, i) => a + i.quantity, 0) };
  invTot.getCell(7).value = { formula: `SUM(G${INV_ITEM0}:G${invTotR - 1})`, result: s.fobTotalFob };
  invTot.getCell(9).value = { formula: `SUM(I${INV_ITEM0}:I${invTotR - 1})`, result: s.fobTotalFob };
  invTot.getCell(11).value = { formula: `SUM(K${INV_ITEM0}:K${invTotR - 1})`, result: 0 };
  invTot.eachCell((cell) => { cell.font = { bold: true }; fillCell(cell, COLORS.light); cell.border = ALL_BORDERS; });
  [7, 9].forEach((c) => (invTot.getCell(c).numFmt = MONEY_USD));
  [40, 24, 9, 12, 11, 16, 14, 13, 14, 11, 13, 12].forEach((w, i) => (inv.getColumn(i + 1).width = w));
  // Colunas de royalties ocultas (J=Royalties Un., K=Royalties Total).
  inv.getColumn(10).hidden = true;
  inv.getColumn(11).hidden = true;

  // ============================================================
  // ABA 2 — CUSTO MERCADORIA — espelha o modelo do contador:
  //   • Título "ESTIMATIVA DE IMPORTAÇÃO"
  //   • Bloco de parâmetros à esquerda (Valor Fob/Frete/Seguro/ADU) +
  //     à direita (Peso/Taxa dólar/SISCOMEX/AFRMM) — células amarelas = input
  //   • Bloco "Demais Despesas" itemizado + Pacote/Royalties
  //   • Banner "CUSTO DE IMPORTAÇÃO" sobre a grade por item
  // As fórmulas da grade referenciam essas células ($) — tudo recalcula no Excel.
  // ============================================================
  const ws = wb.addWorksheet(SHEET_CUSTO);

  // ---- taxas derivadas (base para as células de parâmetro) ----
  const it0 = result.items[0];
  const grossUp = it0 && it0.icmsBase > 0
    ? 1 - (it0.customsValueBrl + it0.afrmmBrl + it0.siscomexBrl + it0.iiValue + it0.ipiValue + it0.pisValue + it0.cofinsValue) / it0.icmsBase
    : 0.04;
  const assessRate = it0 && it0.totalCostBeforeAssessoria > 0 ? it0.assessoriaValue / (s.royaltiesTotal * it0.shareOfValue + it0.totalCostBeforeAssessoria) : 0;
  const icmsVendaRate = s.salePriceTotal > 0 ? s.icmsVendaTotal / s.salePriceTotal : 0.04;
  const pisVendaRate = s.salePriceTotal > 0 ? s.pisVendaTotal / s.salePriceTotal : 0.0165;
  const cofinsVendaRate = s.salePriceTotal > 0 ? s.cofinsVendaTotal / s.salePriceTotal : 0.076;

  // Referência de parâmetro por célula absoluta ($COL$LINHA). Preenchido abaixo.
  const PARAMS: Record<string, string> = {};
  const P = (k: string) => PARAMS[k] ?? "0";

  // ---- Definição das colunas da grade ----
  const cols: GridCol[] = [
    { key: "item", header: "ITEM", group: "id", value: (_it, i) => i + 1 },
    { key: "codigo", header: "CÓDIGO", group: "id", value: (it) => it.ncm },
    { key: "qtd", header: "QUANTIDADE", group: "id", value: (it) => it.quantity, formula: (_r, _C, _P, inv) => `INVOICE!E${inv}` },
    { key: "un", header: "UN.", group: "id", value: (it) => it.unit },
    { key: "desc", header: "DESCRIÇÃO", group: "id", value: (it) => it.description, formula: (_r, _C, _P, inv) => `INVOICE!A${inv}` },
    { key: "ncm", header: "NCM", group: "id", value: (it) => it.ncm, formula: (_r, _C, _P, inv) => `INVOICE!L${inv}` },
    { key: "vunit", header: "VALOR UNITÁRIO", fmt: MONEY_USD, group: "nac", value: (it) => it.unitPriceFob, formula: (_r, _C, _P, inv) => `INVOICE!H${inv}` },
    { key: "vtotal", header: "VALOR TOTAL", fmt: MONEY_USD, group: "nac", value: (it) => it.totalFob, formula: (r, C) => `${C("qtd")}${r}*${C("vunit")}${r}` },
    { key: "peso", header: "PESO", fmt: "#,##0.00", group: "nac", value: (it) => it.weightKgTotal || 0 },
    { key: "pvalor", header: "% VALOR", fmt: PCT3, group: "nac", value: (it) => it.shareOfValue, formula: (r, C, P) => `${C("vtotal")}${r}/${P("FOB_USD")}` },
    { key: "fobbrl", header: "VALOR FOB R$", fmt: MONEY_BRL, group: "nac", value: (it) => it.fobBrl, formula: (r, C, P) => `${C("vtotal")}${r}*${P("FX")}` },
    { key: "frete", header: "FRETE", fmt: MONEY_BRL, group: "nac", value: (it) => it.freightBrl, formula: (r, C, P) => `${P("FRETE_BRL")}*${C("pvalor")}${r}` },
    { key: "adu", header: "VLR ADUANEIRO R$", fmt: MONEY_BRL, group: "nac", value: (it) => it.customsValueBrl, formula: (r, C) => `${C("fobbrl")}${r}+${C("frete")}${r}` },
    { key: "afrmm", header: "AFRMM", fmt: MONEY_BRL, group: "nac", value: (it) => it.afrmmBrl, formula: (r, C, P) => `${P("AFRMM")}*${C("pvalor")}${r}` },
    { key: "siscomex", header: "SISCOMEX", fmt: MONEY_BRL, group: "nac", value: (it) => it.siscomexBrl, formula: (r, C, P) => `${P("SISCOMEX")}*${C("pvalor")}${r}` },
    { key: "demais", header: "DEMAIS DESPESAS", fmt: MONEY_BRL, group: "nac", value: (it) => it.demaisDespesasBrl, formula: (r, C, P) => `${P("DEMAIS")}*${C("pvalor")}${r}` },
    { key: "iirate", header: "% II", fmt: PCT, group: "nac", value: (it) => it.iiRate },
    { key: "ii", header: "VALOR II", fmt: MONEY_BRL, group: "nac", value: (it) => it.iiValue, formula: (r, C) => `${C("adu")}${r}*${C("iirate")}${r}` },
    { key: "merc", header: "VALOR MERCADORIA", fmt: MONEY_BRL, group: "nac", value: (it) => it.merchandiseValue, formula: (r, C) => `${C("adu")}${r}+${C("ii")}${r}` },
    { key: "ipirate", header: "% IPI", fmt: PCT, group: "nac", value: (it) => it.ipiRate },
    { key: "ipi", header: "VALOR IPI", fmt: MONEY_BRL, group: "nac", value: (it) => it.ipiValue, formula: (r, C) => `${C("merc")}${r}*${C("ipirate")}${r}` },
    { key: "pisrate", header: "% PIS", fmt: PCT, group: "nac", value: (it) => it.pisRate },
    { key: "pis", header: "VALOR PIS-IMP", fmt: MONEY_BRL, group: "nac", value: (it) => it.pisValue, formula: (r, C) => `${C("adu")}${r}*${C("pisrate")}${r}` },
    { key: "cofinsrate", header: "% COFINS", fmt: PCT, group: "nac", value: (it) => it.cofinsRate },
    { key: "cofins", header: "VALOR COFINS-IMP", fmt: MONEY_BRL, group: "nac", value: (it) => it.cofinsValue, formula: (r, C) => `${C("adu")}${r}*${C("cofinsrate")}${r}` },
    { key: "icmsbase", header: "BASE ICMS ANTEC.", fmt: MONEY_BRL, group: "nac", value: (it) => it.icmsBase, formula: (r, C, P) => `(${C("adu")}${r}+${C("afrmm")}${r}+${C("siscomex")}${r}+${C("ii")}${r}+${C("ipi")}${r}+${C("pis")}${r}+${C("cofins")}${r})/(1-${P("GROSSUP")})` },
    { key: "icmsrate", header: "% ICMS", fmt: PCT, group: "nac", value: (it) => it.icmsClienteRate },
    { key: "icms", header: "VALOR ICMS ANTEC.", fmt: MONEY_BRL, group: "nac", value: (it) => it.icmsClienteValue, formula: (r, C) => `${C("icmsbase")}${r}*${C("icmsrate")}${r}` },
    { key: "custoantes", header: "CUSTO ANTES ASSESS.", fmt: MONEY_BRL, group: "nac", value: (it) => it.totalCostBeforeAssessoria, formula: (r, C) => `${C("adu")}${r}+${C("afrmm")}${r}+${C("siscomex")}${r}+${C("demais")}${r}+${C("ii")}${r}+${C("ipi")}${r}+${C("pis")}${r}+${C("cofins")}${r}+${C("icms")}${r}` },
    { key: "assess", header: "ASSESSORIA", fmt: MONEY_BRL, group: "nac", value: (it) => it.assessoriaValue, formula: (r, C, P) => `((${P("ROYALTIES")}*${C("pvalor")}${r})+${C("custoantes")}${r})*${P("ASSESS")}` },
    { key: "custototal", header: "CUSTO TOTAL", fmt: MONEY_BRL, group: "nac", value: (it) => it.totalCost, formula: (r, C) => `${C("custoantes")}${r}+${C("assess")}${r}` },
    { key: "custounit", header: "CUSTO UNIT.", fmt: MONEY_BRL, group: "nac", value: (it) => it.unitCost, formula: (r, C) => `${C("custototal")}${r}/${C("qtd")}${r}` },
    // ---- Importador: custo líquido + venda ----
    { key: "netimp", header: "CUSTO LÍQ. IMPORT.", fmt: MONEY_BRL, group: "imp", value: (it) => it.netImportCost, formula: (r, C) => netLiquidoFormula(r, C, opts.regime) },
    { key: "nettotal", header: "CUSTO LÍQUIDO TOTAL", fmt: MONEY_BRL, group: "imp", value: (it) => it.netTotalCost, formula: (r, C, P) => `${C("netimp")}${r}+(${P("PACOTE")}*${C("pvalor")}${r})` },
    { key: "netunit", header: "CUSTO UNIT. LIQ.", fmt: MONEY_BRL, group: "imp", value: (it) => it.netUnitCost, formula: (r, C) => `${C("nettotal")}${r}/${C("qtd")}${r}` },
    { key: "netkg", header: "CUSTO/KG LIQ.", fmt: MONEY_BRL, group: "imp", value: (it) => it.netCostPerKg },
    { key: "mkp", header: "MKP", fmt: PCT, group: "imp", value: (it) => it.markupFactor, formula: (_r, _C, P) => `${P("V_MKP")}` },
    { key: "produtos", header: "VALOR DOS PRODUTOS", fmt: MONEY_BRL, group: "imp", value: (it) => it.salePrice, formula: (r, C) => `${C("nettotal")}${r}/${C("mkp")}${r}` },
    { key: "vicmsrate", header: "% ICMS VENDA", fmt: PCT, group: "imp", value: () => icmsVendaRate, formula: (_r, _C, P) => `${P("V_ICMS")}` },
    { key: "vicms", header: "ICMS VENDA", fmt: MONEY_BRL, group: "imp", value: (it) => it.icmsVendaValue, formula: (r, C) => `${C("produtos")}${r}*${C("vicmsrate")}${r}` },
    { key: "vipi", header: "IPI VENDA", fmt: MONEY_BRL, group: "imp", value: (it) => it.ipiVendaValue, formula: (r, C) => `${C("produtos")}${r}*${C("ipirate")}${r}` },
    { key: "vst", header: "ICMS ST", fmt: MONEY_BRL, group: "imp", value: (it) => it.icmsStValue },
    { key: "vnf", header: "TOTAL NF VENDA", fmt: MONEY_BRL, group: "imp", value: (it) => it.totalInvoiceValue, formula: (r, C) => `${C("produtos")}${r}+${C("vipi")}${r}+${C("vst")}${r}` },
    { key: "vnfunit", header: "UNIT. C/ IPI+ST", fmt: MONEY_BRL, group: "imp", value: (it) => it.unitInvoiceValue, formula: (r, C) => `${C("vnf")}${r}/${C("qtd")}${r}` },
  ];
  // ---- Comprador (Lucro Real) ----
  if (hasBuyer) {
    cols.push(
      { key: "bnet", header: "CUSTO LÍQ. COMPRADOR", fmt: MONEY_BRL, group: "buyer", value: (it) => it.buyerNetCost, formula: (r, C, P) => `${C("vnf")}${r}-${C("vipi")}${r}-${C("vicms")}${r}-(${C("produtos")}${r}*${P("B_PIS")})-(${C("produtos")}${r}*${P("B_COFINS")})+(${P("ROYALTIES")}*${C("pvalor")}${r})` },
      { key: "bnetunit", header: "CUSTO UNIT. LIQ.", fmt: MONEY_BRL, group: "buyer", value: (it) => it.buyerNetUnitCost, formula: (r, C) => `${C("bnet")}${r}/${C("qtd")}${r}` },
      { key: "bmkp", header: "MKP", fmt: PCT, group: "buyer", value: (it) => it.buyerMarkupFactor, formula: (_r, _C, P) => `${P("B_MKP")}` },
      { key: "bprodutos", header: "VALOR DOS PRODUTOS", fmt: MONEY_BRL, group: "buyer", value: (it) => it.buyerSalePrice, formula: (r, C) => `${C("bnet")}${r}/${C("bmkp")}${r}` },
      { key: "bicmsrate", header: "% ICMS", fmt: PCT, group: "buyer", value: () => (s.buyer ? s.buyer.icmsVendaTotal / (s.buyer.salePriceTotal || 1) : 0.12), formula: (_r, _C, P) => `${P("B_ICMS")}` },
      { key: "bicms", header: "ICMS", fmt: MONEY_BRL, group: "buyer", value: (it) => it.buyerIcmsVendaValue, formula: (r, C) => `${C("bprodutos")}${r}*${C("bicmsrate")}${r}` },
      { key: "bipi", header: "IPI", fmt: MONEY_BRL, group: "buyer", value: (it) => it.buyerIpiVendaValue, formula: (r, C) => `${C("bprodutos")}${r}*${C("ipirate")}${r}` },
      { key: "bst", header: "ICMS ST", fmt: MONEY_BRL, group: "buyer", value: (it) => it.buyerIcmsStValue ?? 0 },
      { key: "bnf", header: "TOTAL NF VENDA", fmt: MONEY_BRL, group: "buyer", value: (it) => it.buyerTotalInvoiceValue, formula: (r, C) => `${C("bprodutos")}${r}+${C("bipi")}${r}+${C("bst")}${r}` },
      { key: "bnfunit", header: "UNIT. C/ IPI+ST", fmt: MONEY_BRL, group: "buyer", value: (it) => it.buyerUnitInvoiceValue, formula: (r, C) => `${C("bnf")}${r}/${C("qtd")}${r}` },
    );
  }

  // Mapa key→letra
  const colIndex: Record<string, number> = {};
  cols.forEach((c, i) => (colIndex[c.key] = i + 1));
  const C = (k: string) => colLetter(colIndex[k]);

  // Linhas fixas espelhando o modelo do contador.
  const BANNER_ROW = 24;
  const GRP_ROW = 25;
  const HDR_ROW = 26;
  const ITEM0 = 27;
  const GRID_TOT = ITEM0 + result.items.length; // linha de totais da grade
  const vtotalCol = C("vtotal"); // FOB total em USD (referência do bloco de params)
  const pesoCol = C("peso");

  // ---- helpers de escrita do bloco de parâmetros ----
  const label = (ref: string, text: string, opt?: { bold?: boolean; band?: boolean }) => {
    const cell = ws.getCell(ref);
    cell.value = text;
    cell.font = { size: 12, bold: opt?.bold, color: opt?.band ? { argb: COLORS.header } : undefined };
    if (opt?.band) fillCell(cell, COLORS.bandHeader);
  };
  const input = (ref: string, value: number, fmt: string) => {
    const cell = ws.getCell(ref);
    cell.value = value;
    cell.numFmt = fmt;
    fillCell(cell, COLORS.param); // amarelo = editável
    cell.border = ALL_BORDERS;
    return ref;
  };
  const calc = (ref: string, formula: string, result: number, fmt: string) => {
    const cell = ws.getCell(ref);
    cell.value = { formula, result };
    cell.numFmt = fmt;
    cell.border = ALL_BORDERS;
    return ref;
  };

  // Título do bloco
  const title = ws.getCell("B2");
  title.value = "ESTIMATIVA DE IMPORTAÇÃO";
  ws.mergeCells("B2:E2");
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.font = { bold: true, size: 24, color: { argb: COLORS.header } };
  ws.getCell("B3").value = opts.quotationName;
  ws.getCell("B3").font = { italic: true, size: 10, color: { argb: "FF888888" } };

  // ---- Bloco esquerdo: Valor Fob / Frete / Seguro / Valor ADU ----
  ["B5:Descrição", "C5:Moeda EX", "D5:Valor", "E5:Moeda R$"].forEach((s2) => {
    const [ref, txt] = s2.split(":"); label(ref, txt, { bold: true, band: true });
  });
  const fxUsd = s.exchangeRate || 1;
  label("B6", "Valor Fob"); ws.getCell("C6").value = cur;
  const FOB_REF = calc("D6", `${vtotalCol}${GRID_TOT}`, s.fobTotalFob, MONEY_USD);
  calc("E6", `D6*$H$7`, s.fobTotalBrl, MONEY_BRL);
  label("B7", "Valor Frete"); ws.getCell("C7").value = cur;
  const FRETE_USD_REF = input("D7", s.freightTotalBrl / fxUsd, MONEY_USD);
  const FRETE_BRL_REF = calc("E7", `D7*$H$7`, s.freightTotalBrl, MONEY_BRL);
  label("B8", "Seguro"); ws.getCell("C8").value = cur;
  input("D8", s.insuranceTotalBrl / fxUsd, MONEY_USD);
  calc("E8", `D8*$H$7`, s.insuranceTotalBrl, MONEY_BRL);
  label("B9", "Valor ADU", { bold: true });
  calc("D9", `SUM(D6:D8)`, s.fobTotalFob + s.freightTotalBrl / fxUsd, MONEY_USD);
  calc("E9", `SUM(E6:E8)`, s.cifTotalBrl, MONEY_BRL);

  // ---- Bloco direito: Peso / Taxa dólar / SISCOMEX / AFRMM ----
  const pesoTot = result.items.reduce((a, it) => a + (it.weightKgTotal || 0), 0);
  label("G5", "Peso Bruto"); calc("H5", `${pesoCol}${GRID_TOT}`, pesoTot, "#,##0.00");
  label("G6", "Peso Líquido"); calc("H6", `${pesoCol}${GRID_TOT}`, pesoTot, "#,##0.00");
  label("G7", "Taxa dólar"); const FX_REF = input("H7", s.exchangeRate, '"R$"\\ #,##0.0000');
  label("G8", "SISCOMEX"); const SIS_REF = input("H8", s.siscomexTotal, MONEY_BRL);
  label("G9", "AFRMM"); const AFRMM_REF = input("H9", s.afrmmTotal, MONEY_BRL);

  // ---- Demais Despesas (itemizado) ----
  const bd0 = (result as unknown as { despesasBreakdown?: {
    liberacaoBl: number; armazenagem: number; freteInterno: number; despacho: number; expediente: number;
  } }).despesasBreakdown;
  label("B12", "Demais Despesas", { bold: true, band: true });
  label("B13", "Liberação de BL"); input("E13", bd0?.liberacaoBl ?? 0, MONEY_BRL);
  label("B14", "Armazenagem"); input("E14", bd0?.armazenagem ?? 0, MONEY_BRL);
  label("B15", "Frete interno"); input("E15", bd0?.freteInterno ?? 0, MONEY_BRL);
  label("B16", "Comissão Despacho Aduaneiro"); input("E16", bd0?.despacho ?? 0, MONEY_BRL);
  label("B17", "Taxa de Expediente"); input("E17", bd0?.expediente ?? 0, MONEY_BRL);
  label("B18", "Total", { bold: true });
  const DEMAIS_REF = calc("E18", `SUM(E13:E17)`, s.demaisDespesasTotal, MONEY_BRL);

  // ---- Pacote / Royalties ----
  label("B21", "Pacote Logístico"); const PACOTE_REF = input("E21", s.pacoteLogistico, MONEY_BRL);
  label("B22", "Royalties"); const ROY_REF = input("E22", s.royaltiesTotal, MONEY_BRL);
  ws.getRow(22).hidden = true; // royalties ocultos (declarado = real)

  // ---- Parâmetros de venda/tributos (direita) ----
  label("G12", "Gross-up ICMS"); const GROSS_REF = input("H12", grossUp, PCT);
  label("G13", "Assessoria"); const ASSESS_REF = input("H13", assessRate, PCT);
  label("G14", "ICMS venda"); const VICMS_REF = input("H14", icmsVendaRate, PCT);
  label("G15", "PIS venda"); const VPIS_REF = input("H15", pisVendaRate, PCT);
  label("G16", "COFINS venda"); const VCOF_REF = input("H16", cofinsVendaRate, PCT);
  label("G17", "Margem bruta"); const VMARG_REF = input("H17", s.margemBruta, PCT);
  label("G18", "Markup"); const VMKP_REF = input("H18", s.markupFactor, PCT);

  Object.assign(PARAMS, {
    FX: "$H$7", FOB_USD: "$D$6", FRETE_BRL: "$E$7", AFRMM: "$H$9", SISCOMEX: "$H$8",
    DEMAIS: "$E$18", PACOTE: "$E$21", ROYALTIES: "$E$22", GROSSUP: "$H$12", ASSESS: "$H$13",
    V_ICMS: "$H$14", V_PIS: "$H$15", V_COFINS: "$H$16", V_MARGEM: "$H$17", V_MKP: "$H$18",
  });
  void [FOB_REF, FRETE_USD_REF, FRETE_BRL_REF, FX_REF, SIS_REF, AFRMM_REF, DEMAIS_REF, PACOTE_REF, ROY_REF,
    GROSS_REF, ASSESS_REF, VICMS_REF, VPIS_REF, VCOF_REF, VMARG_REF, VMKP_REF];

  if (hasBuyer && s.buyer) {
    label("G19", "ICMS venda compr."); input("H19", s.buyer.icmsVendaTotal / (s.buyer.salePriceTotal || 1), PCT);
    label("G20", "PIS venda compr."); input("H20", s.buyer.pisVendaTotal / (s.buyer.salePriceTotal || 1), PCT);
    label("G21", "COFINS venda compr."); input("H21", s.buyer.cofinsVendaTotal / (s.buyer.salePriceTotal || 1), PCT);
    label("G22", "Margem bruta compr."); input("H22", s.buyer.margemBruta, PCT);
    label("G23", "Markup compr."); input("H23", s.buyer.markupFactor, PCT);
    Object.assign(PARAMS, { B_ICMS: "$H$19", B_PIS: "$H$20", B_COFINS: "$H$21", B_MARGEM: "$H$22", B_MKP: "$H$23" });
  }

  // ---- Banner "CUSTO DE IMPORTAÇÃO" sobre a grade ----
  const bannerCell = ws.getRow(BANNER_ROW).getCell(1);
  bannerCell.value = "CUSTO DE IMPORTAÇÃO";
  ws.mergeCells(BANNER_ROW, 1, BANNER_ROW, cols.length);
  bannerCell.alignment = { horizontal: "center", vertical: "middle" };
  bannerCell.font = { bold: true, size: 13, color: { argb: COLORS.white } };
  fillCell(bannerCell, COLORS.header);
  ws.getRow(BANNER_ROW).height = 22;

  // ---- Cabeçalho de grupos + colunas ----
  writeGroupHeader(ws, cols, GRP_ROW, internal, hasBuyer);
  const hdr = ws.getRow(HDR_ROW);
  cols.forEach((c, i) => {
    hdr.getCell(i + 1).value = c.header;
    ws.getColumn(i + 1).width = Math.max(c.header.length * 0.72, isMoney(c.fmt) ? 14 : 9);
  });
  styleHeaderRow(hdr);
  cols.forEach((c, i) => {
    if (c.group === "buyer") fillCell(hdr.getCell(i + 1), COLORS.buyer);
  });

  // Linhas de itens
  result.items.forEach((it, idx) => {
    const r = ITEM0 + idx;
    const invRow = INV_ITEM0 + idx;
    const row = ws.getRow(r);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = c.value(it, idx);
      if (c.formula) cell.value = { formula: c.formula(r, C, P, invRow), result: (v as number) ?? 0 };
      else cell.value = v as number | string;
      if (c.fmt) cell.numFmt = c.fmt;
    });
  });

  // Linha de totais
  const TOT_ROW = ITEM0 + result.items.length;
  const totRow = ws.getRow(TOT_ROW);
  totRow.getCell(colIndex["desc"]).value = "TOTAIS";
  totRow.font = { bold: true };
  cols.forEach((c, i) => {
    if (isMoney(c.fmt)) {
      const L = colLetter(i + 1);
      totRow.getCell(i + 1).value = {
        formula: `SUM(${L}${ITEM0}:${L}${TOT_ROW - 1})`,
        result: result.items.reduce((acc, it) => acc + (Number(c.value(it, 0)) || 0), 0),
      };
      totRow.getCell(i + 1).numFmt = c.fmt;
      fillCell(totRow.getCell(i + 1), COLORS.light);
    }
  });
  ws.views = [{ state: "frozen", xSplit: 6, ySplit: HDR_ROW }];

  // ============================================================
  // ABA 3 — EST. DE CUSTO (consolidação + venda + ganho + comprador)
  // ============================================================
  buildEstSheet(wb, result, opts, {
    custoSheet: SHEET_CUSTO, totRow: TOT_ROW, C, internal, hasBuyer,
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// ============================================================
// Fórmula do custo líquido por regime (créditos recuperáveis)
// ============================================================
function netLiquidoFormula(r: number, C: (k: string) => string, regime: string): string {
  const apos = `${C("custototal")}${r}`;
  const icms = `${C("icms")}${r}`;
  const cofins = `${C("cofins")}${r}`;
  const pis = `${C("pis")}${r}`;
  const ipi = `${C("ipi")}${r}`;
  switch (regime) {
    case "lucro_real":      // PIS, COFINS, IPI e ICMS recuperáveis
      return `${apos}-${icms}-${cofins}-${pis}-${ipi}`;
    case "lucro_presumido": // só IPI e ICMS
      return `${apos}-${icms}-${ipi}`;
    default:                // simples: sem créditos
      return apos;
  }
}

// ============================================================
// Cabeçalho de grupos (faixas coloridas sobre a grade)
// ============================================================
function writeGroupHeader(ws: ExcelJS.Worksheet, cols: GridCol[], row: number, _internal: boolean, _hasBuyer: boolean) {
  const labels: Record<string, string> = {
    id: "IDENTIFICAÇÃO",
    nac: "NACIONALIZAÇÃO",
    imp: "CUSTO LÍQUIDO E VENDA DO IMPORTADOR",
    buyer: "CUSTO LÍQUIDO E VENDA DO COMPRADOR — LUCRO REAL",
  };
  let i = 0;
  while (i < cols.length) {
    const g = cols[i].group;
    let j = i;
    while (j < cols.length && cols[j].group === g) j++;
    const startCol = i + 1, endCol = j;
    const cell = ws.getRow(row).getCell(startCol);
    cell.value = labels[g];
    if (endCol > startCol) ws.mergeCells(row, startCol, row, endCol);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.font = { bold: true, size: 9, color: { argb: COLORS.white } };
    fillCell(cell, g === "buyer" ? COLORS.buyer : g === "imp" ? COLORS.accent : COLORS.header);
    i = j;
  }
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 9 };
    fillCell(cell, COLORS.header);
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  });
  row.height = 30;
}

// ============================================================
// ABA 3 — consolidação (EST. DE CUSTO)
// ============================================================
function buildEstSheet(
  wb: ExcelJS.Workbook,
  result: EngineResult,
  opts: ExcelEstimativaOptions,
  ctx: { custoSheet: string; totRow: number; C: (k: string) => string; internal: boolean; hasBuyer: boolean },
) {
  const s = result.summary;
  const est = wb.addWorksheet(SHEET_EST);
  est.getColumn(2).width = 46;
  est.getColumn(6).width = 9;
  est.getColumn(8).width = 18;
  let r = 1;
  // Referência a um total da grade CUSTO: 'SHEET'!<col><totRow>
  const refTot = (k: string) => `'${ctx.custoSheet}'!${ctx.C(k)}${ctx.totRow}`;

  const put = (label: string, value?: number, opt?: { fmt?: string; bold?: boolean; formula?: string }) => {
    const row = est.getRow(r++);
    row.getCell(2).value = label;
    if (value !== undefined || opt?.formula) {
      const cell = row.getCell(8);
      cell.value = opt?.formula ? { formula: opt.formula, result: value ?? 0 } : (value as number);
      cell.numFmt = opt?.fmt ?? MONEY;
    }
    if (opt?.bold) row.font = { bold: true };
    return row;
  };
  const section = (title: string) => {
    const row = est.getRow(r++);
    row.getCell(2).value = title;
    row.font = { bold: true, size: 11, color: { argb: COLORS.header } };
    fillCell(row.getCell(2), COLORS.section);
  };

  put(`ESTIMATIVA DE CUSTO — IMPORTAÇÃO PRÓPRIA — ${opts.quotationName}`, undefined, { bold: true });
  if (opts.clientName) put(`Cliente: ${opts.clientName}`);
  if (opts.supplierName) put(`Fornecedor: ${opts.supplierName}${opts.originCountry ? ` (${opts.originCountry})` : ""}`);
  put(`Câmbio: ${s.exchangeRate.toFixed(4)}  ·  Regime: ${regimeLabel(opts.regime)}`);
  r++;

  // ---- PREÇO FINAL POR ITEM (segregado, em destaque no topo) ----
  // Larguras das colunas usadas pela tabela por item.
  [[3, 9], [4, 7], [5, 16], [6, 15], [7, 14]].forEach(([col, w]) => (est.getColumn(col).width = w));
  section("PREÇO FINAL POR ITEM — custo nacionalizado líquido");
  const itemHdr = est.getRow(r++);
  ([[2, "Item"], [3, "Qtd"], [4, "Un."], [5, "Custo líq. total"], [6, "Custo / unid."], [7, "Custo / kg"]] as [number, string][])
    .forEach(([col, label]) => {
      const cell = itemHdr.getCell(col);
      cell.value = label;
      cell.font = { bold: true, size: 10, color: { argb: COLORS.header } };
      fillCell(cell, COLORS.section);
    });
  result.items.forEach((it) => {
    const row = est.getRow(r++);
    row.getCell(2).value = it.description;
    row.getCell(3).value = it.quantity;
    row.getCell(4).value = it.unit;
    const cTot = row.getCell(5); cTot.value = it.netTotalCost; cTot.numFmt = MONEY; cTot.font = { bold: true };
    const cUn = row.getCell(6); cUn.value = it.netUnitCost; cUn.numFmt = MONEY; cUn.font = { bold: true };
    if (it.netCostPerKg > 0) { const cKg = row.getCell(7); cKg.value = it.netCostPerKg; cKg.numFmt = MONEY; }
  });
  if (result.items.length > 1) {
    const totRow = est.getRow(r++);
    totRow.getCell(2).value = "TOTAL";
    totRow.getCell(5).value = result.items.reduce((a, it) => a + it.netTotalCost, 0);
    totRow.getCell(5).numFmt = MONEY;
    totRow.font = { bold: true };
  }
  r++;

  section("VALOR ADUANEIRO");
  put("Valor FOB", s.fobTotalBrl, { formula: refTot("fobbrl") });
  put("Frete Internacional", s.freightTotalBrl, { formula: refTot("frete") });
  put("Seguro", s.insuranceTotalBrl);
  put("Total — Valor CIF", s.cifTotalBrl, { bold: true });
  r++;

  section("TRIBUTOS DE NACIONALIZAÇÃO");
  put("I.I.", s.iiTotal, { formula: refTot("ii") });
  put("IPI-Imp.", s.ipiTotal, { formula: refTot("ipi") });
  put("PIS-Imp.", s.pisTotal, { formula: refTot("pis") });
  put("COFINS-Imp.", s.cofinsTotal, { formula: refTot("cofins") });
  put("ICMS Antecipado", s.icmsClienteTotal, { formula: refTot("icms") });
  put("Taxa Siscomex", s.siscomexTotal);
  put("Total Tributos", s.taxesTotal, { bold: true });
  if (ctx.internal && Math.abs(s.ganhoBeneficioIcmsTotal) > 0.005) {
    put("→ Ganho do benefício de ICMS (interno)", s.ganhoBeneficioIcmsTotal, { bold: true });
  }
  r++;

  section("CUSTOS ADUANEIROS");
  // Itemiza as "Demais Despesas" quando há quebra (porto/despachante); senão, linha única.
  const bd = (result as unknown as { despesasBreakdown?: {
    liberacaoBl: number; armazenagem: number; freteInterno: number;
    despacho: number; expediente: number; portoCode: string | null;
  } }).despesasBreakdown;
  if (bd) {
    put(`Armazenagem${bd.portoCode ? ` (${bd.portoCode})` : ""}`, bd.armazenagem);
    put("Liberação de BL", bd.liberacaoBl);
    put("Frete interno", bd.freteInterno);
    put("Comissão Despacho Aduaneiro", bd.despacho);
    put("Taxa de Expediente", bd.expediente);
  } else {
    put("Demais despesas (BL, armazenagem, frete interno, despacho)", s.demaisDespesasTotal, { formula: refTot("demais") });
  }
  put("AFRMM", s.afrmmTotal, { formula: refTot("afrmm") });
  put("Total", s.customsCostsTotal, { bold: true });
  r++;

  section("NF-e DE NACIONALIZAÇÃO");
  put("Produto (CIF)", s.nfeProduto);
  put("I.I.", s.nfeIi);
  put("IPI", s.nfeIpi);
  put("Outras Despesas (PIS+COFINS+ICMS+Siscomex+AFRMM)", s.nfeOutrasDespesas);
  put("NF-e Nacionalização", s.nfeNacionalizacao, { bold: true });
  r++;

  section("CUSTO LÍQUIDO DO IMPORTADOR");
  put("Tributos recuperáveis (créditos)", s.recoverableCreditsTotal);
  put("Pacote logístico", s.pacoteLogistico);
  put("Assessoria", s.assessoriaTotal, { formula: refTot("assess") });
  put("Custo Líquido Total", s.netCostTotal, { formula: refTot("nettotal"), bold: true });
  r++;

  // CONSUMO PRÓPRIO: não há revenda — o entregável é o custo nacionalizado.
  if (s.finalidade === "consumo_proprio") {
    section("IMPORTAÇÃO PARA CONSUMO PRÓPRIO");
    put("Custo nacionalizado (sem revenda, tributos viram custo)", s.netCostTotal, { formula: refTot("nettotal"), bold: true });
    put("Custo unitário médio", result.items.length ? s.netCostTotal / result.items.reduce((a, i) => a + i.quantity, 0) : 0);
    const warns0 = [...result.warnings, ...((result as { ncmWarnings?: string[] }).ncmWarnings ?? [])];
    if (warns0.length) {
      r++;
      section("AVISOS");
      warns0.forEach((w) => put(`• ${w}`));
    }
    return;
  }

  section("ESTIMATIVA DE VENDA DO IMPORTADOR");
  put("Margem bruta (lucro / (1 − IRPJ − CSLL))", s.margemBruta, { fmt: PCT });
  put("Fator markup", s.markupFactor, { fmt: PCT });
  put("Valor dos Produtos", s.salePriceTotal, { formula: refTot("produtos"), bold: true });
  put("ICMS venda", s.icmsVendaTotal, { formula: refTot("vicms") });
  put("IPI venda", s.ipiVendaTotal, { formula: refTot("vipi") });
  put("ICMS ST", s.icmsStTotal);
  put("VALOR TOTAL DA VENDA", s.totalSaleInvoice, { formula: refTot("vnf"), bold: true });
  put("Lucro desejado (R$)", s.lucroDesejadoValor);
  put("IRPJ", s.irpjValor);
  put("CSLL", s.csllValor);
  r++;

  section("GANHO DA OPERAÇÃO");
  put("Margem da venda", s.ganho.margemVenda);
  if (s.royaltiesTotal > 0) put("Margem de royalties", s.ganho.margemRoyalties);
  if (ctx.internal) put("Ganho do benefício de ICMS", s.ganho.ganhoIcms);
  put("Ganho total da operação", s.ganho.total, { bold: true });

  if (ctx.hasBuyer && s.buyer) {
    r++;
    section("CUSTO LÍQUIDO DO COMPRADOR — LUCRO REAL");
    put("Custo Líquido do Comprador", s.buyer.netCostTotal, { formula: refTot("bnet"), bold: true });
    r++;
    section("ESTIMATIVA DE VENDA DO COMPRADOR — LUCRO REAL");
    put("Margem bruta", s.buyer.margemBruta, { fmt: PCT });
    put("Fator markup", s.buyer.markupFactor, { fmt: PCT });
    put("Valor dos Produtos", s.buyer.salePriceTotal, { formula: refTot("bprodutos"), bold: true });
    put("ICMS venda", s.buyer.icmsVendaTotal, { formula: refTot("bicms") });
    put("IPI venda", s.buyer.ipiVendaTotal, { formula: refTot("bipi") });
    put("ICMS ST", s.buyer.icmsStTotal);
    put("VALOR TOTAL DA VENDA", s.buyer.totalSaleInvoice, { formula: refTot("bnf"), bold: true });
    put("Lucro desejado (R$)", s.buyer.lucroDesejadoValor);
    put("IRPJ", s.buyer.irpjValor);
    put("CSLL", s.buyer.csllValor);
  }

  const warns = [...result.warnings, ...((result as { ncmWarnings?: string[] }).ncmWarnings ?? [])];
  if (warns.length) {
    r++;
    section("AVISOS");
    warns.forEach((w) => put(`• ${w}`));
  }
}
