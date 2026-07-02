/**
 * Excel Estimativa Service — réplica 1:1 do modelo de referência
 * "Custo_Importacao_..." (última base ajustada com o usuário), com FÓRMULAS
 * VIVAS: o destinatário altera câmbio, frete, alíquotas ou despesas e tudo
 * recalcula no próprio Excel.
 *
 * FIDELIDADE: o layout replica o modelo célula a célula — posições fixas:
 *  1. INVOICE                          — banner B1:L1, cabeçalho 2:3,
 *     itens nas linhas 4..29 (não usadas ficam ocultas), totais na linha 30.
 *  2. CUSTO MERCADORIA - IMP. PRÓPRIA  — título B2, blocos de parâmetros
 *     (B5:E9 / G5:H9 / Demais Despesas B12:E18 / Pacote+Royalties B21:E22),
 *     banners na linha 24, cabeçalho na 25, itens 26..51 (ocultas as não
 *     usadas), totais na 52. Colunas fixas B..AM (custo) e AO..AY (venda).
 *  3. EST. DE CUSTO - IMP. PRÓPRIA     — consolidação (linhas 1..135 idênticas
 *     ao modelo) + ACRÉSCIMOS acordados abaixo da área espelhada (GANHO DA
 *     OPERAÇÃO, cenário do COMPRADOR — Lucro Real e AVISOS).
 *
 * Como as grades têm posição fixa, TODAS as referências cruzadas são
 * estáticas e idênticas às do modelo (ex.: D6='=J52', E22='=INVOICE!K30*H7',
 * AR26="='EST. DE CUSTO - IMP. PRÓPRIA'!H$97").
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
import type { EngineResult } from "./importCostEngine";

const SHEET_INVOICE = "INVOICE";
const SHEET_CUSTO = "CUSTO MERCADORIA - IMP. PRÓPRIA";
const SHEET_EST = "EST. DE CUSTO - IMP. PRÓPRIA";

// Cores do modelo (tema Office: Azul Accent1 -50% = 1F3864).
const DARK = "FF1F3864";   // cabeçalhos/faixas (texto branco)
const WHITE = "FFFFFFFF";
const YELLOW = "FFFFFF00"; // células editáveis (inputs)
const ITEM_TEXT = "FF222A35"; // texto das linhas por item na aba EST

// Formatos numéricos (idênticos aos do modelo)
const BRL = '_-[$R$-416]\\ * #,##0.00_-;\\-[$R$-416]\\ * #,##0.00_-;_-[$R$-416]\\ * \\-??_-;_-@_-';
const BRL2 = '_-"R$ "* #,##0.00_-;"-R$ "* #,##0.00_-;_-"R$ "* \\-??_-;_-@_-';
const USD = '_-[$$-409]* #,##0.00_ ;_-[$$-409]* \\-#,##0.00\\ ;_-[$$-409]* \\-??_ ;_-@_ ';
const FX4 = '_-"R$ "* #,##0.0000_-;"-R$ "* #,##0.0000_-;_-"R$ "* \\-??_-;_-@_-';
const NUM2 = '_ * #,##0.00_ ;_ * \\-#,##0.00_ ;_ * \\-??_ ;_ @_ ';
const NUM4 = '_ * #,##0.0000_ ;_ * \\-#,##0.0000_ ;_ * \\-??_ ;_ @_ ';
const USD_P = '_(\\$* #,##0.00_);_(\\$* \\(#,##0.00\\);_(\\$* \\-??_);_(@_)';
const USD_P4 = '_(\\$* #,##0.0000_);_(\\$* \\(#,##0.0000\\);_(\\$* \\-??_);_(@_)';
const USD_CN = '_-[$$-4809]* #,##0.00_-;\\-[$$-4809]* #,##0.00_-;_-[$$-4809]* \\-??_-;_-@_-';
const RS_PLAIN = '"R$ "#,##0.00';
const PCT2 = "0.00%";
const PCT3 = "0.000%";
const INT = "0";
const MKP4 = "0.0000";

const THIN = { style: "thin" as const };
const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };

export interface ExcelEstimativaOptions {
  quotationName: string;
  supplierName?: string;
  originCountry?: string;
  clientName?: string;
  mode: "internal" | "client";
  regime: "lucro_real" | "lucro_presumido" | "simples_nacional";
  currency?: string;
}

// Capacidade das grades do modelo (INVOICE 4..29 / CUSTO 26..51 / EST 63..88).
const MAX_ITEMS = 26;

// Linhas-âncora fixas (idênticas ao modelo)
const INV_ITEM0 = 4;   // primeiro item da INVOICE
const INV_LAST = 29;   // última linha da grade INVOICE
const INV_TOT = 30;    // totais INVOICE
const CM_ITEM0 = 26;   // primeiro item do CUSTO MERCADORIA
const CM_LAST = 51;    // última linha da grade
const CM_TOT = 52;     // totais
const EST_ITEM0 = 63;  // grade "custo líquido por item"
const EST_LAST = 88;
const EST_TOT = 89;
const ESTV_ITEM0 = 109; // grade "estimativa de venda por item"
const ESTV_LAST = 134;
const ESTV_TOT = 135;

type CellVal = ExcelJS.CellValue;

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Pinta uma região de branco com a fonte-base da aba (fundo do modelo). */
function paintWhite(ws: ExcelJS.Worksheet, rows: number, cols: number, size: number) {
  for (let r = 1; r <= rows; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      fill(cell, WHITE);
      cell.font = { size };
    }
  }
}

interface SetOpts {
  fmt?: string;
  bold?: boolean;
  size?: number;
  color?: string;      // cor da fonte (argb)
  bg?: string;         // fill (argb)
  al?: "left" | "center" | "right";
  wrap?: boolean;
  border?: Partial<ExcelJS.Borders> | true;
}

function set(ws: ExcelJS.Worksheet, ref: string, value: CellVal, o: SetOpts = {}): ExcelJS.Cell {
  const cell = ws.getCell(ref);
  if (value !== undefined) cell.value = value;
  const size = o.size ?? (cell.font?.size as number | undefined);
  cell.font = { size, bold: o.bold, color: o.color ? { argb: o.color } : undefined };
  if (o.bg) fill(cell, o.bg);
  if (o.fmt) cell.numFmt = o.fmt;
  if (o.al || o.wrap) cell.alignment = { horizontal: o.al, vertical: "middle", wrapText: o.wrap };
  if (o.border) cell.border = o.border === true ? BOX : o.border;
  return cell;
}

/** Célula de rótulo escuro (branco sobre azul-escuro), padrão do modelo. */
function dark(ws: ExcelJS.Worksheet, ref: string, text: string, o: SetOpts = {}) {
  return set(ws, ref, text, { bold: true, color: WHITE, bg: DARK, border: true, ...o });
}

function fx(formula: string, result?: number | string): ExcelJS.CellValue {
  return { formula, result } as ExcelJS.CellValue;
}

function regimeLabel(r: string) {
  return r === "lucro_real" ? "Lucro Real" : r === "lucro_presumido" ? "Lucro Presumido" : "Simples Nacional";
}

