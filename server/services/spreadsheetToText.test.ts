/**
 * Leitura de planilha que o modelo recebe. Caso real: cotação de abraçadeiras
 * com o cabeçalho mesclado repetido em 11 colunas, a linha TOTAL com fórmula
 * sem valor salvo ({"formula":"H21*0.3"}) e pesos como 12330.000000000002.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { spreadsheetBufferToText } from "./spreadsheetToText";

async function planilha(montar: (ws: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  montar(wb.addWorksheet("Cotação"));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("spreadsheetBufferToText", () => {
  it("valor de célula mesclada aparece uma vez só", async () => {
    const buf = await planilha((ws) => {
      ws.getCell("A1").value = "ZHEJIANG JIAXING TUYUE";
      ws.mergeCells("A1:K1");
      ws.getCell("A2").value = "item";
    });
    const txt = await spreadsheetBufferToText(buf);
    expect(txt.match(/ZHEJIANG JIAXING TUYUE/g)).toHaveLength(1);
  });

  it("fórmula sem valor calculado não vira JSON e float sai limpo", async () => {
    const buf = await planilha((ws) => {
      ws.getCell("A1").value = "TOTAL";
      ws.getCell("B1").value = { formula: "H21*0.3" } as any;
      ws.getCell("C1").value = { formula: "F19*E19/1000", result: 12330.000000000002 } as any;
    });
    const txt = await spreadsheetBufferToText(buf);
    expect(txt).not.toContain("formula");
    expect(txt).toContain("| TOTAL |  | 12330 |");
  });
});
