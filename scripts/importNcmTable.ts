/**
 * Importador de Tabela NCM — popula/atualiza ncm_tax_rates a partir de
 * arquivo CSV ou XLSX (TEC/TIPI completa).
 *
 * USO:
 *   pnpm tsx scripts/importNcmTable.ts caminho/para/tabela.xlsx
 *   pnpm tsx scripts/importNcmTable.ts caminho/para/tabela.csv
 *
 * FORMATO ESPERADO (cabeçalhos flexíveis, sem distinção de maiúsculas/acentos):
 *   NCM | DESCRICAO | II | IPI | [PIS] | [COFINS] | [II_MERCOSUL]
 *
 * Alíquotas aceitas em qualquer um dos formatos: "12,6", "12.6", "0.126" ou "12,6%".
 * Valores ≤ 1 são tratados como fração (0.126 → 12,6%); valores > 1 como percentual.
 * NCM aceito com ou sem pontos (7308.40.00 ou 73084000).
 */
import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";
import "dotenv/config";
import { upsertNcmTaxRate } from "../server/db";

type Row = Record<string, string>;

const HEADER_ALIASES: Record<string, string[]> = {
  ncm: ["ncm", "codigo", "código", "ncmcode", "codigo ncm"],
  descricao: ["descricao", "descrição", "description", "produto", "nome"],
  ii: ["ii", "ii %", "aliquota ii", "alíquota ii", "tec", "ii(%)"],
  ipi: ["ipi", "ipi %", "tipi", "aliquota ipi", "ipi(%)"],
  pis: ["pis", "pis %", "pis-importacao", "pis importacao"],
  cofins: ["cofins", "cofins %", "cofins-importacao", "cofins importacao"],
  mercosul: ["ii_mercosul", "mercosul", "ii mercosul", "tec mercosul"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function mapHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const n = normalizeHeader(h);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(n) && map[key] === undefined) map[key] = idx;
    }
  });
  if (map.ncm === undefined) {
    throw new Error(`Coluna NCM não encontrada. Cabeçalhos lidos: ${headers.join(" | ")}`);
  }
  return map;
}

/** "12,6" | "12.6" | "0.126" | "12,6%" → basis points (12,6% = 1260) */
function parseRateToBp(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const cleaned = String(raw).replace("%", "").replace(/\./g, (m, i, s) =>
    // mantém o último ponto como decimal se não houver vírgula
    s.includes(",") ? "" : m
  ).replace(",", ".").trim();
  if (cleaned === "" || cleaned.toUpperCase() === "NT") return undefined;
  const num = Number(cleaned);
  if (Number.isNaN(num) || num < 0) return undefined;
  const pct = num <= 1 ? num * 100 : num; // fração → %
  return Math.round(pct * 100);            // % → bp
}

function cleanNcm(raw: string): string {
  return String(raw).replace(/\D/g, "");
}

async function readXlsx(file: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const rows: Row[] = [];
  let headers: string[] = [];
  ws.eachRow((row, n) => {
    const vals = (row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String((v as { result?: unknown }).result ?? v)));
    if (n === 1) headers = vals;
    else {
      const r: Row = {};
      headers.forEach((h, i) => (r[h] = vals[i] ?? ""));
      rows.push(r);
    }
  });
  return rows;
}

function readCsv(file: string): Row[] {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(sep);
    const r: Row = {};
    headers.forEach((h, i) => (r[h] = (vals[i] ?? "").trim()));
    return r;
  });
}

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error("Uso: pnpm tsx scripts/importNcmTable.ts <arquivo.xlsx|arquivo.csv>");
    process.exit(1);
  }

  const ext = path.extname(file).toLowerCase();
  const rows = ext === ".csv" ? readCsv(file) : await readXlsx(file);
  if (rows.length === 0) {
    console.error("Arquivo vazio ou ilegível.");
    process.exit(1);
  }

  const headers = Object.keys(rows[0]);
  const map = mapHeaders(headers);
  const col = (r: Row, key: string) =>
    map[key] !== undefined ? r[headers[map[key]]] : undefined;

  let ok = 0, skipped = 0;
  const errors: string[] = [];

  for (const [i, r] of rows.entries()) {
    const ncm = cleanNcm(col(r, "ncm") ?? "");
    if (ncm.length < 8) { skipped++; continue; } // linhas de capítulo/posição
    const ii = parseRateToBp(col(r, "ii"));
    if (ii === undefined) { skipped++; continue; }

    try {
      await upsertNcmTaxRate({
        ncmCode: ncm.slice(0, 8),
        description: (col(r, "descricao") ?? "").slice(0, 5000) || null,
        iiRate: ii,
        ipiRate: parseRateToBp(col(r, "ipi")) ?? 0,
        pisRate: parseRateToBp(col(r, "pis")) ?? 210,        // 2,1% default legal
        cofinsRate: parseRateToBp(col(r, "cofins")) ?? 1025, // 9,65% + 0,6% LC 224/2025
        mercosulIiRate: parseRateToBp(col(r, "mercosul")) ?? 0,
        notes: `Importado de ${path.basename(file)} em ${new Date().toISOString().slice(0, 10)}`,
      });
      ok++;
      if (ok % 500 === 0) console.log(`... ${ok} NCMs gravados`);
    } catch (e) {
      errors.push(`Linha ${i + 2} (NCM ${ncm}): ${(e as Error).message}`);
      if (errors.length > 20) { console.error("Muitos erros — abortando."); break; }
    }
  }

  console.log(`\n✅ Concluído: ${ok} NCMs gravados/atualizados, ${skipped} linhas ignoradas.`);
  if (errors.length) {
    console.log(`⚠️  ${errors.length} erros:`);
    errors.forEach((e) => console.log("  -", e));
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
