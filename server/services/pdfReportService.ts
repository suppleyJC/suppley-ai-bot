import PDFDocument from "pdfkit";

interface ProductResult {
  productName: string;
  sku?: string;
  ncmCode: string;
  quantity: number;
  unit: string;
  fobValueBrl: number;
  cifValueBrl: number;
  totalTaxes: number;
  totalCost: number;
  unitCost: number;
  suggestedPrice: number;
  profit: number;
  profitMargin: number;
  taxes: {
    ii: number;
    ipi: number;
    pis: number;
    cofins: number;
    icms: number;
  };
  // Target price analysis
  targetPrice?: number;
  targetAnalysis?: {
    isViable: boolean;
    grossMarginPercent: number;
    cmvPercent: number;
    maxPurchasePrice: number;
    requiredReduction: number;
  };
}

interface QuotationResult {
  quotationId?: string;
  quotationNumber?: string;
  quotationName?: string;
  quotationStatus?: string;
  supplierName?: string;
  supplierCountry?: string;
  currency: string;
  exchangeRate: number;
  originCountry: string;
  destinationState: string;
  isMercosul: boolean;
  products: ProductResult[];
  totals: {
    totalFobBrl: number;
    totalCifBrl: number;
    totalTaxes: number;
    totalCost: number;
    totalSuggestedPrice: number;
    totalProfit: number;
    averageMargin: number;
  };
  freight: number;
  insurance: number;
  additionalCosts: {
    customsBroker: number;
    storage: number;
    others: number;
  };
  markup: number;
  calculatedAt: Date;
  // Tax regime info
  taxRegime?: 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
  saleTaxes?: {
    pisOnSale: number;
    cofinsOnSale: number;
    icmsOnSale: number;
    irpj: number;
    csll: number;
    simplesTotal: number;
    totalTaxesOnSale: number;
    effectiveRate: number;
  };
  // Viability analysis
  viabilityAnalysis?: {
    isViable: boolean;
    viableProducts: number;
    totalProducts: number;
    averageMargin: number;
    recommendation: string;
  };
}

// SUPPLEY brand colors
const COLORS = {
  darkPurple: "#311260",
  purple: "#682ABA",
  turquoise: "#28E7C5",
  white: "#FFFFFF",
  lightGray: "#F5F5F5",
  darkGray: "#333333",
  mediumGray: "#666666"
};

