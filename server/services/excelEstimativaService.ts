/**
 * Excel Estimativa Service — gera a pasta de trabalho no layout da planilha
 * de referência do contador, com FÓRMULAS VIVAS: o destinatário pode alterar
 * câmbio, FOB, alíquotas ou despesas e tudo recalcula no próprio Excel.
 *
 * Abas:
 *  1. INVOICE                          — lista de itens da fatura
 *  2. CUSTO MERCADORIA - IMP. PRÓPRIA  — cálculo por item (rateio % valor)
 *  3. EST. DE CUSTO - IMP. PRÓPRIA     — consolidação, NF-e e estimativa de venda
 *
 * Modos:
 *  - "internal": inclui colunas ICMS EFETIVO (TTD) e GANHO BENEFÍCIO —
 *    visão da trading. NÃO enviar ao cliente.
 *  - "client": expõe apenas o ICMS negociado, sem revelar o spread.
 */
import ExcelJS from "exceljs";
import type { EngineResult, EngineItemResult } from "./importCostEngine";

const SHEET_CUSTO = "CUSTO MERCADORIA - IMP. PRÓPRIA";
const COLORS = {
  header: "FF311260",   // roxo SUPPLEY
  accent: "FF28E7C5",   // turquesa
  light: "FFF3F4F6",
  white: "FFFFFFFF",
  internal: "FFFFF9C4", // amarelo p/ colunas internas
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

interface ColDef {
  header: string;
  width: number;
  fmt?: string;
  internalOnly?: boolean;
  /** Fórmula Excel para a linha do item (r = nº da linha) */
  formula?: (r: number) => string;
  /** Valor calculado pelo motor (resultado exibido junto à fórmula) */
  value: (it: EngineItemResult) => number | string;
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

  // ============================================================
  // ABA 1 — INVOICE
  // ============================================================
  const inv = wb.addWorksheet("INVOICE");
  inv.addRow([`INVOICE / PACKING LIST — ${opts.quotationName}`]);
  styleTitle(inv.getRow(1));
  inv.addRow([]);
  const invHdr = inv.addRow(["Item", "Descrição", "NCM", "Qtd", "Un", `Preço Unit (${opts.currency ?? "USD"})`, "Total"]);
  styleHeader(invHdr);
  result.items.forEach((it, i) => {
    const r = inv.addRow([i + 1, it.description, it.ncm, it.quantity, it.unit, it.unitPriceFob, it.totalFob]);
    r.getCell(6).numFmt = MONEY;
    r.getCell(7).numFmt = MONEY;
  });
  const invTot = inv.addRow(["", "TOTAL", "", sumQty(result.items), "", "", s.fobTotalFob]);
  invTot.font = { bold: true };
  invTot.getCell(7).numFmt = MONEY;
  [6, 40, 12, 10, 6, 16, 16].forEach((w, i) => (inv.getColumn(i + 1).width = w));

  // ============================================================
  // ABA 2 — CUSTO MERCADORIA (cálculo por item com fórmulas)
  // ============================================================
  const ws = wb.addWorksheet(SHEET_CUSTO);

  // ---- Bloco de parâmetros (editável; tudo referenciado por $) ----
  ws.addRow([`ESTIMATIVA DE IMPORTAÇÃO — ${opts.quotationName}`]);
  styleTitle(ws.getRow(1));
  const params: Array<[string, number | string, string?]> = [
    ["Taxa de câmbio", s.exchangeRate],                            // D3
    [`Valor FOB total (${opts.currency ?? "USD"})`, s.fobTotalFob, MONEY], // D4
    ["Frete internacional R$", s.freightTotalBrl, MONEY],          // D5
    ["Seguro R$", s.insuranceTotalBrl, MONEY],                     // D6
    ["AFRMM R$", s.afrmmTotal, MONEY],                             // D7
    ["Taxa Siscomex R$", s.siscomexTotal, MONEY],                  // D8
    ["Demais despesas R$", s.demaisDespesasTotal, MONEY],          // D9
    ["Royalties R$", s.royaltiesTotal, MONEY],                     // D10
    ["Pacote logístico R$", s.pacoteLogistico, MONEY],             // D11
    ["Gross-up ICMS (Res. 13/2012)", grossUpFromResult(result), PCT],   // D12
    ["ICMS antecipado efetivo (TTD 409)", result.items[0]?.icmsRate ?? 0.026, PCT], // D13
    ["ICMS negociado c/ cliente", result.items[0]?.icmsClienteRate ?? 0.026, PCT],  // D14
    ["Taxa de assessoria", assessoriaRateFromResult(result), PCT], // D15
  ];
  params.forEach(([label, value, fmt], i) => {
    const row = ws.getRow(3 + i);
    row.getCell(2).value = label as string;
    row.getCell(4).value = value as number;
    if (fmt) row.getCell(4).numFmt = fmt;
    row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.light } };
  });
  // Parâmetros de venda (F/G)
  const vendaParams: Array<[string, number, string]> = [
    ["ICMS venda", s.icmsVendaTotal / (s.salePriceTotal || 1), PCT],   // G3
    ["PIS venda", s.pisVendaTotal / (s.salePriceTotal || 1), PCT],     // G4
    ["COFINS venda", s.cofinsVendaTotal / (s.salePriceTotal || 1), PCT], // G5
    ["Lucro desejado", s.lucroDesejadoValor / (s.salePriceTotal || 1), PCT], // G6
    ["IRPJ", 0.25, PCT],                                               // G7
    ["CSLL", 0.09, PCT],                                               // G8
  ];
  vendaParams.forEach(([label, value, fmt], i) => {
    const row = ws.getRow(3 + i);
    row.getCell(6).value = label;
    row.getCell(7).value = value;
    row.getCell(7).numFmt = fmt;
    row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.light } };
  });
  // Margem bruta e fator (fórmulas)
  ws.getCell("F9").value = "Margem bruta";
  ws.getCell("G9").value = { formula: "G6/(1-(G7+G8))", result: s.margemBruta };
  ws.getCell("G9").numFmt = PCT;
  ws.getCell("F10").value = "Fator markup";
  ws.getCell("G10").value = { formula: "1-(G3+G4+G5+G9)", result: s.markupFactor };
  ws.getCell("G10").numFmt = PCT;
  ws.getCell("F11").value = "Regime";
  ws.getCell("G11").value = regimeLabel(opts.regime);

  // ---- Tabela de itens ----
  const HDR_ROW = 18;
  const cols: ColDef[] = [
    { header: "ITEM", width: 6, value: () => "" },
    { header: "DESCRIÇÃO", width: 34, value: (it) => it.description },
    { header: "NCM", width: 12, value: (it) => it.ncm },
    { header: "QTD", width: 9, value: (it) => it.quantity },
    { header: "UN", width: 6, value: (it) => it.unit },
    { header: "PREÇO UNIT FOB", width: 13, fmt: MONEY, value: (it) => it.unitPriceFob },
    { header: "TOTAL FOB", width: 13, fmt: MONEY, formula: (r) => `D${r}*F${r}`, value: (it) => it.totalFob },
    { header: "% VALOR", width: 10, fmt: PCT, formula: (r) => `G${r}/$D$4`, value: (it) => it.shareOfValue },
    { header: "FOB R$", width: 13, fmt: MONEY, formula: (r) => `G${r}*$D$3`, value: (it) => it.fobBrl },
    { header: "FRETE R$", width: 13, fmt: MONEY, formula: (r) => `$D$5*H${r}`, value: (it) => it.freightBrl },
    { header: "SEGURO R$", width: 11, fmt: MONEY, formula: (r) => `$D$6*H${r}`, value: (it) => it.insuranceBrl },
    { header: "VLR ADUANEIRO", width: 14, fmt: MONEY, formula: (r) => `I${r}+J${r}+K${r}`, value: (it) => it.customsValueBrl },
    { header: "AFRMM", width: 11, fmt: MONEY, formula: (r) => `$D$7*H${r}`, value: (it) => it.afrmmBrl },
    { header: "SISCOMEX", width: 10, fmt: MONEY, formula: (r) => `$D$8*H${r}`, value: (it) => it.siscomexBrl },
    { header: "DEMAIS DESP.", width: 12, fmt: MONEY, formula: (r) => `$D$9*H${r}`, value: (it) => it.demaisDespesasBrl },
    { header: "% II", width: 8, fmt: PCT, value: (it) => it.iiRate },
    { header: "VALOR II", width: 12, fmt: MONEY, formula: (r) => `L${r}*P${r}`, value: (it) => it.iiValue },
    { header: "% IPI", width: 8, fmt: PCT, value: (it) => it.ipiRate },
    { header: "VALOR IPI", width: 12, fmt: MONEY, formula: (r) => `(L${r}+Q${r})*R${r}`, value: (it) => it.ipiValue },
    { header: "% PIS", width: 8, fmt: PCT, value: (it) => it.pisRate },
    { header: "PIS-IMP", width: 12, fmt: MONEY, formula: (r) => `L${r}*T${r}`, value: (it) => it.pisValue },
    { header: "% COFINS", width: 9, fmt: PCT, value: (it) => it.cofinsRate },
    { header: "COFINS-IMP", width: 12, fmt: MONEY, formula: (r) => `L${r}*V${r}`, value: (it) => it.cofinsValue },
    { header: "BASE ICMS", width: 13, fmt: MONEY, formula: (r) => `(L${r}+M${r}+N${r}+Q${r}+S${r}+U${r}+W${r})/(1-$D$12)`, value: (it) => it.icmsBase },
    { header: "ICMS EFETIVO (TTD)", width: 14, fmt: MONEY, internalOnly: true, formula: (r) => `X${r}*$D$13`, value: (it) => it.icmsValue },
    { header: internalLabel("ICMS CLIENTE", internal), width: 14, fmt: MONEY, formula: (r) => `X${r}*$D$14`, value: (it) => it.icmsClienteValue },
    { header: "GANHO BENEFÍCIO", width: 14, fmt: MONEY, internalOnly: true, formula: (r) => colRef(cols, "ICMS CLIENTE", internal, r) , value: (it) => it.ganhoBeneficioIcms },
    { header: "CUSTO ANTES ASSESS.", width: 15, fmt: MONEY, value: (it) => it.totalCostBeforeAssessoria },
    { header: "ASSESSORIA", width: 12, fmt: MONEY, value: (it) => it.assessoriaValue },
    { header: "CUSTO TOTAL", width: 14, fmt: MONEY, value: (it) => it.totalCost },
    { header: "CRÉDITOS RECUP.", width: 14, fmt: MONEY, value: (it) => it.recoverableCredits },
    { header: "CUSTO LÍQUIDO", width: 14, fmt: MONEY, value: (it) => it.netTotalCost },
    { header: "CUSTO UNIT. LÍQ.", width: 13, fmt: MONEY, value: (it) => it.netUnitCost },
    { header: "PREÇO VENDA", width: 14, fmt: MONEY, value: (it) => it.salePrice },
    { header: "PREÇO UNIT.", width: 12, fmt: MONEY, value: (it) => it.saleUnitPrice },
    { header: "ICMS VENDA", width: 12, fmt: MONEY, formula: undefined, value: (it) => it.icmsVendaValue },
    { header: "IPI VENDA", width: 12, fmt: MONEY, value: (it) => it.ipiVendaValue },
    { header: "ICMS ST", width: 11, fmt: MONEY, value: (it) => it.icmsStValue },
    { header: "TOTAL NF VENDA", width: 14, fmt: MONEY, value: (it) => it.totalInvoiceValue },
  ].filter((c) => internal || !c.internalOnly);

  // Cabeçalho
  const hdr = ws.getRow(HDR_ROW);
  cols.forEach((c, i) => {
    hdr.getCell(i + 1).value = c.header;
    ws.getColumn(i + 1).width = c.width;
  });
  styleHeader(hdr);
  // Destaque amarelo nas colunas internas (após o estilo base)
  cols.forEach((c, i) => {
    if (c.internalOnly) {
      const cell = hdr.getCell(i + 1);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.internal } };
      cell.font = { bold: true, size: 9, color: { argb: COLORS.header } };
    }
  });

  // Linhas de itens — valores do motor; fórmulas onde definidas
  result.items.forEach((it, idx) => {
    const rNum = HDR_ROW + 1 + idx;
    const row = ws.getRow(rNum);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = c.value(it);
      if (c.header === "ITEM") cell.value = idx + 1;
      else if (c.formula) cell.value = { formula: c.formula(rNum), result: v as number };
      else cell.value = v as number | string;
      if (c.fmt) cell.numFmt = c.fmt;
    });
  });
  // Totais
  const lastItemRow = HDR_ROW + result.items.length;
  const totRow = ws.getRow(lastItemRow + 1);
  totRow.getCell(2).value = "TOTAIS";
  totRow.font = { bold: true };
  cols.forEach((c, i) => {
    if (c.fmt === MONEY) {
      const L = colLetter(i + 1);
      totRow.getCell(i + 1).value = {
        formula: `SUM(${L}${HDR_ROW + 1}:${L}${lastItemRow})`,
        result: result.items.reduce((acc, it) => acc + (Number(c.value(it)) || 0), 0),
      };
      totRow.getCell(i + 1).numFmt = MONEY;
    }
  });
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: HDR_ROW }];

  // ============================================================
  // ABA 3 — EST. DE CUSTO (consolidação)
  // ============================================================
  const est = wb.addWorksheet("EST. DE CUSTO - IMP. PRÓPRIA");
  let r = 1;
  const put = (label: string, value?: number, fmt = MONEY, bold = false) => {
    const row = est.getRow(r++);
    row.getCell(2).value = label;
    if (value !== undefined) {
      row.getCell(6).value = value;
      row.getCell(6).numFmt = fmt;
    }
    if (bold) row.font = { bold: true };
  };
  est.getColumn(2).width = 42;
  est.getColumn(6).width = 18;

  put(`ESTIMATIVA DE CUSTO — IMPORTAÇÃO PRÓPRIA — ${opts.quotationName}`, undefined, MONEY, true);
  if (opts.clientName) put(`Cliente: ${opts.clientName}`);
  if (opts.supplierName) put(`Fornecedor: ${opts.supplierName} (${opts.originCountry ?? ""})`);
  put(`Câmbio: ${s.exchangeRate}  |  Regime: ${regimeLabel(opts.regime)}`);
  r++;
  put("VALOR ADUANEIRO", undefined, MONEY, true);
  put("Valor FOB", s.fobTotalBrl);
  put("Frete Internacional", s.freightTotalBrl);
  put("Seguro", s.insuranceTotalBrl);
  put("Total — Valor CIF", s.cifTotalBrl, MONEY, true);
  r++;
  put("TRIBUTOS DE NACIONALIZAÇÃO", undefined, MONEY, true);
  put("I.I.", s.iiTotal);
  put("IPI-Imp.", s.ipiTotal);
  put("PIS-Imp.", s.pisTotal);
  put("COFINS-Imp.", s.cofinsTotal);
  put("ICMS Antecipado", internal ? s.icmsTotal : s.icmsClienteTotal);
  if (internal && Math.abs(s.ganhoBeneficioIcmsTotal) > 0.005) {
    put("ICMS cobrado do cliente", s.icmsClienteTotal);
    put("→ Ganho do benefício (interno)", s.ganhoBeneficioIcmsTotal, MONEY, true);
  }
  put("Taxa Siscomex", s.siscomexTotal);
  put("Total Tributos", s.taxesTotal, MONEY, true);
  r++;
  put("CUSTOS ADUANEIROS", undefined, MONEY, true);
  put("Demais despesas (BL, armazenagem, frete interno, despacho)", s.demaisDespesasTotal);
  put("AFRMM", s.afrmmTotal);
  put("Total", s.customsCostsTotal, MONEY, true);
  r++;
  put("NF-e DE NACIONALIZAÇÃO", undefined, MONEY, true);
  put("Produto (CIF)", s.nfeProduto);
  put("I.I.", s.nfeIi);
  put("IPI", s.nfeIpi);
  put("Outras Despesas (PIS+COFINS+ICMS+Siscomex+AFRMM)", s.nfeOutrasDespesas);
  put("NF-e Nacionalização", s.nfeNacionalizacao, MONEY, true);
  r++;
  put("CUSTO LÍQUIDO DO IMPORTADOR", undefined, MONEY, true);
  put("Tributos recuperáveis (créditos)", s.recoverableCreditsTotal);
  put("Pacote logístico", s.pacoteLogistico);
  put("Assessoria", s.assessoriaTotal);
  put("Custo Líquido Total", s.netCostTotal, MONEY, true);
  r++;
  put("ESTIMATIVA DE VENDA", undefined, MONEY, true);
  put(`Margem bruta (lucro / (1 − IRPJ − CSLL))`, s.margemBruta, PCT);
  put("Fator markup", s.markupFactor, PCT);
  put("Valor dos Produtos", s.salePriceTotal, MONEY, true);
  put("ICMS venda", s.icmsVendaTotal);
  put("IPI venda", s.ipiVendaTotal);
  put("ICMS ST", s.icmsStTotal);
  put("VALOR TOTAL DA VENDA", s.totalSaleInvoice, MONEY, true);
  put("Lucro desejado (R$)", s.lucroDesejadoValor);
  put("IRPJ", s.irpjValor);
  put("CSLL", s.csllValor);
  if (s.royaltiesTotal > 0) {
    put("Royalties (c/ margem)", s.royaltiesComMargem);
    put("TOTAL DA OPERAÇÃO C/ ROYALTIES", s.totalOperacaoComRoyalties, MONEY, true);
  }
  if (result.warnings.length || (result as { ncmWarnings?: string[] }).ncmWarnings?.length) {
    r++;
    put("AVISOS", undefined, MONEY, true);
    [...result.warnings, ...(((result as { ncmWarnings?: string[] }).ncmWarnings) ?? [])]
      .forEach((w) => put(`• ${w}`));
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// ============================================================
// Helpers
// ============================================================
function sumQty(items: EngineItemResult[]) {
  return items.reduce((s, i) => s + i.quantity, 0);
}
function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
/** Fórmula do GANHO = ICMS CLIENTE − ICMS EFETIVO (posições dinâmicas) */
function colRef(cols: ColDef[], _h: string, internal: boolean, r: number): string {
  // No modo interno, ICMS EFETIVO=col Y(25) e CLIENTE=col Z(26) na grade filtrada
  const idxEfetivo = cols.findIndex((c) => c.header.startsWith("ICMS EFETIVO"));
  const idxCliente = cols.findIndex((c) => c.header.startsWith("ICMS CLIENTE") || c.header === "ICMS ANTECIPADO");
  if (!internal || idxEfetivo < 0) return `0`;
  return `${colLetter(idxCliente + 1)}${r}-${colLetter(idxEfetivo + 1)}${r}`;
}
function internalLabel(base: string, internal: boolean) {
  return internal ? base : "ICMS ANTECIPADO";
}
function grossUpFromResult(res: EngineResult): number {
  const it = res.items[0];
  if (!it) return 0.04;
  const num = it.customsValueBrl + it.afrmmBrl + it.siscomexBrl + it.iiValue + it.ipiValue + it.pisValue + it.cofinsValue;
  return it.icmsBase > 0 ? 1 - num / it.icmsBase : 0.04;
}
function assessoriaRateFromResult(res: EngineResult): number {
  const it = res.items[0];
  if (!it || it.assessoriaValue === 0) return 0;
  const base = res.summary.royaltiesTotal * it.shareOfValue + it.totalCostBeforeAssessoria;
  return base > 0 ? it.assessoriaValue / base : 0;
}
function regimeLabel(r: string) {
  return r === "lucro_real" ? "Lucro Real" : r === "lucro_presumido" ? "Lucro Presumido" : "Simples Nacional";
}
function styleTitle(row: ExcelJS.Row) {
  row.font = { bold: true, size: 14, color: { argb: COLORS.header } };
}
function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 9 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.header } };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  });
  row.height = 28;
}
