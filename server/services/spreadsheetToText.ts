/**
 * spreadsheetToText — converte planilhas (XLSX/XLS/CSV) em texto/Markdown
 * que o LLM consegue ler. O Claude não lê o binário de uma planilha; então
 * extraímos o conteúdo das células e montamos tabelas Markdown por aba.
 *
 * Usado pelo anexo da Excambia: quando o usuário envia um Excel, o conteúdo é
 * transformado em texto e encaminhado ao agente junto da mensagem.
 */
import ExcelJS from "exceljs";

// Proteção contra planilhas enormes no contexto — 1500 linhas cobre qualquer
// cotação real numa passada (o aviso de truncamento segue para o excedente).
const MAX_ROWS_PER_SHEET = 1500;
const MAX_COLS = 40;

/** Tipos MIME de planilha que sabemos processar. */
export const SPREADSHEET_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv", // .csv
  "application/csv",
] as const;

export function isSpreadsheet(mimeType: string, name?: string): boolean {
  if ((SPREADSHEET_MIME_TYPES as readonly string[]).includes(mimeType)) return true;
  const lower = (name || "").toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv");
}

/** Formata um valor de célula do exceljs em string limpa. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    // ExcelJS retorna objetos para fórmulas, hyperlinks, rich text, datas.
    const anyVal = value as any;
    if (anyVal instanceof Date) return anyVal.toLocaleDateString("pt-BR");
    if (typeof anyVal.result !== "undefined") return cellToString(anyVal.result); // fórmula
    // Fórmula sem valor calculado salvo (ex.: TOTAL vazio): não há número a ler.
    if (typeof anyVal.formula !== "undefined" || typeof anyVal.sharedFormula !== "undefined") return "";
    if (typeof anyVal.text !== "undefined") return String(anyVal.text); // hyperlink/rich
    if (Array.isArray(anyVal.richText)) return anyVal.richText.map((r: any) => r.text).join("");
    return JSON.stringify(value);
  }
  // Ruído de ponto flutuante das fórmulas (12330.000000000002 → 12330).
  if (typeof value === "number") return String(Number(value.toPrecision(12)));
  return String(value).trim();
}

/**
 * Converte o buffer de uma planilha em texto Markdown (uma tabela por aba).
 * Best-effort: linhas/colunas vazias são ignoradas; planilhas grandes são truncadas.
 */
export async function spreadsheetBufferToText(
  buffer: Buffer,
  opts: { name?: string; mimeType?: string } = {},
): Promise<string> {
  const isCsv =
    opts.mimeType === "text/csv" ||
    opts.mimeType === "application/csv" ||
    (opts.name || "").toLowerCase().endsWith(".csv");

  const wb = new ExcelJS.Workbook();
  if (isCsv) {
    // exceljs lê CSV a partir de um stream; usamos um Readable em memória.
    const { Readable } = await import("node:stream");
    const stream = Readable.from(buffer);
    await wb.csv.read(stream as any);
  } else {
    await wb.xlsx.load(buffer as any);
  }

  const partes: string[] = [];
  if (opts.name) partes.push(`# Planilha: ${opts.name}`);

  wb.eachSheet((sheet) => {
    const linhas: string[][] = [];
    let maxCols = 0;

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > MAX_ROWS_PER_SHEET) return;
      const valores: string[] = [];
      const ultima = Math.min(row.cellCount, MAX_COLS);
      for (let c = 1; c <= ultima; c++) {
        const cell = row.getCell(c);
        // Célula mesclada: o valor vale UMA vez (na célula-mestre). Repetir o
        // cabeçalho do fornecedor em 11 colunas só confundia a leitura.
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
          valores.push("");
          continue;
        }
        valores.push(cellToString(cell.value));
      }
      // remove células finais vazias
      while (valores.length && valores[valores.length - 1] === "") valores.pop();
      if (valores.some((c) => c !== "")) {
        linhas.push(valores);
        maxCols = Math.max(maxCols, valores.length);
      }
    });

    if (linhas.length === 0) return;

    partes.push(`\n## Aba: ${sheet.name}`);

    // Monta tabela Markdown: primeira linha vira cabeçalho.
    const norm = (arr: string[]) => {
      const c = [...arr];
      while (c.length < maxCols) c.push("");
      return c.map((s) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " "));
    };

    const header = norm(linhas[0]);
    partes.push(`| ${header.join(" | ")} |`);
    partes.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (let i = 1; i < linhas.length; i++) {
      partes.push(`| ${norm(linhas[i]).join(" | ")} |`);
    }

    // Imagens embutidas (foto do produto, carimbo, logo) não viram texto.
    // Dizer isso evita que o modelo afirme ter "visto" a foto.
    const imagens = sheet.getImages?.().length ?? 0;
    if (imagens > 0) {
      partes.push(
        `\n> Esta aba tem ${imagens} imagem(ns) embutida(s) (ex.: foto do produto) que NÃO foram lidas — ` +
        `só o texto das células. Se a imagem trouxer informação necessária, peça para enviá-la como arquivo de imagem.`,
      );
    }

    if (sheet.rowCount > MAX_ROWS_PER_SHEET) {
      partes.push(
        `\n> ⚠️ Planilha truncada: exibindo as primeiras ${MAX_ROWS_PER_SHEET} linhas de ${sheet.rowCount}.`,
      );
    }
  });

  const texto = partes.join("\n").trim();
  return texto || "(Planilha vazia ou sem dados legíveis.)";
}