export async function generateQuotationReport(result: QuotationResult): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          Title: `Relatório de Cotação - ${result.quotationNumber || "Nova Cotação"}`,
          Author: "SUPPLEY Calc",
          Subject: "Análise de Custos de Importação"
        }
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header with logo and title
      drawHeader(doc, result);

      // Quotation summary
      drawQuotationSummary(doc, result);

      // Products table
      drawProductsTable(doc, result.products);

      // Totals section
      drawTotals(doc, result);

      // Tax breakdown
      drawTaxBreakdown(doc, result.products);

      // Sale taxes by regime (if available)
      if (result.taxRegime && result.saleTaxes) {
        drawSaleTaxes(doc, result);
      }

      // Viability analysis (if available)
      if (result.viabilityAnalysis) {
        drawViabilityAnalysis(doc, result);
      }

      // Footer
      drawFooter(doc);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function drawHeader(doc: typeof PDFDocument, result: QuotationResult) {
  const pageWidth = doc.page.width - 100;

  // Purple header bar
  doc.rect(0, 0, doc.page.width, 80).fill(COLORS.darkPurple);

  // Title
  doc.fontSize(24).fillColor(COLORS.white).text("SUPPLEY", 50, 25, { continued: true });
  doc.fontSize(12).text(" Calc", { baseline: "middle" });

  doc.fontSize(10).fillColor(COLORS.turquoise).text("Calculadora de Importação", 50, 50);

  // Date
  const date = new Date(result.calculatedAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  doc.fontSize(9).fillColor(COLORS.white).text(date, doc.page.width - 150, 30, { width: 100, align: "right" });

  // Quotation number
  if (result.quotationNumber) {
    doc.fontSize(9).text(`Cotação: ${result.quotationNumber}`, doc.page.width - 150, 45, { width: 100, align: "right" });
  }

  doc.moveDown(3);
}

function drawQuotationSummary(doc: typeof PDFDocument, result: QuotationResult) {
  const startY = 100;
  const leftCol = 50;
  const rightCol = 300;

  // Section title
  doc.fontSize(14).fillColor(COLORS.darkPurple).text("Resumo da Cotação", leftCol, startY);
  doc.moveTo(leftCol, startY + 18).lineTo(545, startY + 18).strokeColor(COLORS.turquoise).lineWidth(2).stroke();

  let y = startY + 30;

  // Left column
  doc.fontSize(10).fillColor(COLORS.mediumGray);
  doc.text("Fornecedor:", leftCol, y);
  doc.fillColor(COLORS.darkGray).text(result.supplierName || "Não informado", leftCol + 80, y);

  y += 18;
  doc.fillColor(COLORS.mediumGray).text("País de Origem:", leftCol, y);
  doc.fillColor(COLORS.darkGray).text(result.originCountry, leftCol + 80, y);

  y += 18;
  doc.fillColor(COLORS.mediumGray).text("Estado Destino:", leftCol, y);
  doc.fillColor(COLORS.darkGray).text(result.destinationState, leftCol + 80, y);

  y += 18;
  doc.fillColor(COLORS.mediumGray).text("Moeda:", leftCol, y);
  doc.fillColor(COLORS.darkGray).text(result.currency, leftCol + 80, y);

  // Right column
  y = startY + 30;
  doc.fillColor(COLORS.mediumGray).text("Taxa de Câmbio:", rightCol, y);
  doc.fillColor(COLORS.darkGray).text(`R$ ${result.exchangeRate.toFixed(4)}`, rightCol + 90, y);

  y += 18;
  doc.fillColor(COLORS.mediumGray).text("Mercosul:", rightCol, y);
  doc.fillColor(result.isMercosul ? COLORS.turquoise : COLORS.darkGray).text(result.isMercosul ? "Sim (II isento)" : "Não", rightCol + 90, y);

  y += 18;
  doc.fillColor(COLORS.mediumGray).text("Frete Int.:", rightCol, y);
  doc.fillColor(COLORS.darkGray).text(`US$ ${result.freight.toFixed(2)}`, rightCol + 90, y);

  y += 18;
  doc.fillColor(COLORS.mediumGray).text("Seguro:", rightCol, y);
  doc.fillColor(COLORS.darkGray).text(`US$ ${result.insurance.toFixed(2)}`, rightCol + 90, y);

  y += 18;
  doc.fillColor(COLORS.mediumGray).text("Markup:", rightCol, y);
  doc.fillColor(COLORS.darkGray).text(`${result.markup}%`, rightCol + 90, y);

  doc.y = y + 30;
}

function drawProductsTable(doc: typeof PDFDocument, products: ProductResult[]) {
  const startY = doc.y;
  const leftMargin = 50;

  // Section title
  doc.fontSize(14).fillColor(COLORS.darkPurple).text("Produtos da Cotação", leftMargin, startY);
  doc.moveTo(leftMargin, startY + 18).lineTo(545, startY + 18).strokeColor(COLORS.turquoise).lineWidth(2).stroke();

  let y = startY + 30;

  // Table header
  doc.rect(leftMargin, y, 495, 20).fill(COLORS.purple);
  doc.fontSize(8).fillColor(COLORS.white);
  doc.text("Produto", leftMargin + 5, y + 6, { width: 120 });
  doc.text("NCM", leftMargin + 130, y + 6, { width: 60 });
  doc.text("Qtd", leftMargin + 195, y + 6, { width: 30, align: "right" });
  doc.text("FOB (R$)", leftMargin + 230, y + 6, { width: 55, align: "right" });
  doc.text("Impostos", leftMargin + 290, y + 6, { width: 55, align: "right" });
  doc.text("Custo Total", leftMargin + 350, y + 6, { width: 60, align: "right" });
  doc.text("Preço Sug.", leftMargin + 415, y + 6, { width: 60, align: "right" });

  y += 20;

  // Table rows
  products.forEach((product, index) => {
    // Check if we need a new page
    if (y > doc.page.height - 150) {
      doc.addPage();
      y = 50;
    }

    const bgColor = index % 2 === 0 ? COLORS.lightGray : COLORS.white;
    doc.rect(leftMargin, y, 495, 25).fill(bgColor);

    doc.fontSize(8).fillColor(COLORS.darkGray);
    doc.text(truncate(product.productName, 25), leftMargin + 5, y + 5, { width: 120 });
    doc.text(product.ncmCode || "-", leftMargin + 130, y + 5, { width: 60 });
    doc.text(`${product.quantity} ${product.unit}`, leftMargin + 195, y + 5, { width: 30, align: "right" });
    doc.text(formatCurrency(product.fobValueBrl), leftMargin + 230, y + 5, { width: 55, align: "right" });
    doc.text(formatCurrency(product.totalTaxes), leftMargin + 290, y + 5, { width: 55, align: "right" });
    doc.text(formatCurrency(product.totalCost), leftMargin + 350, y + 5, { width: 60, align: "right" });
    doc.fillColor(COLORS.purple).text(formatCurrency(product.suggestedPrice), leftMargin + 415, y + 5, { width: 60, align: "right" });

    // Second line with unit cost and margin
    doc.fontSize(7).fillColor(COLORS.mediumGray);
    doc.text(`Custo unit.: ${formatCurrency(product.unitCost)} | Margem: ${product.profitMargin.toFixed(1)}%`, leftMargin + 5, y + 15, { width: 200 });

    y += 25;
  });

  doc.y = y + 10;
}

function drawTotals(doc: typeof PDFDocument, result: QuotationResult) {
  const startY = doc.y;
  const leftMargin = 50;

  // Check if we need a new page
  if (startY > doc.page.height - 200) {
    doc.addPage();
  }

  // Section title
  doc.fontSize(14).fillColor(COLORS.darkPurple).text("Totais da Cotação", leftMargin, doc.y);
  doc.moveTo(leftMargin, doc.y + 3).lineTo(545, doc.y + 3).strokeColor(COLORS.turquoise).lineWidth(2).stroke();

  doc.moveDown(1);

  // Totals box
  const boxY = doc.y;
  doc.rect(leftMargin, boxY, 495, 100).fill(COLORS.lightGray);

  let y = boxY + 15;
  const col1 = leftMargin + 20;
  const col2 = leftMargin + 180;
  const col3 = leftMargin + 340;

  doc.fontSize(10);

  // Row 1
  doc.fillColor(COLORS.mediumGray).text("Total FOB:", col1, y);
  doc.fillColor(COLORS.darkGray).text(formatCurrency(result.totals.totalFobBrl), col1 + 80, y);

  doc.fillColor(COLORS.mediumGray).text("Total CIF:", col2, y);
  doc.fillColor(COLORS.darkGray).text(formatCurrency(result.totals.totalCifBrl), col2 + 80, y);

  doc.fillColor(COLORS.mediumGray).text("Total Impostos:", col3, y);
  doc.fillColor(COLORS.darkGray).text(formatCurrency(result.totals.totalTaxes), col3 + 90, y);

  // Row 2
  y += 25;
  doc.fillColor(COLORS.mediumGray).text("Custos Adicionais:", col1, y);
  const additionalTotal = result.additionalCosts.customsBroker + result.additionalCosts.storage + result.additionalCosts.others;
  doc.fillColor(COLORS.darkGray).text(formatCurrency(additionalTotal), col1 + 100, y);

  doc.fillColor(COLORS.mediumGray).text("Custo Total:", col2, y);
  doc.fillColor(COLORS.darkGray).text(formatCurrency(result.totals.totalCost), col2 + 80, y);

  // Row 3 - Highlighted
  y += 30;
  doc.rect(col3 - 10, y - 5, 175, 30).fill(COLORS.purple);
  doc.fontSize(11).fillColor(COLORS.white).text("Preço Sugerido:", col3, y);
  doc.fontSize(14).text(formatCurrency(result.totals.totalSuggestedPrice), col3, y + 12);

  // Profit info
  y += 35;
  doc.fontSize(10).fillColor(COLORS.turquoise).text(`Lucro Estimado: ${formatCurrency(result.totals.totalProfit)} (${result.totals.averageMargin.toFixed(1)}%)`, col1, y);

  doc.y = boxY + 115;
}

function drawTaxBreakdown(doc: typeof PDFDocument, products: ProductResult[]) {
  // Check if we need a new page
  if (doc.y > doc.page.height - 150) {
    doc.addPage();
  }

  const leftMargin = 50;

  // Section title
  doc.fontSize(14).fillColor(COLORS.darkPurple).text("Detalhamento de Impostos", leftMargin, doc.y);
  doc.moveTo(leftMargin, doc.y + 3).lineTo(545, doc.y + 3).strokeColor(COLORS.turquoise).lineWidth(2).stroke();

  doc.moveDown(1);

  // Calculate totals
  const taxTotals = products.reduce(
    (acc, p) => ({
      ii: acc.ii + p.taxes.ii,
      ipi: acc.ipi + p.taxes.ipi,
      pis: acc.pis + p.taxes.pis,
      cofins: acc.cofins + p.taxes.cofins,
      icms: acc.icms + p.taxes.icms
    }),
    { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 }
  );

  const y = doc.y;
  const spacing = 90;

  doc.fontSize(9);

  // Tax boxes
  const taxes = [
    { name: "II", value: taxTotals.ii },
    { name: "IPI", value: taxTotals.ipi },
    { name: "PIS", value: taxTotals.pis },
    { name: "COFINS", value: taxTotals.cofins },
    { name: "ICMS", value: taxTotals.icms }
  ];

  taxes.forEach((tax, index) => {
    const x = leftMargin + index * spacing;
    doc.rect(x, y, 80, 40).fill(COLORS.lightGray);
    doc.fillColor(COLORS.mediumGray).text(tax.name, x + 5, y + 8);
    doc.fontSize(11).fillColor(COLORS.darkPurple).text(formatCurrency(tax.value), x + 5, y + 22);
    doc.fontSize(9);
  });

  doc.y = y + 55;
}

function drawSaleTaxes(doc: typeof PDFDocument, result: QuotationResult) {
  // Check if we need a new page
  if (doc.y > doc.page.height - 180) {
    doc.addPage();
  }

  const leftMargin = 50;

  // Section title
  doc.fontSize(14).fillColor(COLORS.darkPurple).text("Impostos sobre Venda (" + getRegimeName(result.taxRegime!) + ")", leftMargin, doc.y);
  doc.moveTo(leftMargin, doc.y + 3).lineTo(545, doc.y + 3).strokeColor(COLORS.turquoise).lineWidth(2).stroke();

  doc.moveDown(1);

  const y = doc.y;
  const taxes = result.saleTaxes!;

  // Tax boxes based on regime
  if (result.taxRegime === 'simples_nacional') {
    doc.rect(leftMargin, y, 200, 50).fill(COLORS.lightGray);
    doc.fontSize(10).fillColor(COLORS.mediumGray).text("Simples Nacional", leftMargin + 10, y + 10);
    doc.fontSize(14).fillColor(COLORS.darkPurple).text(formatCurrency(taxes.simplesTotal / 100), leftMargin + 10, y + 28);
    doc.fontSize(9).fillColor(COLORS.mediumGray).text(`Alíquota efetiva: ${(taxes.effectiveRate / 100).toFixed(2)}%`, leftMargin + 10, y + 45);
  } else {
    const spacing = 95;
    const taxItems = [
      { name: "PIS", value: taxes.pisOnSale / 100 },
      { name: "COFINS", value: taxes.cofinsOnSale / 100 },
      { name: "ICMS", value: taxes.icmsOnSale / 100 },
      { name: "IRPJ", value: taxes.irpj / 100 },
      { name: "CSLL", value: taxes.csll / 100 },
    ];

    taxItems.forEach((tax, index) => {
      const x = leftMargin + index * spacing;
      doc.rect(x, y, 85, 40).fill(COLORS.lightGray);
      doc.fontSize(9).fillColor(COLORS.mediumGray).text(tax.name, x + 5, y + 8);
      doc.fontSize(10).fillColor(COLORS.darkPurple).text(formatCurrency(tax.value), x + 5, y + 22);
    });
  }

  // Total box
  doc.rect(leftMargin + 350, y, 145, 50).fill(COLORS.purple);
  doc.fontSize(10).fillColor(COLORS.white).text("Total Impostos Venda", leftMargin + 360, y + 10);
  doc.fontSize(14).text(formatCurrency(taxes.totalTaxesOnSale / 100), leftMargin + 360, y + 28);

  doc.y = y + 65;
}

function drawViabilityAnalysis(doc: typeof PDFDocument, result: QuotationResult) {
  // Check if we need a new page
  if (doc.y > doc.page.height - 150) {
    doc.addPage();
  }

  const leftMargin = 50;
  const analysis = result.viabilityAnalysis!;

  // Section title
  doc.fontSize(14).fillColor(COLORS.darkPurple).text("Análise de Viabilidade", leftMargin, doc.y);
  doc.moveTo(leftMargin, doc.y + 3).lineTo(545, doc.y + 3).strokeColor(COLORS.turquoise).lineWidth(2).stroke();

  doc.moveDown(1);

  const y = doc.y;
  const bgColor = analysis.isViable ? "#E8F5E9" : "#FFF3E0";
  const borderColor = analysis.isViable ? "#4CAF50" : "#FF9800";

  // Viability box
  doc.rect(leftMargin, y, 495, 80).fill(bgColor);
  doc.rect(leftMargin, y, 5, 80).fill(borderColor);

  // Status icon and text
  const statusText = analysis.isViable ? "COTAÇÃO VIÁVEL" : "COTAÇÃO REQUER AJUSTES";
  const statusColor = analysis.isViable ? "#2E7D32" : "#E65100";
  doc.fontSize(16).fillColor(statusColor).text(statusText, leftMargin + 20, y + 15);

  // Metrics
  doc.fontSize(10).fillColor(COLORS.darkGray);
  doc.text(`Produtos viáveis: ${analysis.viableProducts} de ${analysis.totalProducts}`, leftMargin + 20, y + 40);
  doc.text(`Margem média: ${analysis.averageMargin.toFixed(1)}%`, leftMargin + 200, y + 40);

  // Recommendation
  doc.fontSize(9).fillColor(COLORS.mediumGray).text(analysis.recommendation, leftMargin + 20, y + 58, { width: 460 });

  doc.y = y + 95;
}

function getRegimeName(regime: string): string {
  const names: Record<string, string> = {
    'simples_nacional': 'Simples Nacional',
    'lucro_presumido': 'Lucro Presumido',
    'lucro_real': 'Lucro Real'
  };
  return names[regime] || regime;
}

function drawFooter(doc: typeof PDFDocument) {
  const pageHeight = doc.page.height;

  // Footer bar
  doc.rect(0, pageHeight - 40, doc.page.width, 40).fill(COLORS.darkPurple);

  doc.fontSize(8).fillColor(COLORS.white);
  doc.text("Relatório gerado por SUPPLEY Calc - Calculadora de Importação", 50, pageHeight - 28);
  doc.fillColor(COLORS.turquoise).text("www.suppley.com.br", 50, pageHeight - 16);

  doc.fillColor(COLORS.white).text("Este relatório é uma estimativa e não substitui análise profissional.", doc.page.width - 250, pageHeight - 22, { width: 200, align: "right" });
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}
