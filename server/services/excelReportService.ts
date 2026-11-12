import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

// Cores SUPPLEY
const COLORS = {
  purple: 'FF311260',
  purpleLight: 'FF682ABA',
  turquoise: 'FF28E7C5',
  white: 'FFFFFFFF',
  gray: 'FFF3F4F6',
  grayDark: 'FF6B7280',
  red: 'FFEF4444',
  green: 'FF22C55E',
  yellow: 'FFFBBF24',
  orange: 'FFF97316',
  lightPurple: 'FFE9D5FF',
  lightGreen: 'FFBBF7D0',
  lightBlue: 'FFBFDBFE',
  lightYellow: 'FFFFF9C4',
};

interface ProductData {
  name: string;
  ncm: string;
  sku?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalUsd: number;
  totalBrl: number;
  targetPrice?: number;
  weight?: number;
  weightUnit?: string;
}

interface TaxBreakdown {
  ii: { rate: number; value: number };
  ipi: { rate: number; value: number };
  pis: { rate: number; value: number };
  cofins: { rate: number; value: number };
  icms: { rate: number; value: number };
}

interface SaleTaxes {
  regime: string;
  irpj: number;
  csll: number;
  pis: number;
  cofins: number;
  icms: number;
  total: number;
}

interface ViabilityAnalysis {
  targetPrice: number;
  suggestedPrice: number;
  isViable: boolean;
  grossMargin: number;
  grossMarginPercent: number;
  netMargin: number;
  netMarginPercent: number;
  maxFobAllowed: number;
  currentFob: number;
  requiredReduction: number;
  requiredReductionPercent: number;
  status: 'VIÁVEL' | 'NEGOCIAR' | 'INVIÁVEL';
  statusColor: string;
}

interface CalculationResult {
  product: ProductData;
  exchangeRate: number;
  fobUsd: number;
  freightUsd: number;
  insuranceUsd: number;
  cifUsd: number;
  fobBrl: number;
  freightBrl: number;
  insuranceBrl: number;
  cifBrl: number;
  taxes: TaxBreakdown;
  totalTaxes: number;
  afrmm: number;
  thc: number;
  siscomex: number;
  liberacao: number;
  portCosts: number;
  storageCosts: number;
  customsBroker: number;
  otherCosts: number;
  totalCustomsCosts: number;
  totalCost: number;
  unitCost: number;
  saleTaxes?: SaleTaxes;
  viability?: ViabilityAnalysis;
}

interface QuotationData {
  quotationName: string;
  supplierName: string;
  originCountry: string;
  destinationPort: string;
  destinationState: string;
  taxRegime: string;
  currency: string;
  markup: number;
  createdAt: Date;
  calculations: CalculationResult[];
  simplesFaixa?: number;
}

// Função para carregar logo
async function loadLogo(workbook: ExcelJS.Workbook): Promise<number | null> {
  try {
    const logoPath = path.join(process.cwd(), 'client', 'public', 'logo-suppley.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      const imageId = workbook.addImage({
        buffer: logoBuffer as unknown as ArrayBuffer,
        extension: 'png',
      });
      return imageId;
    }
  } catch (error) {
    console.error('Erro ao carregar logo:', error);
  }
  return null;
}

// Função para adicionar logo em uma aba
function addLogoToSheet(sheet: ExcelJS.Worksheet, imageId: number, col: number = 0, row: number = 0) {
  sheet.addImage(imageId, {
    tl: { col, row },
    ext: { width: 120, height: 40 },
  });
}

// Configurar aba para ocultar linhas de grade
function configureSheetView(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ showGridLines: false }];
}

export async function generateExcelReport(quotation: QuotationData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SUPPLEY Calc';
  workbook.created = new Date();

  // Carregar logo
  const logoId = await loadLogo(workbook);

  // Aba 1: EST. DE CUSTO (Estimativa de Custo completa)
  const estCustoSheet = workbook.addWorksheet('EST. DE CUSTO', {
    properties: { tabColor: { argb: COLORS.purple } }
  });
  configureSheetView(estCustoSheet);
  await createEstimativaCustoSheet(estCustoSheet, quotation, logoId);

  // Aba 2: CUSTO MERCADORIA (detalhamento por produto)
  const custoSheet = workbook.addWorksheet('CUSTO MERCADORIA', {
    properties: { tabColor: { argb: COLORS.turquoise } }
  });
  configureSheetView(custoSheet);
  await createCustoMercadoriaSheet(custoSheet, quotation, logoId);

  // Aba 3: FORMAÇÃO PREÇO VENDA
  const precoSheet = workbook.addWorksheet('FORMAÇÃO PREÇO', {
    properties: { tabColor: { argb: COLORS.orange } }
  });
  configureSheetView(precoSheet);
  await createFormacaoPrecoSheet(precoSheet, quotation, logoId);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Funções auxiliares de estilo
function setHeaderStyle(cell: ExcelJS.Cell, bgColor: string = COLORS.purple) {
  cell.font = { bold: true, color: { argb: COLORS.white }, name: 'Arial', size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  setBorder(cell);
}

function setLabelStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, name: 'Arial', size: 10 };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
}

function setValueStyle(cell: ExcelJS.Cell) {
  cell.font = { name: 'Arial', size: 10 };
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
  setBorder(cell);
}

function setTitleStyle(cell: ExcelJS.Cell, bgColor: string = COLORS.lightPurple) {
  cell.font = { bold: true, name: 'Arial', size: 12, color: { argb: COLORS.purple } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
  setBorder(cell);
}

function setSectionTitle(cell: ExcelJS.Cell, bgColor: string = COLORS.purple) {
  cell.font = { bold: true, name: 'Arial', size: 11, color: { argb: COLORS.white } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
  setBorder(cell);
}

function setBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  };
}

function setThickBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'medium', color: { argb: COLORS.purple } },
    left: { style: 'medium', color: { argb: COLORS.purple } },
    bottom: { style: 'medium', color: { argb: COLORS.purple } },
    right: { style: 'medium', color: { argb: COLORS.purple } },
  };
}

function setInputStyle(cell: ExcelJS.Cell) {
  cell.font = { name: 'Arial', size: 10 };
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightYellow } };
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.orange } },
    left: { style: 'thin', color: { argb: COLORS.orange } },
    bottom: { style: 'thin', color: { argb: COLORS.orange } },
    right: { style: 'thin', color: { argb: COLORS.orange } },
  };
}

function setTotalStyle(cell: ExcelJS.Cell, bgColor: string = COLORS.lightGreen) {
  cell.font = { bold: true, name: 'Arial', size: 10 };
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  setBorder(cell);
}

// Calcular TTD Santa Catarina
function calcularTTDSantaCatarina(valorICMS: number, tipoOperacao: string = 'importacao'): { creditoPresumido: number; icmsEfetivo: number } {
  // TTD 409 - Importação por conta e ordem ou encomenda
  // Crédito presumido de 75% do ICMS devido
  const percentualCredito = 0.75;
  const creditoPresumido = valorICMS * percentualCredito;
  const icmsEfetivo = valorICMS - creditoPresumido;
  return { creditoPresumido, icmsEfetivo };
}

// Verificar se aplica TTD
function aplicaTTD(estado: string): boolean {
  return estado.toUpperCase() === 'SC';
}

// Obter alíquotas por regime tributário
// Conforme planilha de referência do contador:
// - Lucro Real: ICMS 4% (saída para produtos importados), crédito integral PIS/COFINS
// - Lucro Presumido: PIS 0.65%, COFINS 3%, ICMS 18%
// - Simples Nacional: alíquota única conforme faixa
function getAliquotasVenda(regime: string, simplesFaixa?: number): { pis: number; cofins: number; irpj: number; csll: number; icms: number; ipi: number } {
  switch (regime) {
    case 'simples_nacional':
      // Alíquotas do Simples Nacional por faixa (Anexo I - Comércio)
      const faixas: Record<number, number> = {
        1: 0.04,   // Até 180.000
        2: 0.073,  // 180.000,01 a 360.000
        3: 0.095,  // 360.000,01 a 720.000
        4: 0.107,  // 720.000,01 a 1.800.000
        5: 0.143,  // 1.800.000,01 a 3.600.000
        6: 0.19,   // 3.600.000,01 a 4.800.000
      };
      const aliquotaSimples = faixas[simplesFaixa || 1] || 0.04;
      return { pis: 0, cofins: 0, irpj: 0, csll: 0, icms: aliquotaSimples, ipi: 0 };
    
    case 'lucro_presumido':
      return {
        pis: 0.0065,    // PIS cumulativo
        cofins: 0.03,   // COFINS cumulativo
        irpj: 0.012,    // 15% sobre 8% da receita
        csll: 0.0108,   // 9% sobre 12% da receita
        icms: 0.18,     // ICMS padrão (varia por estado)
        ipi: 0.065,     // IPI padrão
      };
    
    case 'lucro_real':
    default:
      // Conforme planilha do contador - Lucro Real:
      // ICMS saída: 4% (produtos importados)
      // IPI saída: 6.5% (conforme NCM)
      // PIS/COFINS: não-cumulativo com crédito integral na importação
      return {
        pis: 0,         // PIS não-cumulativo - crédito integral na importação
        cofins: 0,      // COFINS não-cumulativo - crédito integral na importação
        irpj: 0,        // IRPJ calculado sobre lucro real (não sobre receita)
        csll: 0,        // CSLL calculado sobre lucro real (não sobre receita)
        icms: 0.04,     // ICMS 4% para produtos importados (saída)
        ipi: 0.065,     // IPI 6.5% conforme NCM 7317.00.90
      };
  }
}

