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
  param: "FFFFF9C4",    // amarelo (células editáveis)
  white: "FFFFFFFF",
  section: "FFEDE7F6",
};
const MONEY = "#,##0.00";
const PCT = "0.00%";

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
  // ABA 1 — INVOICE (com royalties zerados: declarado = real)
  // ============================================================
  const inv = wb.addWorksheet(SHEET_INVOICE);
  inv.addRow([`INVOICE / PACKING LIST — ${opts.quotationName}`]);
  styleTitle(inv.getRow(1));
  inv.addRow([]);
  const INV_HDR = 3;
  const INV_ITEM0 = 4; // primeira linha de item
  const invCols = [
    "Description", "Size", "G.W (kg)", `Q'ty/Unit`, `Unit price (${cur})`, "Amount",
    "Unit price dec.", "Amount dec.", "Royalties Un.", "Royalties Total", "NCM",
  ];
  const invHdr = inv.getRow(INV_HDR);
  invCols.forEach((h, i) => (invHdr.getCell(i + 1).value = h));
  styleHeaderRow(invHdr);
  result.items.forEach((it, i) => {
    const r = INV_ITEM0 + i;
    const row = inv.getRow(r);
    row.getCell(1).value = it.description;                 // A Description
    row.getCell(2).value = "";                             // B Size
    row.getCell(3).value = 0;                              // C G.W
    row.getCell(4).value = it.quantity;                    // D Q'ty
    row.getCell(5).value = it.unitPriceFob;                // E Unit price (real)
    row.getCell(6).value = { formula: `D${r}*E${r}`, result: it.totalFob }; // F Amount
    row.getCell(7).value = { formula: `E${r}`, result: it.unitPriceFob };   // G Unit price dec. = real (sem subfaturamento)
    row.getCell(8).value = { formula: `D${r}*G${r}`, result: it.totalFob }; // H Amount dec.
    row.getCell(9).value = { formula: `IF(E${r}>G${r},E${r}-G${r},0)`, result: 0 }; // I Royalties Un. = 0
    row.getCell(10).value = { formula: `D${r}*I${r}`, result: 0 };          // J Royalties Total = 0
    row.getCell(11).value = it.ncm;                        // K NCM
    [6, 8].forEach((c) => (row.getCell(c).numFmt = MONEY));
    [5, 7, 9].forEach((c) => (row.getCell(c).numFmt = MONEY));
  });
  const invTotR = INV_ITEM0 + result.items.length;
  const invTot = inv.getRow(invTotR);
  invTot.getCell(1).value = "TOTAL";
  invTot.getCell(4).value = { formula: `SUM(D${INV_ITEM0}:D${invTotR - 1})`, result: result.items.reduce((a, i) => a + i.quantity, 0) };
  invTot.getCell(6).value = { formula: `SUM(F${INV_ITEM0}:F${invTotR - 1})`, result: s.fobTotalFob };
  invTot.getCell(10).value = { formula: `SUM(J${INV_ITEM0}:J${invTotR - 1})`, result: 0 };
  invTot.font = { bold: true };
  invTot.getCell(6).numFmt = MONEY;
  [34, 14, 9, 10, 14, 14, 14, 14, 12, 12, 13].forEach((w, i) => (inv.getColumn(i + 1).width = w));
  // Colunas de royalties ocultas (I=Royalties Un., J=Royalties Total).
  inv.getColumn(9).hidden = true;
  inv.getColumn(10).hidden = true;

  // ============================================================
  // ABA 2 — CUSTO MERCADORIA (params + grade por item)
  // ============================================================
  const ws = wb.addWorksheet(SHEET_CUSTO);
  ws.getRow(1).getCell(2).value = `CUSTO DA MERCADORIA — IMPORTAÇÃO PRÓPRIA — ${opts.quotationName}`;
  styleTitle(ws.getRow(1));

  // ---- Bloco de PARÂMETROS (editável; referenciado por $) ----
  // Coluna B = rótulo, C = valor. Linhas fixas para referência estável.
  const it0 = result.items[0];
  const grossUp = it0 && it0.icmsBase > 0
    ? 1 - (it0.customsValueBrl + it0.afrmmBrl + it0.siscomexBrl + it0.iiValue + it0.ipiValue + it0.pisValue + it0.cofinsValue) / it0.icmsBase
    : 0.04;
  const assessRate = it0 && it0.totalCostBeforeAssessoria > 0 ? it0.assessoriaValue / (s.royaltiesTotal * it0.shareOfValue + it0.totalCostBeforeAssessoria) : 0;
  const icmsVendaRate = s.salePriceTotal > 0 ? s.icmsVendaTotal / s.salePriceTotal : 0.04;
  const pisVendaRate = s.salePriceTotal > 0 ? s.pisVendaTotal / s.salePriceTotal : 0.0165;
  const cofinsVendaRate = s.salePriceTotal > 0 ? s.cofinsVendaTotal / s.salePriceTotal : 0.076;

  const PARAMS: Record<string, number> = {};
  const paramDefs: Array<[string, string, number, string]> = [
    ["FX", "Taxa de câmbio (USD→BRL)", s.exchangeRate, "0.0000"],
    ["FOB_USD", `Valor FOB total (${cur})`, s.fobTotalFob, MONEY],
    ["FRETE_BRL", "Frete internacional R$", s.freightTotalBrl, MONEY],
    ["AFRMM", "AFRMM R$", s.afrmmTotal, MONEY],
    ["SISCOMEX", "Taxa Siscomex R$", s.siscomexTotal, MONEY],
    ["DEMAIS", "Demais despesas R$", s.demaisDespesasTotal, MONEY],
    ["PACOTE", "Pacote logístico R$", s.pacoteLogistico, MONEY],
    ["ROYALTIES", "Royalties R$", s.royaltiesTotal, MONEY],
    ["GROSSUP", "Gross-up ICMS (Res. 13/2012)", grossUp, PCT],
    ["ASSESS", "Taxa de assessoria", assessRate, PCT],
    ["V_ICMS", "ICMS venda importador", icmsVendaRate, PCT],
    ["V_PIS", "PIS venda importador", pisVendaRate, PCT],
    ["V_COFINS", "COFINS venda importador", cofinsVendaRate, PCT],
    ["V_MARGEM", "Margem bruta importador", s.margemBruta, PCT],
    ["V_MKP", "Fator markup importador", s.markupFactor, PCT],
  ];
  if (hasBuyer && s.buyer) {
    paramDefs.push(
      ["B_ICMS", "ICMS venda comprador", s.buyer.icmsVendaTotal / (s.buyer.salePriceTotal || 1), PCT],
      ["B_PIS", "PIS venda comprador", s.buyer.pisVendaTotal / (s.buyer.salePriceTotal || 1), PCT],
      ["B_COFINS", "COFINS venda comprador", s.buyer.cofinsVendaTotal / (s.buyer.salePriceTotal || 1), PCT],
      ["B_MARGEM", "Margem bruta comprador", s.buyer.margemBruta, PCT],
      ["B_MKP", "Fator markup comprador", s.buyer.markupFactor, PCT],
    );
  }
  const PARAM_ROW0 = 3;
  paramDefs.forEach(([key, label, value, fmt], i) => {
    const r = PARAM_ROW0 + i;
    PARAMS[key] = r;
    const row = ws.getRow(r);
    row.getCell(2).value = label;
    const cell = row.getCell(3);
    cell.value = value;
    cell.numFmt = fmt;
    fillCell(cell, COLORS.param);
  });
  // Royalties ocultos (declarado = real; sem subfaturamento). A célula permanece
  // para as fórmulas que a referenciam (assessoria/comprador), mas a linha some.
  if (PARAMS["ROYALTIES"]) ws.getRow(PARAMS["ROYALTIES"]).hidden = true;
  const P = (k: string) => `$C$${PARAMS[k]}`;

  // ---- Definição das colunas da grade ----
  const cols: GridCol[] = [
    { key: "item", header: "ITEM", group: "id", value: (_it, i) => i + 1 },
    { key: "codigo", header: "CÓDIGO", group: "id", value: (it) => it.ncm },
    { key: "qtd", header: "QUANTIDADE", group: "id", value: (it) => it.quantity, formula: (_r, _C, _P, inv) => `INVOICE!D${inv}` },
    { key: "un", header: "UN.", group: "id", value: (it) => it.unit },
    { key: "desc", header: "DESCRIÇÃO", group: "id", value: (it) => it.description, formula: (_r, _C, _P, inv) => `INVOICE!A${inv}` },
    { key: "ncm", header: "NCM", group: "id", value: (it) => it.ncm, formula: (_r, _C, _P, inv) => `INVOICE!K${inv}` },
    { key: "vunit", header: "VALOR UNITÁRIO", fmt: MONEY, group: "nac", value: (it) => it.unitPriceFob, formula: (_r, _C, _P, inv) => `INVOICE!G${inv}` },
    { key: "vtotal", header: "VALOR TOTAL", fmt: MONEY, group: "nac", value: (it) => it.totalFob, formula: (r, C) => `${C("qtd")}${r}*${C("vunit")}${r}` },
    { key: "peso", header: "PESO", fmt: MONEY, group: "nac", value: () => 0 },
    { key: "pvalor", header: "% VALOR", fmt: PCT, group: "nac", value: (it) => it.shareOfValue, formula: (r, C, P) => `${C("vtotal")}${r}/${P("FOB_USD")}` },
    { key: "fobbrl", header: "VALOR FOB R$", fmt: MONEY, group: "nac", value: (it) => it.fobBrl, formula: (r, C, P) => `${C("vtotal")}${r}*${P("FX")}` },
    { key: "frete", header: "FRETE", fmt: MONEY, group: "nac", value: (it) => it.freightBrl, formula: (r, C, P) => `${P("FRETE_BRL")}*${C("pvalor")}${r}` },
    { key: "adu", header: "VLR ADUANEIRO R$", fmt: MONEY, group: "nac", value: (it) => it.customsValueBrl, formula: (r, C) => `${C("fobbrl")}${r}+${C("frete")}${r}` },
    { key: "afrmm", header: "AFRMM", fmt: MONEY, group: "nac", value: (it) => it.afrmmBrl, formula: (r, C, P) => `${P("AFRMM")}*${C("pvalor")}${r}` },
    { key: "siscomex", header: "SISCOMEX", fmt: MONEY, group: "nac", value: (it) => it.siscomexBrl, formula: (r, C, P) => `${P("SISCOMEX")}*${C("pvalor")}${r}` },
    { key: "demais", header: "DEMAIS DESPESAS", fmt: MONEY, group: "nac", value: (it) => it.demaisDespesasBrl, formula: (r, C, P) => `${P("DEMAIS")}*${C("pvalor")}${r}` },
    { key: "iirate", header: "% II", fmt: PCT, group: "nac", value: (it) => it.iiRate },
    { key: "ii", header: "VALOR II", fmt: MONEY, group: "nac", value: (it) => it.iiValue, formula: (r, C) => `${C("adu")}${r}*${C("iirate")}${r}` },
    { key: "merc", header: "VALOR MERCADORIA", fmt: MONEY, group: "nac", value: (it) => it.merchandiseValue, formula: (r, C) => `${C("adu")}${r}+${C("ii")}${r}` },
    { key: "ipirate", header: "% IPI", fmt: PCT, group: "nac", value: (it) => it.ipiRate },
    { key: "ipi", header: "VALOR IPI", fmt: MONEY, group: "nac", value: (it) => it.ipiValue, formula: (r, C) => `${C("merc")}${r}*${C("ipirate")}${r}` },
    { key: "pisrate", header: "% PIS", fmt: PCT, group: "nac", value: (it) => it.pisRate },
    { key: "pis", header: "VALOR PIS-IMP", fmt: MONEY, group: "nac", value: (it) => it.pisValue, formula: (r, C) => `${C("adu")}${r}*${C("pisrate")}${r}` },
    { key: "cofinsrate", header: "% COFINS", fmt: PCT, group: "nac", value: (it) => it.cofinsRate },
    { key: "cofins", header: "VALOR COFINS-IMP", fmt: MONEY, group: "nac", value: (it) => it.cofinsValue, formula: (r, C) => `${C("adu")}${r}*${C("cofinsrate")}${r}` },
    { key: "icmsbase", header: "BASE ICMS ANTEC.", fmt: MONEY, group: "nac", value: (it) => it.icmsBase, formula: (r, C, P) => `(${C("adu")}${r}+${C("afrmm")}${r}+${C("siscomex")}${r}+${C("ii")}${r}+${C("ipi")}${r}+${C("pis")}${r}+${C("cofins")}${r})/(1-${P("GROSSUP")})` },
    { key: "icmsrate", header: "% ICMS", fmt: PCT, group: "nac", value: (it) => it.icmsClienteRate },
    { key: "icms", header: "VALOR ICMS ANTEC.", fmt: MONEY, group: "nac", value: (it) => it.icmsClienteValue, formula: (r, C) => `${C("icmsbase")}${r}*${C("icmsrate")}${r}` },
    { key: "custoantes", header: "CUSTO ANTES ASSESS.", fmt: MONEY, group: "nac", value: (it) => it.totalCostBeforeAssessoria, formula: (r, C) => `${C("adu")}${r}+${C("afrmm")}${r}+${C("siscomex")}${r}+${C("demais")}${r}+${C("ii")}${r}+${C("ipi")}${r}+${C("pis")}${r}+${C("cofins")}${r}+${C("icms")}${r}` },
    { key: "assess", header: "ASSESSORIA", fmt: MONEY, group: "nac", value: (it) => it.assessoriaValue, formula: (r, C, P) => `((${P("ROYALTIES")}*${C("pvalor")}${r})+${C("custoantes")}${r})*${P("ASSESS")}` },
    { key: "custototal", header: "CUSTO TOTAL", fmt: MONEY, group: "nac", value: (it) => it.totalCost, formula: (r, C) => `${C("custoantes")}${r}+${C("assess")}${r}` },
    { key: "custounit", header: "CUSTO UNIT.", fmt: MONEY, group: "nac", value: (it) => it.unitCost, formula: (r, C) => `${C("custototal")}${r}/${C("qtd")}${r}` },
    // ---- Importador: custo líquido + venda ----
    { key: "netimp", header: "CUSTO LÍQ. IMPORT.", fmt: MONEY, group: "imp", value: (it) => it.netImportCost, formula: (r, C) => netLiquidoFormula(r, C, opts.regime) },
    { key: "nettotal", header: "CUSTO LÍQUIDO TOTAL", fmt: MONEY, group: "imp", value: (it) => it.netTotalCost, formula: (r, C, P) => `${C("netimp")}${r}+(${P("PACOTE")}*${C("pvalor")}${r})` },
    { key: "netunit", header: "CUSTO UNIT. LIQ.", fmt: MONEY, group: "imp", value: (it) => it.netUnitCost, formula: (r, C) => `${C("nettotal")}${r}/${C("qtd")}${r}` },
    { key: "netkg", header: "CUSTO/KG LIQ.", fmt: MONEY, group: "imp", value: (it) => it.netCostPerKg },
    { key: "mkp", header: "MKP", fmt: PCT, group: "imp", value: (it) => it.markupFactor, formula: (_r, _C, P) => `${P("V_MKP")}` },
    { key: "produtos", header: "VALOR DOS PRODUTOS", fmt: MONEY, group: "imp", value: (it) => it.salePrice, formula: (r, C) => `${C("nettotal")}${r}/${C("mkp")}${r}` },
    { key: "vicmsrate", header: "% ICMS VENDA", fmt: PCT, group: "imp", value: () => icmsVendaRate, formula: (_r, _C, P) => `${P("V_ICMS")}` },
    { key: "vicms", header: "ICMS VENDA", fmt: MONEY, group: "imp", value: (it) => it.icmsVendaValue, formula: (r, C) => `${C("produtos")}${r}*${C("vicmsrate")}${r}` },
    { key: "vipi", header: "IPI VENDA", fmt: MONEY, group: "imp", value: (it) => it.ipiVendaValue, formula: (r, C) => `${C("produtos")}${r}*${C("ipirate")}${r}` },
    { key: "vst", header: "ICMS ST", fmt: MONEY, group: "imp", value: (it) => it.icmsStValue },
    { key: "vnf", header: "TOTAL NF VENDA", fmt: MONEY, group: "imp", value: (it) => it.totalInvoiceValue, formula: (r, C) => `${C("produtos")}${r}+${C("vipi")}${r}+${C("vst")}${r}` },
    { key: "vnfunit", header: "UNIT. C/ IPI+ST", fmt: MONEY, group: "imp", value: (it) => it.unitInvoiceValue, formula: (r, C) => `${C("vnf")}${r}/${C("qtd")}${r}` },
  ];
  // ---- Comprador (Lucro Real) ----
  if (hasBuyer) {
    cols.push(
      { key: "bnet", header: "CUSTO LÍQ. COMPRADOR", fmt: MONEY, group: "buyer", value: (it) => it.buyerNetCost, formula: (r, C, P) => `${C("vnf")}${r}-${C("vipi")}${r}-${C("vicms")}${r}-(${C("produtos")}${r}*${P("B_PIS")})-(${C("produtos")}${r}*${P("B_COFINS")})+(${P("ROYALTIES")}*${C("pvalor")}${r})` },
      { key: "bnetunit", header: "CUSTO UNIT. LIQ.", fmt: MONEY, group: "buyer", value: (it) => it.buyerNetUnitCost, formula: (r, C) => `${C("bnet")}${r}/${C("qtd")}${r}` },
      { key: "bmkp", header: "MKP", fmt: PCT, group: "buyer", value: (it) => it.buyerMarkupFactor, formula: (_r, _C, P) => `${P("B_MKP")}` },
      { key: "bprodutos", header: "VALOR DOS PRODUTOS", fmt: MONEY, group: "buyer", value: (it) => it.buyerSalePrice, formula: (r, C) => `${C("bnet")}${r}/${C("bmkp")}${r}` },
      { key: "bicmsrate", header: "% ICMS", fmt: PCT, group: "buyer", value: () => (s.buyer ? s.buyer.icmsVendaTotal / (s.buyer.salePriceTotal || 1) : 0.12), formula: (_r, _C, P) => `${P("B_ICMS")}` },
      { key: "bicms", header: "ICMS", fmt: MONEY, group: "buyer", value: (it) => it.buyerIcmsVendaValue, formula: (r, C) => `${C("bprodutos")}${r}*${C("bicmsrate")}${r}` },
      { key: "bipi", header: "IPI", fmt: MONEY, group: "buyer", value: (it) => it.buyerIpiVendaValue, formula: (r, C) => `${C("bprodutos")}${r}*${C("ipirate")}${r}` },
      { key: "bst", header: "ICMS ST", fmt: MONEY, group: "buyer", value: (it) => it.buyerIcmsStValue ?? 0 },
      { key: "bnf", header: "TOTAL NF VENDA", fmt: MONEY, group: "buyer", value: (it) => it.buyerTotalInvoiceValue, formula: (r, C) => `${C("bprodutos")}${r}+${C("bipi")}${r}+${C("bst")}${r}` },
      { key: "bnfunit", header: "UNIT. C/ IPI+ST", fmt: MONEY, group: "buyer", value: (it) => it.buyerUnitInvoiceValue, formula: (r, C) => `${C("bnf")}${r}/${C("qtd")}${r}` },
    );
  }

  // Mapa key→letra
  const colIndex: Record<string, number> = {};
  cols.forEach((c, i) => (colIndex[c.key] = i + 1));
  const C = (k: string) => colLetter(colIndex[k]);

  // Cabeçalho de grupos (linha acima do header de colunas)
  const GRP_ROW = PARAM_ROW0 + paramDefs.length + 1;
  const HDR_ROW = GRP_ROW + 1;
  const ITEM0 = HDR_ROW + 1;
  writeGroupHeader(ws, cols, GRP_ROW, internal, hasBuyer);

  const hdr = ws.getRow(HDR_ROW);
  cols.forEach((c, i) => {
    hdr.getCell(i + 1).value = c.header;
    ws.getColumn(i + 1).width = Math.max(c.header.length * 0.7, c.fmt === MONEY ? 13 : 9);
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
    if (c.fmt === MONEY) {
      const L = colLetter(i + 1);
      totRow.getCell(i + 1).value = {
        formula: `SUM(${L}${ITEM0}:${L}${TOT_ROW - 1})`,
        result: result.items.reduce((acc, it) => acc + (Number(c.value(it, 0)) || 0), 0),
      };
      totRow.getCell(i + 1).numFmt = MONEY;
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
  put("Demais despesas (BL, armazenagem, frete interno, despacho)", s.demaisDespesasTotal, { formula: refTot("demais") });
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