/** Formata fração como literal de porcentagem p/ fórmula (ex.: 0.025 → "2.5%"). */
function pctLit(frac: number): string {
  const v = Math.round(frac * 1e6) / 1e4; // até 4 casas na %
  return `${v}%`;
}

export async function generateEstimativaExcel(
  result: EngineResult,
  opts: ExcelEstimativaOptions
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SUPPLEY Calc";
  wb.created = new Date();
  const s = result.summary;
  const items = result.items.slice(0, MAX_ITEMS);
  const internal = opts.mode === "internal";
  const hasBuyer = !!s.buyer;
  const cur = opts.currency ?? "USD";
  const n = items.length;
  const fxRate = s.exchangeRate || 1;

  // ============================================================
  // ABA 1 — INVOICE / PACKING LIST
  // ============================================================
  const inv = wb.addWorksheet(SHEET_INVOICE);
  [40.7, 29.7, 8.0, 18.0, 11.5, 16.7, 13.8, 12.8, 13.7, 11.2, 13.2, 11.2]
    .forEach((w, i) => (inv.getColumn(i + 1).width = w));
  paintWhite(inv, INV_TOT, 12, 10);

  // Banner "PACKING LIST" (B1:L1) — branco com bordas, como o modelo.
  inv.mergeCells("B1:L1");
  set(inv, "B1", "PACKING LIST", { bold: true, size: 11, al: "center", border: true });
  inv.getRow(1).height = 15;

  // Cabeçalho nas linhas 2:3 (mescla vertical por coluna).
  const invHeaders = [
    "Description", "Size", "G.W (kg)", "Espec.", "Q'ty/Unit", `Unit price (${cur})`,
    "Amount", "Unit price dec.", "Amount dec.", "Royalties Un.", "Royalties Total", "NCM",
  ];
  invHeaders.forEach((h, i) => {
    const colL = inv.getColumn(i + 1).letter;
    inv.mergeCells(`${colL}2:${colL}3`);
    set(inv, `${colL}2`, h, { bold: true, size: 10, al: "center", wrap: true, border: true });
  });

  // Grade de itens (4..29): linhas não usadas ficam com o estilo do template.
  for (let r = INV_ITEM0; r <= INV_LAST; r++) {
    const row = inv.getRow(r);
    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      cell.border = BOX;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: c <= 2 };
      cell.font = { size: 10, bold: c === 7 }; // coluna G (Amount) é negrito no modelo
    }
    row.getCell(5).numFmt = INT;
    row.getCell(6).numFmt = USD_P4;
    row.getCell(7).numFmt = USD_CN;
    row.getCell(8).numFmt = USD_P;
    row.getCell(9).numFmt = USD_P;
    row.getCell(10).numFmt = USD_P4;
    row.getCell(11).numFmt = USD_P;
  }
  items.forEach((it, i) => {
    const r = INV_ITEM0 + i;
    const row = inv.getRow(r);
    row.getCell(1).value = it.description;
    row.getCell(3).value = it.weightKgTotal || 0;
    row.getCell(5).value = it.quantity;
    row.getCell(6).value = it.unitPriceFob;
    row.getCell(7).value = fx(`F${r}*E${r}`, it.totalFob);
    // Sem subfaturamento: declarado = real ⇒ royalties zeram.
    row.getCell(8).value = fx(`F${r}`, it.unitPriceFob);
    row.getCell(9).value = fx(`H${r}*E${r}`, it.totalFob);
    row.getCell(10).value = fx(`IF(H${r}>0,F${r}-H${r},0)`, 0);
    row.getCell(11).value = fx(`J${r}*E${r}`, 0);
    row.getCell(12).value = it.ncm;
    // Altura proporcional à descrição (o modelo usa linhas altas).
    row.height = Math.max(30, Math.min(160, Math.ceil(it.description.length / 40) * 16 + 14));
  });
  // Linhas não usadas: mantém 1 sobrando visível; oculta o resto (como o modelo).
  for (let r = INV_ITEM0 + n + 1; r <= INV_LAST - 1; r++) inv.getRow(r).hidden = true;
  inv.getRow(INV_LAST).height = 12;

  // Totais (linha 30) — SUM sobre toda a grade 4:29, como o modelo.
  const totQty = items.reduce((a, i) => a + i.quantity, 0);
  set(inv, `E${INV_TOT}`, fx(`SUM(E${INV_ITEM0}:E${INV_LAST})`, totQty), { bold: true, size: 10, fmt: INT, al: "center", border: true });
  set(inv, `G${INV_TOT}`, fx(`SUM(G${INV_ITEM0}:G${INV_LAST})`, s.fobTotalFob), { bold: true, size: 10, fmt: USD_CN, al: "center", border: true });
  set(inv, `I${INV_TOT}`, fx(`SUM(I${INV_ITEM0}:I${INV_LAST})`, s.fobTotalFob), { bold: true, size: 10, fmt: USD_P, al: "center", border: true });
  set(inv, `K${INV_TOT}`, fx(`SUM(K${INV_ITEM0}:K${INV_LAST})`, 0), { bold: true, size: 10, fmt: USD_P, al: "center", border: true });

  // ============================================================
  // ABA 2 — CUSTO MERCADORIA - IMP. PRÓPRIA
  // ============================================================
  const cm = wb.addWorksheet(SHEET_CUSTO);
  const CM_WIDTHS: Record<string, number> = {
    A: 3.3, B: 12.8, D: 18.2, E: 20.7, F: 14.7, G: 29.3, H: 14.7, J: 17.7, K: 14.7,
    M: 18.5, N: 15.7, O: 17.0, P: 7.0, Q: 14.7, S: 20.3, T: 9.7, U: 19.3, V: 17.3,
    W: 19.0, X: 7.0, Y: 22.2, Z: 10.7, AA: 17.2, AB: 11.5, AC: 17.0, AD: 13.2,
    AE: 17.7, AF: 15.7, AG: 19.5, AH: 15.7, AI: 19.5, AJ: 19.7, AL: 23.7, AM: 18.2,
    AN: 9.0, AO: 20.2, AP: 20.8, AQ: 16.2, AR: 9.2, AS: 19.8, AT: 10.0, AU: 18.3,
    AV: 22.5, AW: 18.0, AX: 22.5, AY: 21.2,
  };
  Object.entries(CM_WIDTHS).forEach(([l, w]) => (cm.getColumn(l).width = w));
  paintWhite(cm, CM_TOT + 2, 51 /* A..AY */, 12);
  const RH: Record<number, number> = {
    2: 30, 3: 18, 4: 15.75, 5: 15.75, 6: 15.75, 7: 15.75, 8: 15.75, 9: 15.75,
    12: 15.75, 19: 15.75, 20: 15.75, 21: 15.75, 22: 15.75, 23: 27.75, 24: 39.75,
    25: 49.5, 26: 51, 52: 15.75,
  };
  Object.entries(RH).forEach(([r, h]) => (cm.getRow(Number(r)).height = h));

  // ---- Taxas derivadas do motor (parametrizam as fórmulas) ----
  const it0 = items[0];
  const grossUp = it0 && it0.icmsBase > 0
    ? 1 - (it0.customsValueBrl + it0.afrmmBrl + it0.siscomexBrl + it0.iiValue + it0.ipiValue + it0.pisValue + it0.cofinsValue) / it0.icmsBase
    : 0.04;
  const grossDen = Math.round((1 - grossUp) * 1e4) / 1e4; // ex.: 0.96
  const assessRate = it0 && it0.totalCostBeforeAssessoria > 0
    ? it0.assessoriaValue / (s.royaltiesTotal * it0.shareOfValue + it0.totalCostBeforeAssessoria)
    : 0;

  // ---- Título ----
  cm.mergeCells("B2:E2");
  set(cm, "B2", "ESTIMATIVA DE IMPORTAÇÃO", { bold: true, size: 24, al: "center" });

  // ---- Bloco esquerdo (B5:E9) ----
  dark(cm, "B5", "Descrição", { size: 12, al: "center" });
  dark(cm, "C5", "Moeda EX", { size: 12, al: "center" });
  dark(cm, "D5", "Valor", { size: 12, al: "center" });
  dark(cm, "E5", "Moeda R$", { size: 12, al: "center" });
  set(cm, "B6", "Valor Fob", { size: 12, al: "center", border: true });
  set(cm, "C6", cur, { size: 12, al: "center", border: true });
  set(cm, "D6", fx(`J${CM_TOT}`, s.fobTotalFob), { size: 12, fmt: USD, al: "center", border: true });
  set(cm, "E6", fx("D6*H7", s.fobTotalBrl), { size: 12, fmt: BRL, al: "center", border: true });
  set(cm, "B7", "Valor Frete ", { size: 12, al: "center", border: true });
  set(cm, "C7", cur, { size: 12, al: "center", border: true });
  set(cm, "D7", s.freightTotalBrl / fxRate, { size: 12, fmt: USD, al: "center", bg: YELLOW, border: true });
  set(cm, "E7", fx("D7*H7", s.freightTotalBrl), { size: 12, fmt: BRL, al: "center", border: true });
  set(cm, "B8", "Seguro", { size: 12, al: "center", border: true });
  set(cm, "C8", cur, { size: 12, al: "center", border: true });
  set(cm, "D8", s.insuranceTotalBrl / fxRate, { size: 12, fmt: USD, al: "center", border: true });
  set(cm, "E8", fx("D8*H7", s.insuranceTotalBrl), { size: 12, fmt: BRL2, al: "center", border: true });
  set(cm, "B9", "Valor ADU", { size: 12, al: "center", border: true });
  set(cm, "C9", cur, { size: 12, al: "center", border: true });
  set(cm, "D9", fx("SUM(D6:D8)", s.fobTotalFob + (s.freightTotalBrl + s.insuranceTotalBrl) / fxRate), { size: 12, fmt: USD, al: "center", border: true });
  set(cm, "E9", fx("SUM(E6:E8)", s.cifTotalBrl), { size: 12, fmt: BRL, al: "center", border: true });

  // ---- Bloco direito (G5:H9) ----
  const pesoTot = items.reduce((a, it) => a + (it.weightKgTotal || 0), 0);
  set(cm, "G5", "Peso Bruto", { size: 12, al: "left", border: true });
  dark(cm, "H5", "", { size: 12, al: "left" }); cm.getCell("H5").value = pesoTot; cm.getCell("H5").numFmt = NUM2;
  set(cm, "G6", "Peso Liquido", { size: 12, al: "left", border: true });
  dark(cm, "H6", "", { size: 12, al: "left" }); cm.getCell("H6").value = fx(`K${CM_TOT}`, pesoTot); cm.getCell("H6").numFmt = NUM2;
  set(cm, "G7", "Taxa dólar", { size: 12, al: "left", border: true });
  set(cm, "H7", s.exchangeRate, { size: 12, bold: true, fmt: FX4, al: "left", bg: YELLOW, border: true });
  set(cm, "G8", "SISCOMEX", { size: 12, al: "left", border: true });
  dark(cm, "H8", "", { size: 12, al: "left" });
  // Fórmula do modelo quando o valor é o padrão (115,67 + 38,56 = 154,23).
  cm.getCell("H8").value = Math.abs(s.siscomexTotal - 154.23) < 0.005 ? fx("(115.67+38.56)", s.siscomexTotal) : s.siscomexTotal;
  cm.getCell("H8").numFmt = BRL;
  set(cm, "G9", "AFRMM", { size: 12, al: "left", border: true });
  dark(cm, "H9", "", { size: 12, al: "left" });
  // AFRMM vivo quando segue a regra 8% × frete; senão, valor do motor.
  const afrmmFrom8 = Math.abs(s.afrmmTotal - 0.08 * s.freightTotalBrl) < 0.01;
  cm.getCell("H9").value = afrmmFrom8 ? fx("E7*0.08", s.afrmmTotal) : s.afrmmTotal;
  cm.getCell("H9").numFmt = BRL;

  // ---- Demais Despesas (B12:E18) ----
  const bd = (result as unknown as { despesasBreakdown?: {
    liberacaoBl: number; armazenagem: number; freteInterno: number; despacho: number; expediente: number;
  } }).despesasBreakdown;
  cm.mergeCells("B12:E12");
  dark(cm, "B12", "Demais Despesas", { size: 12, al: "center" });
  const desp: [string, string, number, boolean][] = [
    ["B13", "Liberação de BL", bd?.liberacaoBl ?? 0, true],
    ["B14", "Armazenagem", bd?.armazenagem ?? 0, true],
    ["B15", "Frete interno", bd?.freteInterno ?? 0, true],
    ["B16", "Comissão Despacho Aduaneiro", bd?.despacho ?? 0, true],
    ["B17", "Taxa de Expediente ", bd?.expediente ?? 0, false],
  ];
  // Sem quebra detalhada: joga o total em "Liberação de BL" p/ manter E18 = total.
  if (!bd && s.demaisDespesasTotal > 0) desp[0][2] = s.demaisDespesasTotal;
  cm.mergeCells("B16:D16");
  desp.forEach(([ref, txt, val, yellow]) => {
    set(cm, ref, txt, { size: 12, al: "left", border: true });
    const eRef = `E${ref.slice(1)}`;
    set(cm, eRef, val, { size: 12, fmt: BRL, al: "center", border: true, bg: yellow ? YELLOW : undefined });
  });
  cm.mergeCells("B18:D18");
  set(cm, "B18", "Total", { size: 12, al: "left", border: true });
  set(cm, "E18", fx("SUM(E13:E17)", s.demaisDespesasTotal), { size: 12, fmt: BRL, al: "center", border: true });

  // ---- Pacote Logístico / Royalties (B21:E22) ----
  cm.mergeCells("B21:D21");
  set(cm, "B21", "Pacote Logístico", { size: 12, al: "left", border: true });
  set(cm, "E21", s.pacoteLogistico, { size: 12, fmt: BRL, al: "center", border: true });
  cm.mergeCells("B22:D22");
  set(cm, "B22", "Royalties", { size: 12, al: "left", border: true });
  set(cm, "E22", fx(`INVOICE!K${INV_TOT}*H7`, s.royaltiesTotal), { size: 12, fmt: BRL, al: "center", border: true });

  // ---- Banners (linha 24) ----
  cm.mergeCells("B24:AM24");
  dark(cm, "B24", "CUSTO DE IMPORTAÇÃO", { size: 12, al: "center" });
  cm.mergeCells("AO24:AY24");
  dark(cm, "AO24", "CUSTO LÍQUIDO E VENDA ", { size: 12, al: "center" });

  // ---- Cabeçalho da grade (linha 25) ----
  // [coluna, título, escuro?] — colunas de % têm fundo branco no modelo.
  const CM_HEADERS: [string, string, boolean][] = [
    ["B", "ADIÇÃO", true], ["C", "ITEM", true], ["D", "CÓDIGO", true],
    ["E", "QUANTIDADE", true], ["F", "UN.", true], ["G", "DESCRIÇÃO", true],
    ["H", "NCM", true], ["I", "VALOR UNITÁRIO", true], ["J", "VALOR TOTAL", true],
    ["K", "PESO", true], ["L", "% VALOR", true], ["M", "Valor FOB R$", true],
    ["N", "FRETE ", true], ["O", "VLR ADUANEIRO R$", true], ["P", "", true],
    ["Q", "AFRMM", true], ["R", "SISCOMEX", true], ["S", "DEMAIS DESPESAS", true],
    ["T", "% II", false], ["U", "VALOR II", true], ["V", "MERCADORIA UNIT", true],
    ["W", "VALOR MERCADORIA", true], ["X", "", true], ["Y", "BASE IPI", true],
    ["Z", "% IPI", false], ["AA", "VALOR IPI", true], ["AB", "% PIS", false],
    ["AC", "VALOR PIS-IMP", true], ["AD", "% COFINS", false], ["AE", "VALOR COFINS- IMP", true],
    ["AF", "CRÉDITO COFINS", true], ["AG", "BASE ICMS ANTECIPADO", true],
    ["AH", "% ICMS", false], ["AI", "VALOR ICMS ANTECIPADO", true],
    ["AJ", "CUSTO TOTAL ANTES DA ASSESSORIA", true], ["AK", "ASSESSORIA", true],
    ["AL", "CUSTO TOTAL APÓS ASSESSORIA", true], ["AM", "CUSTO UNIT.", true],
    ["AO", "CUSTO LÍQUIDO  IMPORTAÇÃO", true], ["AP", "CUSTO LÍQUIDO TOTAL", true],
    ["AQ", "CUSTO UNIT. LIQ.", true], ["AR", "MKP", true], ["AS", "VALOR DOS PRODUTOS", true],
    ["AT", "% ICMS", false], ["AU", "ICMS", true], ["AV", "IPI", true],
    ["AW", "ICMS ST", true], ["AX", "TOTAL NF VENDA", true],
    ["AY", "VALOR UNITÁRIO C/ IPI E ICMS ST", true],
  ];
  CM_HEADERS.forEach(([col, txt, isDark]) => {
    if (isDark) dark(cm, `${col}25`, txt, { size: 12, al: "center", wrap: true });
    else set(cm, `${col}25`, txt, { size: 12, bold: true, al: "center", wrap: true, border: true });
  });

  // ---- Fórmula do custo líquido (AO) conforme regime de créditos ----
  const netFormula = (r: number) => {
    switch (opts.regime) {
      case "lucro_real":      return `AL${r}-AI${r}-AF${r}-AC${r}-AA${r}`; // ICMS+COFINS+PIS+IPI
      case "lucro_presumido": return `AL${r}-AI${r}-AA${r}`;               // só ICMS+IPI
      default:                return `AL${r}`;                              // simples: sem créditos
    }
  };

  // ---- Template da grade (26..51): estilo em todas; fórmulas só nos itens ----
  const CM_FMTS: Record<string, string> = {
    E: INT, G: "@", I: USD, J: USD, K: NUM2, L: PCT3, M: BRL, N: BRL, O: BRL, P: BRL,
    Q: BRL, R: BRL, S: BRL, T: PCT2, U: BRL, V: BRL, W: BRL, X: BRL, Y: BRL, Z: PCT2,
    AA: BRL, AB: PCT2, AC: BRL, AD: PCT2, AE: BRL, AF: BRL, AG: BRL, AH: PCT2, AI: BRL,
    AJ: BRL, AK: BRL, AL: BRL, AM: BRL, AO: BRL, AP: BRL, AQ: BRL, AR: NUM4, AS: BRL,
    AT: PCT2, AU: BRL2, AV: BRL2, AW: BRL, AX: BRL, AY: BRL2,
  };
  const CM_COLS = CM_HEADERS.map(([c]) => c);
  for (let r = CM_ITEM0; r <= CM_LAST; r++) {
    CM_COLS.forEach((col) => {
      const cell = cm.getCell(`${col}${r}`);
      cell.border = BOX;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { size: 12 };
      const f = CM_FMTS[col];
      if (f) cell.numFmt = f;
    });
  }

  items.forEach((it, i) => {
    const r = CM_ITEM0 + i;
    const invR = INV_ITEM0 + i;
    const est = `'${SHEET_EST}'`;
    const v = (col: string, val: CellVal) => (cm.getCell(`${col}${r}`).value = val);
    v("C", i + 1);
    v("E", fx(`INVOICE!E${invR}`, it.quantity));
    v("F", it.unit || "UN");
    v("G", fx(`INVOICE!A${invR}`, it.description));
    v("H", fx(`INVOICE!L${invR}`, it.ncm));
    v("I", fx(`INVOICE!H${invR}`, it.unitPriceFob));
    v("J", fx(`E${r}*I${r}`, it.totalFob));
    v("K", it.weightKgTotal || 0);
    v("L", fx(`J${r}/$D$6`, it.shareOfValue));
    v("M", fx(`J${r}*$H$7`, it.fobBrl));
    v("N", fx(`$E$7*L${r}`, it.freightBrl));
    v("O", fx(`M${r}+N${r}`, it.customsValueBrl));
    v("Q", fx(`$H$9*L${r}`, it.afrmmBrl));
    v("R", fx(`$H$8*L${r}`, it.siscomexBrl));
    v("S", fx(`$E$18*L${r}`, it.demaisDespesasBrl));
    set(cm, `T${r}`, it.iiRate, { size: 12, fmt: PCT2, al: "center", bg: YELLOW, border: true });
    v("U", fx(`O${r}*T${r}`, it.iiValue));
    v("V", fx(`W${r}/E${r}`, it.merchandiseUnitValue));
    v("W", fx(`U${r}+O${r}`, it.merchandiseValue));
    v("Y", fx(`O${r}+U${r}`, it.ipiBase));
    set(cm, `Z${r}`, it.ipiRate, { size: 12, fmt: PCT2, al: "center", bg: YELLOW, border: true });
    v("AA", fx(`Y${r}*Z${r}`, it.ipiValue));
    v("AB", it.pisRate);
    v("AC", fx(`(O${r}*AB${r})`, it.pisValue));
    v("AD", it.cofinsRate);
    v("AE", fx(`(O${r}*AD${r})`, it.cofinsValue));
    v("AF", fx(`O${r}*AD${r}`, it.cofinsValue));
    v("AG", fx(`(O${r}+Q${r}+R${r}+U${r}+AA${r}+AC${r}+AE${r})/${grossDen}`, it.icmsBase));
    v("AH", it.icmsClienteRate);
    v("AI", fx(`AG${r}*AH${r}`, it.icmsClienteValue));
    v("AJ", fx(`O${r}+Q${r}+R${r}+S${r}+U${r}+AA${r}+AC${r}+AE${r}+AI${r}`, it.totalCostBeforeAssessoria));
    v("AK", fx(`(($E$22*L${r})+AJ${r})*${pctLit(assessRate)}`, it.assessoriaValue));
    v("AL", fx(`AJ${r}+AK${r}`, it.totalCost));
    v("AM", fx(`AL${r}/E${r}`, it.unitCost));
    v("AO", fx(netFormula(r), it.netImportCost));
    v("AP", fx(`AO${r}+(E$21*L${r})`, it.netTotalCost));
    v("AQ", fx(`AP${r}/E${r}`, it.netUnitCost));
    v("AR", fx(`${est}!H$97`, it.markupFactor));
    v("AS", fx(`AP${r}/AR${r}`, it.salePrice));
    v("AT", fx(`${est}!$F$93`, s.salePriceTotal > 0 ? s.icmsVendaTotal / s.salePriceTotal : 0));
    v("AU", fx(`AS${r}*AT${r}`, it.icmsVendaValue));
    v("AV", fx(`AS${r}*Z${r}`, it.ipiVendaValue));
    v("AW", it.icmsStValue);
    v("AX", fx(`AS${r}+AV${r}+AW${r}`, it.totalInvoiceValue));
    v("AY", fx(`AX${r}/E${r}`, it.unitInvoiceValue));
  });
  // Mantém 1 linha vazia visível; oculta as demais (como o modelo).
  for (let r = CM_ITEM0 + n + 1; r <= CM_LAST; r++) cm.getRow(r).hidden = true;

  // ---- Totais (linha 52) ----
  const CM_SUM_COLS = ["E", "J", "K", "L", "M", "N", "O", "Q", "R", "S", "U", "W", "Y",
    "AA", "AC", "AE", "AF", "AI", "AJ", "AK", "AL", "AO", "AP", "AS", "AU", "AV", "AW", "AX"];
  CM_COLS.forEach((col) => {
    const cell = cm.getCell(`${col}${CM_TOT}`);
    if (CM_SUM_COLS.includes(col)) cell.value = fx(`SUM(${col}${CM_ITEM0}:${col}${CM_LAST})`);
    cell.font = { size: 12, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BOX;
    // Totais usam o formato contábil R$-416 mesmo onde a linha usa "R$ " (modelo).
    const TOT_FMT: Record<string, string> = { AU: BRL, AV: BRL, AY: "0.00" };
    cell.numFmt = TOT_FMT[col] ?? (CM_FMTS[col] === PCT2 || CM_FMTS[col] === PCT3 ? CM_FMTS[col] : (CM_FMTS[col] ?? BRL));
  });

  // ============================================================
  // ABA 3 — EST. DE CUSTO - IMP. PRÓPRIA (1:1 + acréscimos abaixo)
  // ============================================================
  buildEstSheet(wb, result, opts, { internal, hasBuyer, n });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// ============================================================
// ABA 3 — réplica do modelo (linhas 1..135) + acréscimos
// ============================================================
function buildEstSheet(
  wb: ExcelJS.Workbook,
  result: EngineResult,
  opts: ExcelEstimativaOptions,
  ctx: { internal: boolean; hasBuyer: boolean; n: number },
) {
  const s = result.summary;
  const items = result.items.slice(0, MAX_ITEMS);
  const est = wb.addWorksheet(SHEET_EST);
  const CM = `'${SHEET_CUSTO}'`;

  const EST_WIDTHS: Record<string, number> = {
    A: 4.2, B: 66.7, C: 24.2, D: 26.8, E: 24.2, F: 20.7, G: 27.7, H: 36.3,
    I: 20.7, J: 27.2, K: 20.3, L: 29.8, M: 20.7, N: 9.0,
  };
  Object.entries(EST_WIDTHS).forEach(([l, w]) => (est.getColumn(l).width = w));
  paintWhite(est, ESTV_TOT + 30, 14, 16);
  const RH: Record<number, number> = { 1: 21, 3: 55, 4: 58, 5: 49, 13: 20.25, 63: 42, 109: 42 };
  Object.entries(RH).forEach(([r, h]) => (est.getRow(Number(r)).height = h));

  // ---- Banner ----
  est.mergeCells("B2:H5");
  dark(est, "B2", "                        ESTIMATIVA DE CUSTO - IMPORTAÇÃO PRÓPRIA", { size: 26, al: "center" });

  // ---- Dados Cliente ----
  set(est, "B7", "Dados Cliente", { size: 16 });
  dark(est, "B8", "Cliente", { size: 16, al: "left" });
  est.mergeCells("C8:H8");
  set(est, "C8", opts.clientName ?? "", { size: 16, al: "left", border: true });
  dark(est, "B9", "CNPJ", { size: 16, al: "left" });
  est.mergeCells("E9:F9"); est.mergeCells("G9:H9");
  set(est, "C9", "", { size: 16, al: "left", border: true });
  est.getCell("E9").numFmt = "000000000000\\-00";
  dark(est, "B10", "Endereço", { size: 16, al: "left" });
  est.mergeCells("C10:H10");
  set(est, "C10", "", { size: 16, al: "left", border: true });

  // ---- Mercadoria / Dados Complementares ----
  set(est, "B12", "Mercadoria / Dados Complementares", { size: 16 });
  dark(est, "B13", "Produto:", { size: 16, al: "left" });
  est.mergeCells("C13:H13");
  const prod0 = items[0];
  set(est, "C13", prod0 ? `${prod0.description} - NCM ${prod0.ncm}` : opts.quotationName, { size: 16, al: "left", border: true });

  set(est, "B15", "Data do Câmbio", { size: 16, al: "left", border: true });
  set(est, "C15", "Câmbio / USD", { size: 16, al: "left", border: true });
  est.mergeCells("E15:G15");
  set(est, "E15", "Incoterms", { size: 16, al: "center", border: true });
  set(est, "B16", fx("TODAY()"), { size: 16, fmt: "dd/mm/yy", al: "left", border: true });
  set(est, "C16", fx(`${CM}!H7`, s.exchangeRate), { size: 16, fmt: FX4, al: "left", border: true });
  est.mergeCells("E16:G16");
  set(est, "E16", "FOB", { size: 16, al: "center", border: true });

  // ---- Importação ----
  set(est, "B18", "Importação", { size: 16 });
  set(est, "G18", "Valor U$", { size: 16, al: "center" });
  set(est, "H18", "Valor  R$", { size: 16, al: "center" });
  dark(est, "B19", "Valor FOB", { size: 16, al: "left" });
  set(est, "G19", fx(`${CM}!D6`, s.fobTotalFob), { size: 16, fmt: USD, border: true });
  set(est, "H19", fx("G19*C16", s.fobTotalBrl), { size: 16, fmt: BRL, al: "center", border: true });
  dark(est, "B20", "Frete Internacional", { size: 16, al: "left" });
  set(est, "G20", fx(`${CM}!D7`, s.freightTotalBrl / (s.exchangeRate || 1)), { size: 16, fmt: USD, border: true });
  set(est, "H20", fx("G20*C16", s.freightTotalBrl), { size: 16, fmt: BRL, al: "center", border: true });
  dark(est, "B21", "Total - Valor CIF", { size: 16, al: "left" });
  set(est, "G21", fx("SUM(G19:G20)"), { size: 16, fmt: USD, border: true });
  dark(est, "H21", "", { size: 16, al: "left" });
  est.getCell("H21").value = fx("SUM(H19:H20)", s.cifTotalBrl);
  est.getCell("H21").numFmt = BRL;

  // ---- Tributos ----
  set(est, "B23", "Tributos", { size: 16, al: "left" });
  set(est, "H23", "Valor  R$", { size: 16, al: "center" });
  const trib: [string, string, string, number][] = [
    ["B24", "I.I.", `${CM}!U${CM_TOT}`, s.iiTotal],
    ["B25", "IPI-Imp.", `${CM}!AA${CM_TOT}`, s.ipiTotal],
    ["B26", "PIS-Imp.", `${CM}!AC${CM_TOT}`, s.pisTotal],
    ["B27", "COFINS-Imp.", `${CM}!AE${CM_TOT}`, s.cofinsTotal],
    ["B28", "ICMS Antecipado", `${CM}!AI${CM_TOT}`, s.icmsClienteTotal],
    ["B29", "TX Siscomex", `${CM}!H8`, s.siscomexTotal],
  ];
  trib.forEach(([ref, txt, formula, val]) => {
    dark(est, ref, txt, { size: 16, al: "left" });
    set(est, `H${ref.slice(1)}`, fx(formula, val), { size: 16, fmt: BRL2, al: "center", border: true });
  });
  dark(est, "B30", "Total Tributos", { size: 16, al: "left" });
  dark(est, "H30", "", { size: 16, al: "center" });
  est.getCell("H30").value = fx("SUM(H24:H29)", s.taxesTotal);
  est.getCell("H30").numFmt = BRL;

  // ---- Lançamentos Custos Aduaneiros ----
  set(est, "B32", "Lançamentos Custos Aduaneiros", { size: 16 });
  set(est, "H32", "Valor  R$", { size: 16, al: "center" });
  const adua: [string, string, string][] = [
    ["B33", "Liberação de BL", `${CM}!E13`],
    ["B34", "Armazenagem", `${CM}!E14`],
    ["B35", "Frete interno", `${CM}!E15`],
    ["B36", "Taxa de Expediente", `${CM}!E17`],
    ["B37", "Despacho Aduaneiro", `${CM}!E16`],
    ["B38", "AFRMM", `${CM}!H9`],
  ];
  adua.forEach(([ref, txt, formula]) => {
    dark(est, ref, txt, { size: 16, al: "left" });
    set(est, `H${ref.slice(1)}`, fx(formula), { size: 16, fmt: BRL2, al: "center", border: true });
  });
  dark(est, "B39", "Total Despesas Aduaneiras", { size: 16, al: "left" });
  dark(est, "H39", "", { size: 16 });
  est.getCell("H39").value = fx("SUM(H33:H38)", s.customsCostsTotal);
  est.getCell("H39").numFmt = BRL;

  // ---- NF-e de Importação ----
  set(est, "B41", "NF-e de Importação", { size: 16 });
  set(est, "H41", "Valor  R$", { size: 16, al: "center" });
  dark(est, "B42", "Produto", { size: 16 });
  set(est, "H42", fx("H21", s.nfeProduto), { size: 16, fmt: BRL, border: true });
  dark(est, "B43", "I.I.", { size: 16 });
  set(est, "H43", fx("H24", s.nfeIi), { size: 16, fmt: BRL, border: true });
  dark(est, "B44", "IPI-Imp.", { size: 16 });
  set(est, "H44", fx("H25", s.nfeIpi), { size: 16, fmt: BRL, border: true });
  dark(est, "B45", "Outras Despesas ", { size: 16 });
  set(est, "C45", "PIS+COFINS+ICMS ANTECIPADO+TAXA SISCOMEX+AFRMM", { size: 16, border: true });
  set(est, "H45", fx("H26+H27+H29+H38+H28", s.nfeOutrasDespesas), { size: 16, fmt: BRL, border: true });
  dark(est, "B46", "NF-e Nacionalização", { size: 16 });
  dark(est, "H46", "", { size: 16 });
  est.getCell("H46").value = fx("SUM(H42:H45)", s.nfeNacionalizacao);
  est.getCell("H46").numFmt = BRL;

  // ---- Outras Despesas Operacionais ----
  ["H47", "H48"].forEach((ref) => set(est, ref, "", { size: 16, bg: "FFA6A6A6" })); // separador cinza (modelo)
  set(est, "B48", "Outras Despesas Operacionais", { size: 16 });
  dark(est, "B49", "Pacote Logístico", { size: 16 });
  set(est, "H49", fx(`${CM}!E21`, s.pacoteLogistico), { size: 16, fmt: BRL, border: true });
  dark(est, "B50", "Assessoria", { size: 16 });
  set(est, "H50", fx(`${CM}!AK${CM_TOT}`, s.assessoriaTotal), { size: 16, fmt: BRL, border: true });
  dark(est, "B51", "Total outras despesas operacionais", { size: 16 });
  dark(est, "H51", "", { size: 16 });
  est.getCell("H51").value = fx("SUM(H49:H50)", s.pacoteLogistico + s.assessoriaTotal);
  est.getCell("H51").numFmt = BRL;

  // ---- Custo Líquido do Importador (créditos conforme regime) ----
  const real = opts.regime === "lucro_real";
  const semCred = opts.regime === "simples_nacional";
  set(est, "B53", "Custo Líquido do Importador", { size: 16 });
  dark(est, "B54", "PIS-Imp.", { size: 16 });
  set(est, "H54", real ? fx("H26") : 0, { size: 16, fmt: BRL2, al: "center", border: true });
  dark(est, "B55", "COFINS-Imp.", { size: 16 });
  set(est, "H55", real ? fx(`${CM}!AF${CM_TOT}`) : 0, { size: 16, fmt: BRL2, al: "center", border: true });
  dark(est, "B56", "ICMS Antecipado", { size: 16, al: "left" });
  set(est, "H56", semCred ? 0 : fx("H28"), { size: 16, fmt: BRL2, al: "center", border: true });
  dark(est, "B57", "IPI-Imp.", { size: 16 });
  set(est, "H57", semCred ? 0 : fx("H25"), { size: 16, fmt: BRL, border: true });
  dark(est, "B58", "Tributos Recuperáveis", { size: 16 });
  set(est, "H58", fx("SUM(H54:H57)", s.recoverableCreditsTotal), { size: 16, fmt: BRL, border: true });
  dark(est, "B59", "Custo Líquido", { size: 16 });
  dark(est, "H59", "", { size: 16 });
  est.getCell("H59").value = fx("H46+H51+H39-H38-H58", s.netCostTotal);
  est.getCell("H59").numFmt = BRL;

  // ---- Estimativa de custo líquido por item (61..89) ----
  est.mergeCells("B61:E61");
  set(est, "B61", "ESTIMATIVA DE CUSTO LÍQUIDO DO IMPORTADOR - POR ITEM", { size: 16, bold: true, al: "center", border: true });
  dark(est, "B62", "Descrição", { size: 16, al: "center" });
  dark(est, "C62", "Quantidade", { size: 16, al: "center" });
  dark(est, "D62", "Valor dos produtos", { size: 16, al: "center" });
  dark(est, "E62", "Valor unit.", { size: 16, al: "center" });
  for (let r = EST_ITEM0; r <= EST_LAST; r++) {
    ["B", "C", "D", "E"].forEach((col) => {
      const cell = est.getCell(`${col}${r}`);
      cell.border = BOX;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { size: 16, color: { argb: ITEM_TEXT } };
      cell.numFmt = col === "B" ? "@" : col === "C" ? INT : BRL;
    });
  }
  items.forEach((it, i) => {
    const r = EST_ITEM0 + i;
    const cmR = CM_ITEM0 + i;
    est.getCell(`B${r}`).value = fx(`${CM}!G${cmR}`, it.description);
    est.getCell(`C${r}`).value = fx(`${CM}!E${cmR}`, it.quantity);
    est.getCell(`D${r}`).value = fx(`${CM}!AP${cmR}`, it.netTotalCost);
    est.getCell(`E${r}`).value = fx(`D${r}/C${r}`, it.netUnitCost);
  });
  for (let r = EST_ITEM0 + ctx.n + 1; r <= EST_LAST; r++) est.getRow(r).hidden = true;
  set(est, `C${EST_TOT}`, fx(`SUM(C${EST_ITEM0}:C${EST_LAST})`), { size: 16, bold: true, color: ITEM_TEXT, fmt: INT, al: "center" });
  set(est, `D${EST_TOT}`, fx(`SUM(D${EST_ITEM0}:D${EST_LAST})`, s.netCostTotal), { size: 16, bold: true, color: ITEM_TEXT, fmt: BRL, al: "center" });

  // ---- Estimativa de venda (92..105) ----
  const icmsVendaRate = s.salePriceTotal > 0 ? s.icmsVendaTotal / s.salePriceTotal : 0;
  const pisVendaRate = s.salePriceTotal > 0 ? s.pisVendaTotal / s.salePriceTotal : 0;
  const cofinsVendaRate = s.salePriceTotal > 0 ? s.cofinsVendaTotal / s.salePriceTotal : 0;
  const lucroRate = s.salePriceTotal > 0 ? s.lucroDesejadoValor / s.salePriceTotal : 0;
  const irpjRate = 0.25, csllRate = 0.09;

  est.mergeCells("B92:H92");
  set(est, "B92", "ESTIMATIVA DE VENDA", { size: 16, bold: true, al: "center", border: true });
  est.mergeCells("J92:K92");
  set(est, "J92", "LUCRO DESEJADO, IRPJ E CSLL", { size: 16, bold: true, al: "center", border: true });
  set(est, "L92", "TOTAIS", { size: 16, bold: true, al: "center", border: true });

  est.mergeCells("B93:D93");
  set(est, "B93", "ICMS", { size: 16, al: "left", border: true });
  set(est, "F93", icmsVendaRate, { size: 16, fmt: PCT2, border: true });
  set(est, "H93", fx("H98*F93", s.icmsVendaTotal), { size: 16, fmt: BRL2, al: "center", border: true });
  set(est, "J93", "LUCRO DESEJADO", { size: 16, border: true });
  set(est, "K93", lucroRate, { size: 16, fmt: PCT2, bg: YELLOW, border: true });
  set(est, "L93", fx("H98*K93", s.lucroDesejadoValor), { size: 16, fmt: BRL, border: true });

  set(est, "B94", "PIS", { size: 16, al: "left", border: true });
  set(est, "F94", pisVendaRate, { size: 16, fmt: PCT2, border: true });
  set(est, "H94", fx("H98*F94", s.pisVendaTotal), { size: 16, fmt: BRL2, al: "center", border: true });
  set(est, "J94", "IRPJ", { size: 16, border: true });
  set(est, "K94", irpjRate, { size: 16, fmt: PCT2, border: true });
  set(est, "L94", fx("H96*K94", s.irpjValor), { size: 16, fmt: BRL, border: true });

  set(est, "B95", "COFINS", { size: 16, al: "left", border: true });
  set(est, "F95", cofinsVendaRate, { size: 16, fmt: PCT2, border: true });
  set(est, "H95", fx("H98*F95", s.cofinsVendaTotal), { size: 16, fmt: BRL2, al: "center", border: true });
  set(est, "J95", "CSLL", { size: 16, border: true });
  set(est, "K95", csllRate, { size: 16, fmt: PCT2, border: true });
  set(est, "L95", fx("H96*K95", s.csllValor), { size: 16, fmt: BRL, border: true });

  set(est, "B96", "MARGEM", { size: 16, al: "left", border: true });
  set(est, "F96", fx("K93/(1-(K94+K95))", s.margemBruta), { size: 16, fmt: PCT2, border: true });
  set(est, "H96", fx("H98*F96"), { size: 16, fmt: BRL2, al: "center", border: true });
  set(est, "L96", fx("SUM(L93:L95)"), { size: 16, bold: true, fmt: BRL, border: true });

  // Faixas escuras completas (B..H), como no modelo.
  ["C97", "D97", "E97", "F97", "G97", "C98", "D98", "E98", "F98", "G98"].forEach((ref) => dark(est, ref, "", { size: 16 }));
  dark(est, "B97", "MARKUP", { size: 16, al: "left" });
  dark(est, "H97", "", { size: 16, al: "right" });
  est.getCell("H97").value = fx("1-(F93+F94+F95+F96)", s.markupFactor);
  est.getCell("H97").numFmt = MKP4;

  dark(est, "B98", "VALOR DOS PRODUTOS ", { size: 16, al: "left" });
  dark(est, "H98", "", { size: 16 });
  est.getCell("H98").value = fx("H59/H97", s.salePriceTotal);
  est.getCell("H98").numFmt = BRL;

  set(est, "B99", "IPI", { size: 16, al: "left" });
  set(est, "H99", fx(`${CM}!AV${CM_TOT}`, s.ipiVendaTotal), { size: 16, fmt: BRL2, al: "center", border: true });
  set(est, "B100", "ICMS ST", { size: 16, al: "left" });
  set(est, "H100", fx(`${CM}!AW${CM_TOT}`, s.icmsStTotal), { size: 16, fmt: BRL2, al: "center", border: true });
  ["C101", "D101", "E101", "F101", "G101"].forEach((ref) => set(est, ref, "", { size: 16, bold: true, bg: YELLOW, border: true }));
  set(est, "B101", "VALOR TOTAL DA VENDA", { size: 16, bold: true, bg: YELLOW, border: true });
  set(est, "H101", fx("SUM(H98:H100)", s.totalSaleInvoice), { size: 16, bold: true, fmt: RS_PLAIN, bg: YELLOW, border: true });

  set(est, "B102", "ROYALTIES", { size: 16, al: "left", border: true });
  set(est, "H102", fx(`${CM}!E22`, s.royaltiesTotal), { size: 16, fmt: BRL2, al: "center", border: true });
  set(est, "B103", "MARGEM LÍQUIDO ROYALTIES", { size: 16, al: "left", border: true });
  set(est, "H103", fx("H102*K93"), { size: 16, fmt: BRL2, al: "center", border: true });
  set(est, "B104", "VALOR TOTAL ROYALTIES", { size: 16, al: "left", border: true });
  set(est, "H104", fx("SUM(H102:H103)", s.royaltiesComMargem), { size: 16, fmt: BRL2, al: "center", border: true });
  ["C105", "D105", "E105", "F105", "G105"].forEach((ref) => set(est, ref, "", { size: 16, bold: true, bg: YELLOW, border: true }));
  set(est, "B105", "VALOR TOTAL DA OPERAÇÃO COM ROYALTIES", { size: 16, bold: true, bg: YELLOW, border: true });
  set(est, "H105", fx("SUM(H101,H104)", s.totalOperacaoComRoyalties), { size: 16, bold: true, fmt: RS_PLAIN, bg: YELLOW, border: true });

  // ---- Estimativa de venda por item (107..135) ----
  est.mergeCells("B107:K107");
  set(est, "B107", "ESTIMATIVA DE VENDA - POR ITEM", { size: 16, bold: true, al: "center", border: true });
  const vHdr: [string, string][] = [
    ["B", "Descrição"], ["C", "Quantidade"], ["D", "Valor dos produtos"], ["E", "Valor IPI"],
    ["F", "Valor ICMS ST"], ["G", "Valor Total"], ["H", "Valor unit. c/ IPI e ICMS ST"],
    ["I", "Royalties"], ["J", "Valor Total IMP"], ["K", "Valor unit. IMP"],
  ];
  vHdr.forEach(([col, txt]) => dark(est, `${col}108`, txt, { size: 16, al: "center", wrap: true }));
  for (let r = ESTV_ITEM0; r <= ESTV_LAST; r++) {
    vHdr.forEach(([col]) => {
      const cell = est.getCell(`${col}${r}`);
      cell.border = BOX;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { size: 16, color: { argb: ITEM_TEXT } };
      cell.numFmt = col === "B" ? "@" : col === "C" ? INT : BRL;
    });
  }
  items.forEach((it, i) => {
    const r = ESTV_ITEM0 + i;
    const cmR = CM_ITEM0 + i;
    est.getCell(`B${r}`).value = fx(`${CM}!G${cmR}`, it.description);
    est.getCell(`C${r}`).value = fx(`${CM}!E${cmR}`, it.quantity);
    est.getCell(`D${r}`).value = fx(`${CM}!AS${cmR}`, it.salePrice);
    est.getCell(`E${r}`).value = fx(`${CM}!AV${cmR}`, it.ipiVendaValue);
    est.getCell(`F${r}`).value = fx(`${CM}!AW${cmR}`, it.icmsStValue);
    est.getCell(`G${r}`).value = fx(`D${r}+E${r}+F${r}`, it.totalInvoiceValue);
    est.getCell(`H${r}`).value = fx(`G${r}/C${r}`, it.unitInvoiceValue);
    est.getCell(`I${r}`).value = fx(`$H$104*${CM}!L${cmR}`, it.royaltiesAllocated);
    est.getCell(`J${r}`).value = fx(`G${r}+I${r}`, it.totalWithRoyalties);
    est.getCell(`K${r}`).value = fx(`J${r}/C${r}`, it.unitWithRoyalties);
  });
  for (let r = ESTV_ITEM0 + ctx.n + 1; r <= ESTV_LAST; r++) est.getRow(r).hidden = true;
  ["C", "D", "E", "F", "G", "I", "J"].forEach((col) => {
    set(est, `${col}${ESTV_TOT}`, fx(`SUM(${col}${ESTV_ITEM0}:${col}${ESTV_LAST})`),
      { size: 16, bold: true, color: ITEM_TEXT, fmt: col === "C" ? INT : BRL, al: "center" });
  });

  // ============================================================
  // ACRÉSCIMOS ACORDADOS (abaixo da área espelhada 1:1)
  // ============================================================
  let r = ESTV_TOT + 3; // 138
  const put = (label: string, value: number | ExcelJS.CellValue, o: { fmt?: string; boldRow?: boolean } = {}) => {
    dark(est, `B${r}`, label, { size: 16, al: "left" });
    set(est, `H${r}`, value as CellVal, { size: 16, bold: o.boldRow, fmt: o.fmt ?? BRL2, al: "center", border: true });
    r++;
  };
  const header = (txt: string) => {
    est.mergeCells(`B${r}:H${r}`);
    set(est, `B${r}`, txt, { size: 16, bold: true, al: "center", border: true });
    r++;
  };

  if (s.finalidade !== "consumo_proprio" && ctx.internal) {
    header("GANHO DA OPERAÇÃO (visão interna)");
    put("Margem da venda", s.ganho.margemVenda);
    if (s.royaltiesTotal > 0) put("Margem de royalties", s.ganho.margemRoyalties);
    put("Ganho do benefício de ICMS", s.ganho.ganhoIcms);
    put("Ganho total da operação", s.ganho.total, { boldRow: true });
    r++;
  }

  if (ctx.hasBuyer && s.buyer) {
    const b = s.buyer;
    header("ESTIMATIVA DO COMPRADOR - LUCRO REAL");
    put("Custo Líquido do Comprador", b.netCostTotal);
    put("Margem bruta", b.margemBruta, { fmt: PCT2 });
    put("Markup", b.markupFactor, { fmt: MKP4 });
    put("Valor dos Produtos", b.salePriceTotal);
    put("ICMS venda", b.icmsVendaTotal);
    put("IPI venda", b.ipiVendaTotal);
    put("ICMS ST", b.icmsStTotal);
    put("VALOR TOTAL DA VENDA", b.totalSaleInvoice, { boldRow: true });
    put("Lucro desejado (R$)", b.lucroDesejadoValor);
    put("IRPJ", b.irpjValor);
    put("CSLL", b.csllValor);
    r++;
  }

  if (s.finalidade === "consumo_proprio") {
    header("IMPORTAÇÃO PARA CONSUMO PRÓPRIO");
    put("Custo nacionalizado (tributos viram custo)", s.netCostTotal, { boldRow: true });
    r++;
  }

  const warns = [...result.warnings, ...((result as { ncmWarnings?: string[] }).ncmWarnings ?? [])];
  if (warns.length) {
    header("AVISOS");
    warns.forEach((w) => {
      est.mergeCells(`B${r}:H${r}`);
      set(est, `B${r}`, `• ${w}`, { size: 12, al: "left", wrap: true });
      r++;
    });
  }

  // Info de contexto (discreta, abaixo de tudo)
  r++;
  set(est, `B${r}`, `${opts.quotationName}${opts.supplierName ? ` · Fornecedor: ${opts.supplierName}` : ""}${opts.originCountry ? ` (${opts.originCountry})` : ""} · Regime: ${regimeLabel(opts.regime)}`, { size: 10, al: "left" });
  est.getCell(`B${r}`).font = { size: 10, italic: true, color: { argb: "FF888888" } };
}