// Aba 1: EST. DE CUSTO - Estimativa completa
async function createEstimativaCustoSheet(sheet: ExcelJS.Worksheet, quotation: QuotationData, logoId: number | null) {
  sheet.columns = [
    { width: 3 },   // A
    { width: 35 },  // B
    { width: 18 },  // C
    { width: 18 },  // D
    { width: 18 },  // E
    { width: 18 },  // F
    { width: 18 },  // G
    { width: 3 },   // H
  ];

  const exchangeRate = quotation.calculations[0]?.exchangeRate || 5.0;
  const firstCalc = quotation.calculations[0];
  const aplicaTTDSC = aplicaTTD(quotation.destinationState);
  
  // Totais calculados
  const totalFobUsd = quotation.calculations.reduce((sum, c) => sum + c.fobUsd, 0);
  const totalFreightUsd = quotation.calculations.reduce((sum, c) => sum + c.freightUsd, 0);
  const totalInsuranceUsd = quotation.calculations.reduce((sum, c) => sum + c.insuranceUsd, 0);
  const totalCifUsd = totalFobUsd + totalFreightUsd + totalInsuranceUsd;
  const totalCifBrl = totalCifUsd * exchangeRate;
  
  const totalII = quotation.calculations.reduce((sum, c) => sum + c.taxes.ii.value, 0);
  const totalIPI = quotation.calculations.reduce((sum, c) => sum + c.taxes.ipi.value, 0);
  const totalPIS = quotation.calculations.reduce((sum, c) => sum + c.taxes.pis.value, 0);
  const totalCOFINS = quotation.calculations.reduce((sum, c) => sum + c.taxes.cofins.value, 0);
  const totalICMS = quotation.calculations.reduce((sum, c) => sum + c.taxes.icms.value, 0);
  const totalSiscomex = quotation.calculations.reduce((sum, c) => sum + c.siscomex, 0);
  const totalAFRMM = quotation.calculations.reduce((sum, c) => sum + c.afrmm, 0);
  
  const totalLiberacao = quotation.calculations.reduce((sum, c) => sum + c.liberacao, 0);
  const totalStorage = quotation.calculations.reduce((sum, c) => sum + c.storageCosts, 0);
  const totalPortCosts = quotation.calculations.reduce((sum, c) => sum + c.portCosts, 0);
  const totalCustomsBroker = quotation.calculations.reduce((sum, c) => sum + c.customsBroker, 0);
  const totalOtherCosts = quotation.calculations.reduce((sum, c) => sum + c.otherCosts, 0);
  
  const totalTributos = totalII + totalIPI + totalPIS + totalCOFINS + totalICMS + totalSiscomex;
  const totalDespesasAduaneiras = totalLiberacao + totalStorage + totalPortCosts + totalCustomsBroker + totalAFRMM;
  
  // TTD SC
  let ttdCredito = 0;
  let icmsEfetivo = totalICMS;
  if (aplicaTTDSC) {
    const ttd = calcularTTDSantaCatarina(totalICMS);
    ttdCredito = ttd.creditoPresumido;
    icmsEfetivo = ttd.icmsEfetivo;
  }
  
  // NF-e de Importação
  const outrasDepNFe = totalPIS + totalCOFINS + totalICMS + totalSiscomex + totalAFRMM;
  const totalNFe = totalCifBrl + totalII + totalIPI + outrasDepNFe;
  
  // Custo líquido
  const custoLiquidoImportacao = totalNFe + totalDespesasAduaneiras - (aplicaTTDSC ? ttdCredito : 0);
  
  // Formação de preço
  const markup = quotation.markup / 100;
  const precoVendaBase = custoLiquidoImportacao * (1 + markup);
  
  // Impostos sobre venda
  const aliquotasVenda = getAliquotasVenda(quotation.taxRegime, quotation.simplesFaixa);
  const icmsVenda = precoVendaBase * aliquotasVenda.icms;
  const pisVenda = precoVendaBase * aliquotasVenda.pis;
  const cofinsVenda = precoVendaBase * aliquotasVenda.cofins;
  
  // Lucro bruto
  const lucroBruto = precoVendaBase - custoLiquidoImportacao - icmsVenda - pisVenda - cofinsVenda;
  
  // Impostos sobre lucro
  const irpjVenda = lucroBruto > 0 ? lucroBruto * aliquotasVenda.irpj : 0;
  const csllVenda = lucroBruto > 0 ? lucroBruto * aliquotasVenda.csll : 0;
  
  // Lucro líquido
  const lucroLiquido = lucroBruto - irpjVenda - csllVenda;
  const margemLiquida = precoVendaBase > 0 ? (lucroLiquido / precoVendaBase) * 100 : 0;
  
  let row = 1;

  // Adicionar logo
  if (logoId !== null) {
    addLogoToSheet(sheet, logoId, 1, 0);
    row = 3;
  }

  // Título principal
  sheet.mergeCells(`B${row}:G${row}`);
  const titleCell = sheet.getCell(`B${row}`);
  titleCell.value = 'ESTIMATIVA DE CUSTO - IMPORTAÇÃO';
  titleCell.font = { bold: true, size: 16, color: { argb: COLORS.white }, name: 'Arial' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.purple } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(row).height = 35;
  row += 2;

  // Dados do Cliente
  sheet.mergeCells(`B${row}:C${row}`);
  setSectionTitle(sheet.getCell(`B${row}`), COLORS.purpleLight);
  sheet.getCell(`B${row}`).value = 'Dados do Cliente';
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Cliente:';
  sheet.getCell(`C${row}`).value = quotation.supplierName || 'Não informado';
  setValueStyle(sheet.getCell(`C${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Estado Destino:';
  sheet.getCell(`C${row}`).value = quotation.destinationState;
  setValueStyle(sheet.getCell(`C${row}`));
  
  if (aplicaTTDSC) {
    sheet.getCell(`D${row}`).value = '✓ TTD 409 Aplicado';
    sheet.getCell(`D${row}`).font = { bold: true, color: { argb: COLORS.green } };
  }
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Regime Tributário:';
  const regimeNome = quotation.taxRegime === 'lucro_real' ? 'Lucro Real' : 
                     quotation.taxRegime === 'lucro_presumido' ? 'Lucro Presumido' : 
                     `Simples Nacional (Faixa ${quotation.simplesFaixa || 1})`;
  sheet.getCell(`C${row}`).value = regimeNome;
  setValueStyle(sheet.getCell(`C${row}`));
  row += 2;

  // Mercadoria / Dados Complementares
  sheet.mergeCells(`B${row}:C${row}`);
  setSectionTitle(sheet.getCell(`B${row}`), COLORS.purpleLight);
  sheet.getCell(`B${row}`).value = 'Mercadoria / Dados Complementares';
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Produto:';
  sheet.getCell(`C${row}`).value = quotation.calculations.length > 1 ? 
    `${quotation.calculations.length} produtos` : 
    quotation.calculations[0]?.product.name || 'Não informado';
  setValueStyle(sheet.getCell(`C${row}`));
  row++;

  // Câmbio e Incoterms lado a lado
  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Data do Câmbio:';
  sheet.getCell(`C${row}`).value = new Date().toLocaleDateString('pt-BR');
  setValueStyle(sheet.getCell(`C${row}`));
  
  setLabelStyle(sheet.getCell(`D${row}`));
  sheet.getCell(`D${row}`).value = 'Câmbio USD:';
  sheet.getCell(`E${row}`).value = exchangeRate;
  sheet.getCell(`E${row}`).numFmt = 'R$ #,##0.0000';
  setInputStyle(sheet.getCell(`E${row}`));
  
  setLabelStyle(sheet.getCell(`F${row}`));
  sheet.getCell(`F${row}`).value = 'Incoterms:';
  sheet.getCell(`G${row}`).value = 'FOB';
  setValueStyle(sheet.getCell(`G${row}`));
  row += 2;

  // VALOR ADUANEIRO
  sheet.mergeCells(`B${row}:C${row}`);
  setSectionTitle(sheet.getCell(`B${row}`), COLORS.turquoise);
  sheet.getCell(`B${row}`).value = 'Valor Aduaneiro';
  sheet.getCell(`B${row}`).font = { bold: true, color: { argb: COLORS.purple } };
  
  sheet.getCell(`E${row}`).value = 'Valor U$';
  setHeaderStyle(sheet.getCell(`E${row}`), COLORS.grayDark);
  sheet.getCell(`F${row}`).value = 'Valor R$';
  setHeaderStyle(sheet.getCell(`F${row}`), COLORS.grayDark);
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Valor FOB';
  sheet.getCell(`E${row}`).value = totalFobUsd;
  sheet.getCell(`E${row}`).numFmt = '$ #,##0.00';
  setValueStyle(sheet.getCell(`E${row}`));
  sheet.getCell(`F${row}`).value = totalFobUsd * exchangeRate;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setValueStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Frete Internacional';
  sheet.getCell(`E${row}`).value = totalFreightUsd;
  sheet.getCell(`E${row}`).numFmt = '$ #,##0.00';
  setInputStyle(sheet.getCell(`E${row}`));
  sheet.getCell(`F${row}`).value = totalFreightUsd * exchangeRate;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setValueStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Seguro';
  sheet.getCell(`E${row}`).value = totalInsuranceUsd;
  sheet.getCell(`E${row}`).numFmt = '$ #,##0.00';
  setInputStyle(sheet.getCell(`E${row}`));
  sheet.getCell(`F${row}`).value = totalInsuranceUsd * exchangeRate;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setValueStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Total - Valor CIF';
  sheet.getCell(`B${row}`).font = { bold: true };
  sheet.getCell(`E${row}`).value = totalCifUsd;
  sheet.getCell(`E${row}`).numFmt = '$ #,##0.00';
  setTotalStyle(sheet.getCell(`E${row}`));
  sheet.getCell(`F${row}`).value = totalCifBrl;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setTotalStyle(sheet.getCell(`F${row}`));
  row += 2;

  // TRIBUTOS DE NACIONALIZAÇÃO
  sheet.mergeCells(`B${row}:C${row}`);
  setSectionTitle(sheet.getCell(`B${row}`), COLORS.lightBlue);
  sheet.getCell(`B${row}`).value = 'Tributos de Nacionalização';
  sheet.getCell(`B${row}`).font = { bold: true, color: { argb: COLORS.purple } };
  
  sheet.getCell(`F${row}`).value = 'Valor R$';
  setHeaderStyle(sheet.getCell(`F${row}`), COLORS.grayDark);
  row++;

  const tributos = [
    { label: 'I.I. (Imposto de Importação)', value: totalII },
    { label: 'IPI-Imp.', value: totalIPI },
    { label: 'PIS-Imp.', value: totalPIS },
    { label: 'COFINS-Imp.', value: totalCOFINS },
    { label: 'ICMS Antecipado', value: totalICMS },
    { label: 'TX Siscomex', value: totalSiscomex },
  ];

  tributos.forEach(t => {
    setLabelStyle(sheet.getCell(`B${row}`));
    sheet.getCell(`B${row}`).value = t.label;
    sheet.getCell(`F${row}`).value = t.value;
    sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
    setValueStyle(sheet.getCell(`F${row}`));
    row++;
  });

  // TTD SC se aplicável
  if (aplicaTTDSC) {
    setLabelStyle(sheet.getCell(`B${row}`));
    sheet.getCell(`B${row}`).value = 'Crédito TTD 409 (75% ICMS)';
    sheet.getCell(`B${row}`).font = { bold: true, color: { argb: COLORS.green } };
    sheet.getCell(`F${row}`).value = -ttdCredito;
    sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
    sheet.getCell(`F${row}`).font = { bold: true, color: { argb: COLORS.green } };
    setValueStyle(sheet.getCell(`F${row}`));
    row++;
  }

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Total Tributos de Nacionalização';
  sheet.getCell(`B${row}`).font = { bold: true };
  sheet.getCell(`F${row}`).value = totalTributos - (aplicaTTDSC ? ttdCredito : 0);
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setTotalStyle(sheet.getCell(`F${row}`), COLORS.lightBlue);
  row += 2;

  // LANÇAMENTOS CUSTOS ADUANEIROS
  sheet.mergeCells(`B${row}:C${row}`);
  setSectionTitle(sheet.getCell(`B${row}`), COLORS.lightPurple);
  sheet.getCell(`B${row}`).value = 'Lançamentos Custos Aduaneiros';
  sheet.getCell(`B${row}`).font = { bold: true, color: { argb: COLORS.purple } };
  
  sheet.getCell(`F${row}`).value = 'Valor R$';
  setHeaderStyle(sheet.getCell(`F${row}`), COLORS.grayDark);
  row++;

  const custosAduaneiros = [
    { label: 'Liberação', value: totalLiberacao },
    { label: 'Armazenagem', value: totalStorage },
    { label: 'Frete interno', value: totalPortCosts },
    { label: 'Despacho Aduaneiro', value: totalCustomsBroker },
    { label: 'AFRMM', value: totalAFRMM },
  ];

  custosAduaneiros.forEach(c => {
    setLabelStyle(sheet.getCell(`B${row}`));
    sheet.getCell(`B${row}`).value = c.label;
    sheet.getCell(`F${row}`).value = c.value;
    sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
    setInputStyle(sheet.getCell(`F${row}`));
    row++;
  });

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Total Despesas Aduaneiras';
  sheet.getCell(`B${row}`).font = { bold: true };
  sheet.getCell(`F${row}`).value = totalDespesasAduaneiras;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setTotalStyle(sheet.getCell(`F${row}`), COLORS.lightPurple);
  row += 2;

  // NF-e DE IMPORTAÇÃO
  sheet.mergeCells(`B${row}:C${row}`);
  setSectionTitle(sheet.getCell(`B${row}`), COLORS.orange);
  sheet.getCell(`B${row}`).value = 'NF-e de Importação';
  sheet.getCell(`B${row}`).font = { bold: true, color: { argb: COLORS.white } };
  
  sheet.getCell(`F${row}`).value = 'Valor R$';
  setHeaderStyle(sheet.getCell(`F${row}`), COLORS.grayDark);
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Produto';
  sheet.getCell(`F${row}`).value = totalCifBrl;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setValueStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'I.I.';
  sheet.getCell(`F${row}`).value = totalII;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setValueStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'IPI-Imp.';
  sheet.getCell(`F${row}`).value = totalIPI;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setValueStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Outras Despesas';
  sheet.getCell(`C${row}`).value = 'PIS+COFINS+ICMS+SISCOMEX+AFRMM';
  sheet.getCell(`C${row}`).font = { italic: true, size: 9, color: { argb: COLORS.grayDark } };
  sheet.getCell(`F${row}`).value = outrasDepNFe;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setValueStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'NF-e Nacionalização';
  sheet.getCell(`B${row}`).font = { bold: true };
  sheet.getCell(`F${row}`).value = totalNFe;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setTotalStyle(sheet.getCell(`F${row}`), COLORS.orange);
  row += 2;

  // CUSTO LÍQUIDO DE IMPORTAÇÃO
  sheet.mergeCells(`B${row}:E${row}`);
  const custoLiqCell = sheet.getCell(`B${row}`);
  custoLiqCell.value = 'CUSTO LÍQUIDO DE IMPORTAÇÃO';
  custoLiqCell.font = { bold: true, size: 14, color: { argb: COLORS.white } };
  custoLiqCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.purple } };
  custoLiqCell.alignment = { horizontal: 'left', vertical: 'middle' };
  
  sheet.getCell(`F${row}`).value = custoLiquidoImportacao;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  sheet.getCell(`F${row}`).font = { bold: true, size: 14, color: { argb: COLORS.white } };
  sheet.getCell(`F${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.purple } };
  sheet.getCell(`F${row}`).alignment = { horizontal: 'right', vertical: 'middle' };
  setThickBorder(sheet.getCell(`F${row}`));
  sheet.getRow(row).height = 30;
  row += 2;

  // FORMAÇÃO DO PREÇO DE VENDA
  sheet.mergeCells(`B${row}:C${row}`);
  setSectionTitle(sheet.getCell(`B${row}`), COLORS.green);
  sheet.getCell(`B${row}`).value = 'Formação do Preço de Venda';
  sheet.getCell(`B${row}`).font = { bold: true, color: { argb: COLORS.white } };
  
  sheet.getCell(`F${row}`).value = 'Valor R$';
  setHeaderStyle(sheet.getCell(`F${row}`), COLORS.grayDark);
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Custo Líquido';
  sheet.getCell(`F${row}`).value = custoLiquidoImportacao;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setValueStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Markup (%)';
  sheet.getCell(`F${row}`).value = markup;
  sheet.getCell(`F${row}`).numFmt = '0.00%';
  setInputStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Preço de Venda Base';
  sheet.getCell(`B${row}`).font = { bold: true };
  sheet.getCell(`F${row}`).value = precoVendaBase;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setTotalStyle(sheet.getCell(`F${row}`), COLORS.lightGreen);
  row += 2;

  // IMPOSTOS SOBRE VENDA
  sheet.mergeCells(`B${row}:C${row}`);
  setSectionTitle(sheet.getCell(`B${row}`), COLORS.red);
  sheet.getCell(`B${row}`).value = `Impostos sobre Venda (${regimeNome})`;
  sheet.getCell(`B${row}`).font = { bold: true, color: { argb: COLORS.white } };
  
  sheet.getCell(`E${row}`).value = 'Alíquota';
  setHeaderStyle(sheet.getCell(`E${row}`), COLORS.grayDark);
  sheet.getCell(`F${row}`).value = 'Valor R$';
  setHeaderStyle(sheet.getCell(`F${row}`), COLORS.grayDark);
  row++;

  if (quotation.taxRegime === 'simples_nacional') {
    setLabelStyle(sheet.getCell(`B${row}`));
    sheet.getCell(`B${row}`).value = 'DAS (Simples Nacional)';
    sheet.getCell(`E${row}`).value = aliquotasVenda.icms;
    sheet.getCell(`E${row}`).numFmt = '0.00%';
    setValueStyle(sheet.getCell(`E${row}`));
    sheet.getCell(`F${row}`).value = icmsVenda;
    sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
    setValueStyle(sheet.getCell(`F${row}`));
    row++;
  } else {
    const impostosVenda = [
      { label: 'ICMS', aliquota: aliquotasVenda.icms, valor: icmsVenda },
      { label: 'PIS', aliquota: aliquotasVenda.pis, valor: pisVenda },
      { label: 'COFINS', aliquota: aliquotasVenda.cofins, valor: cofinsVenda },
    ];

    impostosVenda.forEach(i => {
      setLabelStyle(sheet.getCell(`B${row}`));
      sheet.getCell(`B${row}`).value = i.label;
      sheet.getCell(`E${row}`).value = i.aliquota;
      sheet.getCell(`E${row}`).numFmt = '0.00%';
      setValueStyle(sheet.getCell(`E${row}`));
      sheet.getCell(`F${row}`).value = i.valor;
      sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
      setValueStyle(sheet.getCell(`F${row}`));
      row++;
    });
  }

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Total Impostos sobre Venda';
  sheet.getCell(`B${row}`).font = { bold: true };
  sheet.getCell(`F${row}`).value = icmsVenda + pisVenda + cofinsVenda;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  setTotalStyle(sheet.getCell(`F${row}`), COLORS.lightBlue);
  row += 2;

  // IMPOSTOS SOBRE LUCRO
  if (quotation.taxRegime !== 'simples_nacional') {
    sheet.mergeCells(`B${row}:C${row}`);
    setSectionTitle(sheet.getCell(`B${row}`), COLORS.grayDark);
    sheet.getCell(`B${row}`).value = 'Impostos sobre Lucro';
    sheet.getCell(`B${row}`).font = { bold: true, color: { argb: COLORS.white } };
    
    sheet.getCell(`E${row}`).value = 'Alíquota';
    setHeaderStyle(sheet.getCell(`E${row}`), COLORS.grayDark);
    sheet.getCell(`F${row}`).value = 'Valor R$';
    setHeaderStyle(sheet.getCell(`F${row}`), COLORS.grayDark);
    row++;

    setLabelStyle(sheet.getCell(`B${row}`));
    sheet.getCell(`B${row}`).value = 'IRPJ';
    sheet.getCell(`E${row}`).value = aliquotasVenda.irpj;
    sheet.getCell(`E${row}`).numFmt = '0.00%';
    setValueStyle(sheet.getCell(`E${row}`));
    sheet.getCell(`F${row}`).value = irpjVenda;
    sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
    setValueStyle(sheet.getCell(`F${row}`));
    row++;

    setLabelStyle(sheet.getCell(`B${row}`));
    sheet.getCell(`B${row}`).value = 'CSLL';
    sheet.getCell(`E${row}`).value = aliquotasVenda.csll;
    sheet.getCell(`E${row}`).numFmt = '0.00%';
    setValueStyle(sheet.getCell(`E${row}`));
    sheet.getCell(`F${row}`).value = csllVenda;
    sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
    setValueStyle(sheet.getCell(`F${row}`));
    row++;

    setLabelStyle(sheet.getCell(`B${row}`));
    sheet.getCell(`B${row}`).value = 'Total Impostos sobre Lucro';
    sheet.getCell(`B${row}`).font = { bold: true };
    sheet.getCell(`F${row}`).value = irpjVenda + csllVenda;
    sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
    setTotalStyle(sheet.getCell(`F${row}`), COLORS.gray);
    row += 2;
  }

  // RESULTADO FINAL
  sheet.mergeCells(`B${row}:E${row}`);
  const resultCell = sheet.getCell(`B${row}`);
  resultCell.value = 'RESULTADO FINAL';
  resultCell.font = { bold: true, size: 14, color: { argb: COLORS.white } };
  resultCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.turquoise } };
  resultCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(row).height = 30;
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Lucro Bruto';
  sheet.getCell(`F${row}`).value = lucroBruto;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  sheet.getCell(`F${row}`).font = { bold: true, color: { argb: lucroBruto >= 0 ? COLORS.green : COLORS.red } };
  setValueStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Lucro Líquido';
  sheet.getCell(`F${row}`).value = lucroLiquido;
  sheet.getCell(`F${row}`).numFmt = 'R$ #,##0.00';
  sheet.getCell(`F${row}`).font = { bold: true, color: { argb: lucroLiquido >= 0 ? COLORS.green : COLORS.red } };
  setValueStyle(sheet.getCell(`F${row}`));
  row++;

  setLabelStyle(sheet.getCell(`B${row}`));
  sheet.getCell(`B${row}`).value = 'Margem Líquida (%)';
  sheet.getCell(`F${row}`).value = margemLiquida / 100;
  sheet.getCell(`F${row}`).numFmt = '0.00%';
  sheet.getCell(`F${row}`).font = { bold: true, color: { argb: margemLiquida >= 0 ? COLORS.green : COLORS.red } };
  setValueStyle(sheet.getCell(`F${row}`));
  row += 2;

  // Rodapé
  sheet.mergeCells(`B${row}:G${row}`);
  sheet.getCell(`B${row}`).value = 'SUPPLEY Calc - www.suppley.com.br';
  sheet.getCell(`B${row}`).font = { italic: true, size: 9, color: { argb: COLORS.turquoise } };
  sheet.getCell(`B${row}`).alignment = { horizontal: 'center' };
}

// Aba 2: CUSTO MERCADORIA - Detalhamento por produto (modelo expandido do contador)
async function createCustoMercadoriaSheet(sheet: ExcelJS.Worksheet, quotation: QuotationData, logoId: number | null) {
  const exchangeRate = quotation.calculations[0]?.exchangeRate || 5.0;
  const aplicaTTDSC = aplicaTTD(quotation.destinationState);
  const markup = quotation.markup || 0.30;
  const aliquotasVenda = getAliquotasVenda(quotation.taxRegime, quotation.simplesFaixa);
  
  // Calcular peso total para rateio
  const pesoTotal = quotation.calculations.reduce((sum, c) => sum + (c.product.weight || c.product.quantity), 0);
  const totalDespesas = quotation.calculations.reduce((sum, c) => sum + c.totalCustomsCosts, 0);
  const totalSiscomex = quotation.calculations.reduce((sum, c) => sum + c.siscomex, 0);
  const totalAFRMM = quotation.calculations.reduce((sum, c) => sum + c.afrmm, 0);
  
  // Configurar colunas expandidas (modelo do contador com 58 colunas)
  sheet.columns = [
    { width: 5 },   // A - Item
    { width: 12 },  // B - Código/SKU
    { width: 10 },  // C - Qtd
    { width: 8 },   // D - Un
    { width: 30 },  // E - Descrição
    { width: 12 },  // F - NCM
    { width: 12 },  // G - Valor Unit USD
    { width: 14 },  // H - Valor Total USD
    { width: 10 },  // I - Peso
    { width: 8 },   // J - % Peso
    { width: 14 },  // K - Valor FOB R$
    { width: 12 },  // L - Frete USD
    { width: 14 },  // M - Frete R$
    { width: 12 },  // N - Seguro USD
    { width: 14 },  // O - VLR ADUANEIRO USD
    { width: 14 },  // P - VLR ADUANEIRO R$
    { width: 10 },  // Q - AFRMM
    { width: 10 },  // R - SISCOMEX
    { width: 12 },  // S - Demais Desp.
    { width: 8 },   // T - % II
    { width: 14 },  // U - VALOR II
    { width: 8 },   // V - % IPI
    { width: 14 },  // W - VALOR IPI
    { width: 8 },   // X - % PIS
    { width: 14 },  // Y - VALOR PIS
    { width: 8 },   // Z - % COFINS
    { width: 14 },  // AA - VALOR COFINS
    { width: 14 },  // AB - CRÉDITO COFINS
    { width: 14 },  // AC - BASE ICMS
    { width: 8 },   // AD - % ICMS
    { width: 14 },  // AE - VALOR ICMS
    { width: 14 },  // AF - CUSTO TOTAL
    { width: 12 },  // AG - CUSTO UNIT
    { width: 14 },  // AH - CUSTO LÍQ. IMP
    { width: 10 },  // AI - MKP %
    { width: 14 },  // AJ - PREÇO VENDA
    { width: 8 },   // AK - % ICMS Venda
    { width: 14 },  // AL - ICMS Venda
    { width: 14 },  // AM - IPI Venda
    { width: 14 },  // AN - ICMS ST
    { width: 14 },  // AO - TOTAL NF VENDA
    { width: 14 },  // AP - VLR UNIT C/ IMP
  ];

  let row = 1;

  // Adicionar logo
  if (logoId !== null) {
    addLogoToSheet(sheet, logoId, 0, 0);
    row = 3;
  }

  // Título expandido
  sheet.mergeCells(`A${row}:AP${row}`);
  const titleCell = sheet.getCell(`A${row}`);
  titleCell.value = 'CUSTO MERCADORIA - IMPORTAÇÃO PRÓPRIA';
  titleCell.font = { bold: true, size: 14, color: { argb: COLORS.white }, name: 'Arial' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.purple } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(row).height = 30;
  row++;

  // Informações gerais
  sheet.getCell(`A${row}`).value = 'Fornecedor:';
  setLabelStyle(sheet.getCell(`A${row}`));
  sheet.mergeCells(`B${row}:D${row}`);
  sheet.getCell(`B${row}`).value = quotation.supplierName;
  
  sheet.getCell(`F${row}`).value = 'Taxa Dólar:';
  setLabelStyle(sheet.getCell(`F${row}`));
  sheet.getCell(`G${row}`).value = exchangeRate;
  sheet.getCell(`G${row}`).numFmt = '#,##0.0000';
  setInputStyle(sheet.getCell(`G${row}`));
  
  sheet.getCell(`I${row}`).value = 'Peso Total:';
  setLabelStyle(sheet.getCell(`I${row}`));
  sheet.getCell(`J${row}`).value = pesoTotal;
  sheet.getCell(`J${row}`).numFmt = '#,##0';
  
  sheet.getCell(`L${row}`).value = 'Regime:';
  setLabelStyle(sheet.getCell(`L${row}`));
  sheet.getCell(`M${row}`).value = quotation.taxRegime === 'simples_nacional' ? 'Simples Nacional' : quotation.taxRegime === 'lucro_presumido' ? 'Lucro Presumido' : 'Lucro Real';
  
  if (aplicaTTDSC) {
    sheet.getCell(`O${row}`).value = 'TTD 409 SC Aplicado';
    sheet.getCell(`O${row}`).font = { bold: true, color: { argb: COLORS.green } };
  }
  row += 2;

  // Cabeçalho da tabela expandido (modelo do contador)
  // Grupo 1: Dados do Produto
  sheet.mergeCells(`A${row}:H${row}`);
  sheet.getCell(`A${row}`).value = 'DADOS DO PRODUTO';
  setHeaderStyle(sheet.getCell(`A${row}`), COLORS.purple);
  
  // Grupo 2: Valor Aduaneiro
  sheet.mergeCells(`I${row}:P${row}`);
  sheet.getCell(`I${row}`).value = 'VALOR ADUANEIRO';
  setHeaderStyle(sheet.getCell(`I${row}`), COLORS.purpleLight);
  
  // Grupo 3: Tributos Nacionalização
  sheet.mergeCells(`Q${row}:AE${row}`);
  sheet.getCell(`Q${row}`).value = 'TRIBUTOS DE NACIONALIZAÇÃO';
  setHeaderStyle(sheet.getCell(`Q${row}`), COLORS.orange);
  
  // Grupo 4: Custo Importação
  sheet.mergeCells(`AF${row}:AH${row}`);
  sheet.getCell(`AF${row}`).value = 'CUSTO IMPORTAÇÃO';
  setHeaderStyle(sheet.getCell(`AF${row}`), COLORS.green);
  
  // Grupo 5: Venda
  sheet.mergeCells(`AI${row}:AP${row}`);
  sheet.getCell(`AI${row}`).value = 'CUSTO LÍQUIDO E VENDA';
  setHeaderStyle(sheet.getCell(`AI${row}`), COLORS.turquoise);
  
  sheet.getRow(row).height = 22;
  row++;

  // Subcabeçalhos
  const headers = [
    'Item', 'Código', 'Qtd', 'Un', 'Descrição', 'NCM', 'Unit USD', 'Total USD',
    'Peso', '% Peso', 'FOB R$', 'Frete USD', 'Frete R$', 'Seguro', 'VLR ADU USD', 'VLR ADU R$',
    'AFRMM', 'SISCOMEX', 'Desp.', '% II', 'VALOR II', '% IPI', 'VALOR IPI',
    '% PIS', 'VALOR PIS', '% COFINS', 'VALOR COFINS', 'CRÉD. COFINS', 'BASE ICMS', '% ICMS', 'VALOR ICMS',
    'CUSTO TOTAL', 'CUSTO UNIT', 'CUSTO LÍQ.',
    'MKP %', 'PREÇO VENDA', '% ICMS', 'ICMS', 'IPI', 'ICMS ST', 'TOTAL NF', 'UNIT C/ IMP'
  ];

  headers.forEach((header, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = header;
    // Cores por grupo
    if (idx < 8) setHeaderStyle(cell, COLORS.purple);
    else if (idx < 16) setHeaderStyle(cell, COLORS.purpleLight);
    else if (idx < 31) setHeaderStyle(cell, COLORS.orange);
    else if (idx < 34) setHeaderStyle(cell, COLORS.green);
    else setHeaderStyle(cell, COLORS.turquoise);
  });
  sheet.getRow(row).height = 25;
  row++;

  const dataStartRow = row;

  // Dados dos produtos (modelo expandido do contador)
  quotation.calculations.forEach((calc, idx) => {
    const currentRow = row;
    
    // Cálculos auxiliares
    const peso = calc.product.weight || calc.product.quantity;
    const percPeso = pesoTotal > 0 ? peso / pesoTotal : 0;
    const afrmmRateado = totalAFRMM * percPeso;
    const siscomexRateado = totalSiscomex * percPeso;
    const despesasRateadas = totalDespesas * percPeso;
    
    // Calcular TTD se aplicável
    let icmsValue = calc.taxes.icms.value;
    let creditoCofins = calc.taxes.cofins.value; // Crédito de COFINS na importação
    if (aplicaTTDSC) {
      const ttd = calcularTTDSantaCatarina(calc.taxes.icms.value);
      icmsValue = ttd.icmsEfetivo;
    }
    
    // Base de cálculo do ICMS (cálculo "por dentro")
    const baseICMS = (calc.cifBrl + calc.taxes.ii.value + calc.taxes.ipi.value + calc.taxes.pis.value + calc.taxes.cofins.value) / (1 - calc.taxes.icms.rate);
    
    // Custo total e líquido
    const custoTotal = calc.totalCost - (aplicaTTDSC ? (calc.taxes.icms.value - icmsValue) : 0);
    const custoLiquido = custoTotal; // Pode ser ajustado conforme regras específicas
    
    // Cálculos de venda conforme planilha do contador
    const precoVenda = custoLiquido * (1 + markup);
    const icmsVenda = precoVenda * aliquotasVenda.icms;
    const ipiVenda = precoVenda * aliquotasVenda.ipi; // IPI conforme regime tributário
    const icmsST = 0; // ICMS ST (calcular se necessário)
    const totalNFVenda = precoVenda + ipiVenda + icmsST;
    const valorUnitComImp = totalNFVenda / calc.product.quantity;

    // A - Item
    sheet.getCell(`A${currentRow}`).value = idx + 1;
    sheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center' };
    setBorder(sheet.getCell(`A${currentRow}`));

    // B - Código/SKU
    sheet.getCell(`B${currentRow}`).value = calc.product.sku || '';
    setBorder(sheet.getCell(`B${currentRow}`));

    // C - Qtd
    sheet.getCell(`C${currentRow}`).value = calc.product.quantity;
    sheet.getCell(`C${currentRow}`).numFmt = '#,##0';
    setInputStyle(sheet.getCell(`C${currentRow}`));

    // D - Un
    sheet.getCell(`D${currentRow}`).value = calc.product.unit;
    sheet.getCell(`D${currentRow}`).alignment = { horizontal: 'center' };
    setBorder(sheet.getCell(`D${currentRow}`));

    // E - Descrição
    sheet.getCell(`E${currentRow}`).value = calc.product.name;
    setBorder(sheet.getCell(`E${currentRow}`));

    // F - NCM
    sheet.getCell(`F${currentRow}`).value = calc.product.ncm;
    sheet.getCell(`F${currentRow}`).alignment = { horizontal: 'center' };
    setBorder(sheet.getCell(`F${currentRow}`));

    // G - Valor Unit USD
    sheet.getCell(`G${currentRow}`).value = calc.product.unitPrice;
    sheet.getCell(`G${currentRow}`).numFmt = '$ #,##0.00';
    setInputStyle(sheet.getCell(`G${currentRow}`));

    // H - Valor Total USD
    sheet.getCell(`H${currentRow}`).value = calc.fobUsd;
    sheet.getCell(`H${currentRow}`).numFmt = '$ #,##0.00';
    setBorder(sheet.getCell(`H${currentRow}`));

    // I - Peso
    sheet.getCell(`I${currentRow}`).value = peso;
    sheet.getCell(`I${currentRow}`).numFmt = '#,##0';
    setInputStyle(sheet.getCell(`I${currentRow}`));

    // J - % Peso
    sheet.getCell(`J${currentRow}`).value = percPeso;
    sheet.getCell(`J${currentRow}`).numFmt = '0.00%';
    setBorder(sheet.getCell(`J${currentRow}`));

    // K - FOB R$
    sheet.getCell(`K${currentRow}`).value = calc.fobBrl;
    sheet.getCell(`K${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`K${currentRow}`));

    // L - Frete USD
    sheet.getCell(`L${currentRow}`).value = calc.freightUsd;
    sheet.getCell(`L${currentRow}`).numFmt = '$ #,##0.00';
    setInputStyle(sheet.getCell(`L${currentRow}`));

    // M - Frete R$
    sheet.getCell(`M${currentRow}`).value = calc.freightBrl;
    sheet.getCell(`M${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`M${currentRow}`));

    // N - Seguro
    sheet.getCell(`N${currentRow}`).value = calc.insuranceUsd;
    sheet.getCell(`N${currentRow}`).numFmt = '$ #,##0.00';
    setInputStyle(sheet.getCell(`N${currentRow}`));

    // O - VLR ADUANEIRO USD
    sheet.getCell(`O${currentRow}`).value = calc.cifUsd;
    sheet.getCell(`O${currentRow}`).numFmt = '$ #,##0.00';
    setBorder(sheet.getCell(`O${currentRow}`));

    // P - VLR ADUANEIRO R$
    sheet.getCell(`P${currentRow}`).value = calc.cifBrl;
    sheet.getCell(`P${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`P${currentRow}`));

    // Q - AFRMM (rateado)
    sheet.getCell(`Q${currentRow}`).value = afrmmRateado;
    sheet.getCell(`Q${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`Q${currentRow}`));

    // R - SISCOMEX (rateado)
    sheet.getCell(`R${currentRow}`).value = siscomexRateado;
    sheet.getCell(`R${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`R${currentRow}`));

    // S - Demais Despesas (rateadas)
    sheet.getCell(`S${currentRow}`).value = despesasRateadas;
    sheet.getCell(`S${currentRow}`).numFmt = 'R$ #,##0.00';
    setInputStyle(sheet.getCell(`S${currentRow}`));

    // T - % II
    sheet.getCell(`T${currentRow}`).value = calc.taxes.ii.rate;
    sheet.getCell(`T${currentRow}`).numFmt = '0.00%';
    setBorder(sheet.getCell(`T${currentRow}`));

    // U - VALOR II
    sheet.getCell(`U${currentRow}`).value = calc.taxes.ii.value;
    sheet.getCell(`U${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`U${currentRow}`));

    // V - % IPI
    sheet.getCell(`V${currentRow}`).value = calc.taxes.ipi.rate;
    sheet.getCell(`V${currentRow}`).numFmt = '0.00%';
    setBorder(sheet.getCell(`V${currentRow}`));

    // W - VALOR IPI
    sheet.getCell(`W${currentRow}`).value = calc.taxes.ipi.value;
    sheet.getCell(`W${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`W${currentRow}`));

    // X - % PIS
    sheet.getCell(`X${currentRow}`).value = calc.taxes.pis.rate;
    sheet.getCell(`X${currentRow}`).numFmt = '0.00%';
    setBorder(sheet.getCell(`X${currentRow}`));

    // Y - VALOR PIS
    sheet.getCell(`Y${currentRow}`).value = calc.taxes.pis.value;
    sheet.getCell(`Y${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`Y${currentRow}`));

    // Z - % COFINS
    sheet.getCell(`Z${currentRow}`).value = calc.taxes.cofins.rate;
    sheet.getCell(`Z${currentRow}`).numFmt = '0.00%';
    setBorder(sheet.getCell(`Z${currentRow}`));

    // AA - VALOR COFINS
    sheet.getCell(`AA${currentRow}`).value = calc.taxes.cofins.value;
    sheet.getCell(`AA${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`AA${currentRow}`));

    // AB - CRÉDITO COFINS
    sheet.getCell(`AB${currentRow}`).value = creditoCofins;
    sheet.getCell(`AB${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`AB${currentRow}`));

    // AC - BASE ICMS
    sheet.getCell(`AC${currentRow}`).value = baseICMS;
    sheet.getCell(`AC${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`AC${currentRow}`));

    // AD - % ICMS
    sheet.getCell(`AD${currentRow}`).value = calc.taxes.icms.rate;
    sheet.getCell(`AD${currentRow}`).numFmt = '0.00%';
    setBorder(sheet.getCell(`AD${currentRow}`));

    // AE - VALOR ICMS (com TTD se aplicável)
    sheet.getCell(`AE${currentRow}`).value = icmsValue;
    sheet.getCell(`AE${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`AE${currentRow}`));

    // AF - CUSTO TOTAL
    sheet.getCell(`AF${currentRow}`).value = custoTotal;
    sheet.getCell(`AF${currentRow}`).numFmt = 'R$ #,##0.00';
    sheet.getCell(`AF${currentRow}`).font = { bold: true };
    setBorder(sheet.getCell(`AF${currentRow}`));

    // AG - CUSTO UNIT
    sheet.getCell(`AG${currentRow}`).value = custoTotal / calc.product.quantity;
    sheet.getCell(`AG${currentRow}`).numFmt = 'R$ #,##0.00';
    sheet.getCell(`AG${currentRow}`).font = { bold: true };
    setBorder(sheet.getCell(`AG${currentRow}`));

    // AH - CUSTO LÍQUIDO
    sheet.getCell(`AH${currentRow}`).value = custoLiquido;
    sheet.getCell(`AH${currentRow}`).numFmt = 'R$ #,##0.00';
    sheet.getCell(`AH${currentRow}`).font = { bold: true };
    sheet.getCell(`AH${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGreen } };
    setBorder(sheet.getCell(`AH${currentRow}`));

    // AI - MKP %
    sheet.getCell(`AI${currentRow}`).value = markup;
    sheet.getCell(`AI${currentRow}`).numFmt = '0.00%';
    setInputStyle(sheet.getCell(`AI${currentRow}`));

    // AJ - PREÇO VENDA
    sheet.getCell(`AJ${currentRow}`).value = precoVenda;
    sheet.getCell(`AJ${currentRow}`).numFmt = 'R$ #,##0.00';
    sheet.getCell(`AJ${currentRow}`).font = { bold: true };
    setBorder(sheet.getCell(`AJ${currentRow}`));

    // AK - % ICMS Venda
    sheet.getCell(`AK${currentRow}`).value = aliquotasVenda.icms;
    sheet.getCell(`AK${currentRow}`).numFmt = '0.00%';
    setBorder(sheet.getCell(`AK${currentRow}`));

    // AL - ICMS Venda
    sheet.getCell(`AL${currentRow}`).value = icmsVenda;
    sheet.getCell(`AL${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`AL${currentRow}`));

    // AM - IPI Venda
    sheet.getCell(`AM${currentRow}`).value = ipiVenda;
    sheet.getCell(`AM${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`AM${currentRow}`));

    // AN - ICMS ST
    sheet.getCell(`AN${currentRow}`).value = icmsST;
    sheet.getCell(`AN${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`AN${currentRow}`));

    // AO - TOTAL NF VENDA
    sheet.getCell(`AO${currentRow}`).value = totalNFVenda;
    sheet.getCell(`AO${currentRow}`).numFmt = 'R$ #,##0.00';
    sheet.getCell(`AO${currentRow}`).font = { bold: true };
    sheet.getCell(`AO${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightBlue } };
    setBorder(sheet.getCell(`AO${currentRow}`));

    // AP - VALOR UNIT C/ IMP
    sheet.getCell(`AP${currentRow}`).value = valorUnitComImp;
    sheet.getCell(`AP${currentRow}`).numFmt = 'R$ #,##0.00';
    sheet.getCell(`AP${currentRow}`).font = { bold: true };
    setBorder(sheet.getCell(`AP${currentRow}`));

    row++;
  });

  const dataEndRow = row - 1;

  // Linha de totais expandida
  sheet.getCell(`A${row}`).value = '';
  sheet.getCell(`E${row}`).value = 'TOTAIS';
  sheet.getCell(`E${row}`).font = { bold: true };

  // Aplicar estilo de total para todas as 42 colunas
  for (let col = 1; col <= 42; col++) {
    const cell = sheet.getCell(row, col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightPurple } };
    setBorder(cell);
    cell.font = { bold: true };
  }

  // Calcular totais
  const totais = {
    qtd: quotation.calculations.reduce((sum, c) => sum + c.product.quantity, 0),
    peso: quotation.calculations.reduce((sum, c) => sum + (c.product.weight || c.product.quantity), 0),
    fobUsd: quotation.calculations.reduce((sum, c) => sum + c.fobUsd, 0),
    fobBrl: quotation.calculations.reduce((sum, c) => sum + c.fobBrl, 0),
    freteBrl: quotation.calculations.reduce((sum, c) => sum + c.freightBrl, 0),
    cifUsd: quotation.calculations.reduce((sum, c) => sum + c.cifUsd, 0),
    cifBrl: quotation.calculations.reduce((sum, c) => sum + c.cifBrl, 0),
    afrmm: totalAFRMM,
    siscomex: totalSiscomex,
    despesas: totalDespesas,
    ii: quotation.calculations.reduce((sum, c) => sum + c.taxes.ii.value, 0),
    ipi: quotation.calculations.reduce((sum, c) => sum + c.taxes.ipi.value, 0),
    pis: quotation.calculations.reduce((sum, c) => sum + c.taxes.pis.value, 0),
    cofins: quotation.calculations.reduce((sum, c) => sum + c.taxes.cofins.value, 0),
    icms: quotation.calculations.reduce((sum, c) => sum + c.taxes.icms.value, 0),
    custoTotal: quotation.calculations.reduce((sum, c) => sum + c.totalCost, 0),
  };

  // Aplicar TTD se necessário
  let totalICMS = totais.icms;
  if (aplicaTTDSC) {
    const ttd = calcularTTDSantaCatarina(totalICMS);
    totalICMS = ttd.icmsEfetivo;
    totais.custoTotal -= ttd.creditoPresumido;
  }

  // Calcular totais de venda
  const custoLiqTotal = totais.custoTotal;
  const precoVendaTotal = custoLiqTotal * (1 + markup);
  const icmsVendaTotal = precoVendaTotal * aliquotasVenda.icms;
  const ipiVendaTotal = precoVendaTotal * 0.065;
  const totalNFVendaTotal = precoVendaTotal + ipiVendaTotal;

  // Somas nas colunas corretas
  sheet.getCell(`C${row}`).value = totais.qtd;
  sheet.getCell(`C${row}`).numFmt = '#,##0';
  
  sheet.getCell(`H${row}`).value = totais.fobUsd;
  sheet.getCell(`H${row}`).numFmt = '$ #,##0.00';
  
  sheet.getCell(`I${row}`).value = totais.peso;
  sheet.getCell(`I${row}`).numFmt = '#,##0';
  
  sheet.getCell(`J${row}`).value = 1; // 100%
  sheet.getCell(`J${row}`).numFmt = '0.00%';
  
  sheet.getCell(`K${row}`).value = totais.fobBrl;
  sheet.getCell(`K${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`M${row}`).value = totais.freteBrl;
  sheet.getCell(`M${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`O${row}`).value = totais.cifUsd;
  sheet.getCell(`O${row}`).numFmt = '$ #,##0.00';
  
  sheet.getCell(`P${row}`).value = totais.cifBrl;
  sheet.getCell(`P${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`Q${row}`).value = totais.afrmm;
  sheet.getCell(`Q${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`R${row}`).value = totais.siscomex;
  sheet.getCell(`R${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`S${row}`).value = totais.despesas;
  sheet.getCell(`S${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`U${row}`).value = totais.ii;
  sheet.getCell(`U${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`W${row}`).value = totais.ipi;
  sheet.getCell(`W${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`Y${row}`).value = totais.pis;
  sheet.getCell(`Y${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`AA${row}`).value = totais.cofins;
  sheet.getCell(`AA${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`AB${row}`).value = totais.cofins; // Crédito COFINS
  sheet.getCell(`AB${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`AE${row}`).value = totalICMS;
  sheet.getCell(`AE${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`AF${row}`).value = totais.custoTotal;
  sheet.getCell(`AF${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`AH${row}`).value = custoLiqTotal;
  sheet.getCell(`AH${row}`).numFmt = 'R$ #,##0.00';
  sheet.getCell(`AH${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGreen } };
  
  sheet.getCell(`AJ${row}`).value = precoVendaTotal;
  sheet.getCell(`AJ${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`AL${row}`).value = icmsVendaTotal;
  sheet.getCell(`AL${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`AM${row}`).value = ipiVendaTotal;
  sheet.getCell(`AM${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`AO${row}`).value = totalNFVendaTotal;
  sheet.getCell(`AO${row}`).numFmt = 'R$ #,##0.00';
  sheet.getCell(`AO${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightBlue } };

  row += 2;

  // Rodapé
  sheet.mergeCells(`A${row}:AP${row}`);
  sheet.getCell(`A${row}`).value = 'SUPPLEY Calc - www.suppley.com.br';
  sheet.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: COLORS.turquoise } };
  sheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
}

// Aba 3: FORMAÇÃO PREÇO - Formação do preço de venda
async function createFormacaoPrecoSheet(sheet: ExcelJS.Worksheet, quotation: QuotationData, logoId: number | null) {
  const exchangeRate = quotation.calculations[0]?.exchangeRate || 5.0;
  const aplicaTTDSC = aplicaTTD(quotation.destinationState);
  const aliquotasVenda = getAliquotasVenda(quotation.taxRegime, quotation.simplesFaixa);
  
  sheet.columns = [
    { width: 5 },   // A - Item
    { width: 30 },  // B - Descrição
    { width: 10 },  // C - Qtd
    { width: 14 },  // D - Custo Unit
    { width: 14 },  // E - Custo Total
    { width: 10 },  // F - Markup %
    { width: 14 },  // G - Preço Venda
    { width: 14 },  // H - ICMS
    { width: 14 },  // I - PIS/COFINS
    { width: 14 },  // J - Lucro Bruto
    { width: 14 },  // K - IRPJ/CSLL
    { width: 14 },  // L - Lucro Líquido
    { width: 10 },  // M - Margem %
  ];

  let row = 1;

  // Adicionar logo
  if (logoId !== null) {
    addLogoToSheet(sheet, logoId, 0, 0);
    row = 3;
  }

  // Título
  sheet.mergeCells(`A${row}:M${row}`);
  const titleCell = sheet.getCell(`A${row}`);
  titleCell.value = 'FORMAÇÃO DO PREÇO DE VENDA';
  titleCell.font = { bold: true, size: 14, color: { argb: COLORS.white }, name: 'Arial' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.purple } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(row).height = 30;
  row++;

  // Informações
  const regimeNome = quotation.taxRegime === 'lucro_real' ? 'Lucro Real' : 
                     quotation.taxRegime === 'lucro_presumido' ? 'Lucro Presumido' : 
                     `Simples Nacional (Faixa ${quotation.simplesFaixa || 1})`;
  
  sheet.getCell(`A${row}`).value = 'Regime:';
  setLabelStyle(sheet.getCell(`A${row}`));
  sheet.getCell(`B${row}`).value = regimeNome;
  
  sheet.getCell(`D${row}`).value = 'Markup:';
  setLabelStyle(sheet.getCell(`D${row}`));
  sheet.getCell(`E${row}`).value = quotation.markup / 100;
  sheet.getCell(`E${row}`).numFmt = '0.00%';
  setInputStyle(sheet.getCell(`E${row}`));
  
  if (aplicaTTDSC) {
    sheet.getCell(`G${row}`).value = 'TTD 409 SC Aplicado';
    sheet.getCell(`G${row}`).font = { bold: true, color: { argb: COLORS.green } };
  }
  row += 2;

  // Cabeçalho
  const headers = [
    'Item', 'Descrição', 'Qtd', 'Custo Unit', 'Custo Total',
    'Markup %', 'Preço Venda', 'ICMS', 'PIS/COF',
    'Lucro Bruto', 'IR/CSLL', 'Lucro Líq', 'Margem %'
  ];

  headers.forEach((header, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = header;
    setHeaderStyle(cell, COLORS.purpleLight);
  });
  sheet.getRow(row).height = 25;
  row++;

  const dataStartRow = row;
  const markup = quotation.markup / 100;

  // Dados por produto
  quotation.calculations.forEach((calc, idx) => {
    const currentRow = row;
    
    // Calcular valores
    let custoUnit = calc.unitCost;
    if (aplicaTTDSC) {
      const ttd = calcularTTDSantaCatarina(calc.taxes.icms.value);
      custoUnit = (calc.totalCost - ttd.creditoPresumido) / calc.product.quantity;
    }
    
    const custoTotal = custoUnit * calc.product.quantity;
    const precoVenda = custoTotal * (1 + markup);
    const icmsVenda = precoVenda * aliquotasVenda.icms;
    const pisCofinsVenda = precoVenda * (aliquotasVenda.pis + aliquotasVenda.cofins);
    const lucroBruto = precoVenda - custoTotal - icmsVenda - pisCofinsVenda;
    const irCsll = lucroBruto > 0 ? lucroBruto * (aliquotasVenda.irpj + aliquotasVenda.csll) : 0;
    const lucroLiquido = lucroBruto - irCsll;
    const margem = precoVenda > 0 ? (lucroLiquido / precoVenda) * 100 : 0;

    // A - Item
    sheet.getCell(`A${currentRow}`).value = idx + 1;
    sheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center' };
    setBorder(sheet.getCell(`A${currentRow}`));

    // B - Descrição
    sheet.getCell(`B${currentRow}`).value = calc.product.name;
    setBorder(sheet.getCell(`B${currentRow}`));

    // C - Qtd
    sheet.getCell(`C${currentRow}`).value = calc.product.quantity;
    sheet.getCell(`C${currentRow}`).numFmt = '#,##0';
    setBorder(sheet.getCell(`C${currentRow}`));

    // D - Custo Unit
    sheet.getCell(`D${currentRow}`).value = custoUnit;
    sheet.getCell(`D${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`D${currentRow}`));

    // E - Custo Total
    sheet.getCell(`E${currentRow}`).value = custoTotal;
    sheet.getCell(`E${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`E${currentRow}`));

    // F - Markup %
    sheet.getCell(`F${currentRow}`).value = markup;
    sheet.getCell(`F${currentRow}`).numFmt = '0.00%';
    setInputStyle(sheet.getCell(`F${currentRow}`));

    // G - Preço Venda
    sheet.getCell(`G${currentRow}`).value = precoVenda;
    sheet.getCell(`G${currentRow}`).numFmt = 'R$ #,##0.00';
    sheet.getCell(`G${currentRow}`).font = { bold: true };
    setBorder(sheet.getCell(`G${currentRow}`));

    // H - ICMS
    sheet.getCell(`H${currentRow}`).value = icmsVenda;
    sheet.getCell(`H${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`H${currentRow}`));

    // I - PIS/COFINS
    sheet.getCell(`I${currentRow}`).value = pisCofinsVenda;
    sheet.getCell(`I${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`I${currentRow}`));

    // J - Lucro Bruto
    sheet.getCell(`J${currentRow}`).value = lucroBruto;
    sheet.getCell(`J${currentRow}`).numFmt = 'R$ #,##0.00';
    sheet.getCell(`J${currentRow}`).font = { color: { argb: lucroBruto >= 0 ? COLORS.green : COLORS.red } };
    setBorder(sheet.getCell(`J${currentRow}`));

    // K - IR/CSLL
    sheet.getCell(`K${currentRow}`).value = irCsll;
    sheet.getCell(`K${currentRow}`).numFmt = 'R$ #,##0.00';
    setBorder(sheet.getCell(`K${currentRow}`));

    // L - Lucro Líquido
    sheet.getCell(`L${currentRow}`).value = lucroLiquido;
    sheet.getCell(`L${currentRow}`).numFmt = 'R$ #,##0.00';
    sheet.getCell(`L${currentRow}`).font = { bold: true, color: { argb: lucroLiquido >= 0 ? COLORS.green : COLORS.red } };
    setBorder(sheet.getCell(`L${currentRow}`));

    // M - Margem %
    sheet.getCell(`M${currentRow}`).value = margem / 100;
    sheet.getCell(`M${currentRow}`).numFmt = '0.00%';
    sheet.getCell(`M${currentRow}`).font = { bold: true, color: { argb: margem >= 0 ? COLORS.green : COLORS.red } };
    setBorder(sheet.getCell(`M${currentRow}`));

    row++;
  });

  const dataEndRow = row - 1;

  // Linha de totais
  sheet.getCell(`B${row}`).value = 'TOTAIS';
  sheet.getCell(`B${row}`).font = { bold: true };

  for (let col = 1; col <= 13; col++) {
    const cell = sheet.getCell(row, col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightPurple } };
    setBorder(cell);
    cell.font = { bold: true };
  }

  // Calcular totais
  let totalCusto = 0;
  let totalPrecoVenda = 0;
  let totalICMS = 0;
  let totalPisCofins = 0;
  let totalLucroBruto = 0;
  let totalIrCsll = 0;
  let totalLucroLiquido = 0;

  quotation.calculations.forEach(calc => {
    let custoUnit = calc.unitCost;
    if (aplicaTTDSC) {
      const ttd = calcularTTDSantaCatarina(calc.taxes.icms.value);
      custoUnit = (calc.totalCost - ttd.creditoPresumido) / calc.product.quantity;
    }
    
    const custoTotal = custoUnit * calc.product.quantity;
    const precoVenda = custoTotal * (1 + markup);
    const icmsVenda = precoVenda * aliquotasVenda.icms;
    const pisCofinsVenda = precoVenda * (aliquotasVenda.pis + aliquotasVenda.cofins);
    const lucroBruto = precoVenda - custoTotal - icmsVenda - pisCofinsVenda;
    const irCsll = lucroBruto > 0 ? lucroBruto * (aliquotasVenda.irpj + aliquotasVenda.csll) : 0;
    const lucroLiquido = lucroBruto - irCsll;

    totalCusto += custoTotal;
    totalPrecoVenda += precoVenda;
    totalICMS += icmsVenda;
    totalPisCofins += pisCofinsVenda;
    totalLucroBruto += lucroBruto;
    totalIrCsll += irCsll;
    totalLucroLiquido += lucroLiquido;
  });

  const margemTotal = totalPrecoVenda > 0 ? (totalLucroLiquido / totalPrecoVenda) * 100 : 0;

  sheet.getCell(`C${row}`).value = quotation.calculations.reduce((sum, c) => sum + c.product.quantity, 0);
  sheet.getCell(`C${row}`).numFmt = '#,##0';
  
  sheet.getCell(`E${row}`).value = totalCusto;
  sheet.getCell(`E${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`G${row}`).value = totalPrecoVenda;
  sheet.getCell(`G${row}`).numFmt = 'R$ #,##0.00';
  sheet.getCell(`G${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGreen } };
  
  sheet.getCell(`H${row}`).value = totalICMS;
  sheet.getCell(`H${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`I${row}`).value = totalPisCofins;
  sheet.getCell(`I${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`J${row}`).value = totalLucroBruto;
  sheet.getCell(`J${row}`).numFmt = 'R$ #,##0.00';
  sheet.getCell(`J${row}`).font = { bold: true, color: { argb: totalLucroBruto >= 0 ? COLORS.green : COLORS.red } };
  
  sheet.getCell(`K${row}`).value = totalIrCsll;
  sheet.getCell(`K${row}`).numFmt = 'R$ #,##0.00';
  
  sheet.getCell(`L${row}`).value = totalLucroLiquido;
  sheet.getCell(`L${row}`).numFmt = 'R$ #,##0.00';
  sheet.getCell(`L${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalLucroLiquido >= 0 ? COLORS.lightGreen : COLORS.red } };
  sheet.getCell(`L${row}`).font = { bold: true, color: { argb: totalLucroLiquido >= 0 ? COLORS.green : COLORS.red } };
  
  sheet.getCell(`M${row}`).value = margemTotal / 100;
  sheet.getCell(`M${row}`).numFmt = '0.00%';
  sheet.getCell(`M${row}`).font = { bold: true, color: { argb: margemTotal >= 0 ? COLORS.green : COLORS.red } };

  row += 2;

  // Rodapé
  sheet.mergeCells(`A${row}:M${row}`);
  sheet.getCell(`A${row}`).value = 'SUPPLEY Calc - www.suppley.com.br';
  sheet.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: COLORS.turquoise } };
  sheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
}
