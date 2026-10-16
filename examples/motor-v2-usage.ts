/**
 * Motor V2 Usage Examples
 *
 * This file demonstrates how to use the advanced Motor V2 import cost engine
 * for precision calculations with Brazilian tax compliance.
 */

// ============================================================
// Example 1: Simple Single Product Calculation
// ============================================================

import { calculateEstimativa } from "../server/services/estimativaService";

async function example1_simpleProduct() {
  const result = await calculateEstimativa({
    products: [
      {
        productName: "Microcontroller STM32",
        ncmCode: "85423190",
        quantity: 5000,
        unit: "UN",
        unitPrice: 8.50,
      },
    ],
    exchangeRate: 5.25,
    currency: "USD",
    freight: 1200, // USD
    insurance: 300, // USD
    armazenagemBrl: 1000,
    despachoAduaneiroBrl: 500,
    taxRegime: "lucro_real",
  });

  console.log("=== Example 1: Simple Product ===");
  console.log(`Total FOB (BRL): R$ ${result.summary.fobTotalBrl.toFixed(2)}`);
  console.log(
    `Total Taxes: R$ ${result.summary.taxesTotal.toFixed(2)}`
  );
  console.log(
    `Sale Price: R$ ${result.items[0].salePrice.toFixed(2)}`
  );
  console.log(`Unit Cost: R$ ${result.items[0].unitCost.toFixed(2)}`);
}

// ============================================================
// Example 2: Multiple Products with TTD Benefit
// ============================================================

async function example2_multipleProducts() {
  const result = await calculateEstimativa({
    products: [
      {
        productName: "PCB Assembly",
        ncmCode: "85423090",
        quantity: 1000,
        unit: "UN",
        unitPrice: 25.00,
      },
      {
        productName: "Display Module",
        ncmCode: "85437090",
        quantity: 1000,
        unit: "UN",
        unitPrice: 12.50,
      },
    ],
    exchangeRate: 5.25,
    currency: "USD",
    freight: 3500,
    insurance: 700,
    afrmmBrl: 875, // 25% of 3500 BRL converted
    siscomexBrl: 154.23,
    armazenagemBrl: 2000,

    // TTD Phase 1 (primeiros 36 meses): ICMS 2.6%
    ttdPhase: "primeiros_36m",
    // Apply LC 224/2025 COFINS (0.6% additional)
    applyCofinsLc224: true,

    taxRegime: "lucro_real",
    lucroDesejado: 0.08, // 8% desired profit
  });

  console.log("\n=== Example 2: Multiple Products with TTD ===");
  result.items.forEach((item, i) => {
    console.log(`\nProduct ${i + 1}: ${item.description}`);
    console.log(`  FOB (BRL): R$ ${item.fobBrl.toFixed(2)}`);
    console.log(`  II: R$ ${item.iiValue.toFixed(2)}`);
    console.log(`  IPI: R$ ${item.ipiValue.toFixed(2)}`);
    console.log(`  ICMS (TTD 2.6%): R$ ${item.icmsValue.toFixed(2)}`);
    console.log(`  Total Cost: R$ ${item.totalCost.toFixed(2)}`);
    console.log(`  Sale Price: R$ ${item.salePrice.toFixed(2)}`);
  });
  console.log(`\nTotal Taxes: R$ ${result.summary.taxesTotal.toFixed(2)}`);
  console.log(`ICMS Efetivo: R$ ${result.summary.icmsTotal.toFixed(2)}`);
}

// ============================================================
// Example 3: Tax Regime Comparison
// ============================================================

async function example3_taxRegimeComparison() {
  const baseInput = {
    products: [
      {
        productName: "Electronic Component",
        ncmCode: "85423190",
        quantity: 1000,
        unit: "UN",
        unitPrice: 15.00,
      },
    ],
    exchangeRate: 5.25,
    currency: "USD",
    freight: 800,
    insurance: 200,
    armazenagemBrl: 500,
  };

  const regimes = ["lucro_real", "lucro_presumido", "simples_nacional"] as const;
  const results: Record<string, any> = {};

  for (const regime of regimes) {
    results[regime] = await calculateEstimativa({
      ...baseInput,
      taxRegime: regime,
    });
  }

  console.log("\n=== Example 3: Tax Regime Comparison ===");
  regimes.forEach((regime) => {
    const result = results[regime];
    const item = result.items[0];
    console.log(`\n${regime.toUpperCase()}:`);
    console.log(`  Cost Total: R$ ${item.totalCost.toFixed(2)}`);
    console.log(`  Sale Price: R$ ${item.salePrice.toFixed(2)}`);
    console.log(`  PIS (sale): R$ ${item.pisVendaValue?.toFixed(2) || "N/A"}`);
    console.log(`  COFINS (sale): R$ ${item.cofinsVendaValue?.toFixed(2) || "N/A"}`);
  });
}

// ============================================================
// Example 4: Tax Rate Overrides
// ============================================================

async function example4_taxOverrides() {
  const result = await calculateEstimativa({
    products: [
      {
        productName: "Specialized Equipment",
        ncmCode: "84293090",
        quantity: 50,
        unit: "UN",
        unitPrice: 2500.00,
        // Custom tax rates (overrides NCM lookup)
        iiRateOverride: 0.00, // 0% (tariff exemption)
        ipiRateOverride: 0.05, // 5% custom
      },
    ],
    exchangeRate: 5.25,
    currency: "USD",
    freight: 5000,
    insurance: 1000,

    // Override import PIS/COFINS
    pisImportRateOverride: 0.01, // 1% custom
    cofinsImportRateOverride: 0.08, // 8% custom

    // Negotiate ICMS rate with client
    icmsNegociadoClienteRate: 0.07, // 7% to client (spread benefit)

    taxRegime: "lucro_real",
  });

  console.log("\n=== Example 4: Custom Tax Overrides ===");
  const item = result.items[0];
  console.log(`II (0% exemption): R$ ${item.iiValue.toFixed(2)}`);
  console.log(`IPI (5% custom): R$ ${item.ipiValue.toFixed(2)}`);
  console.log(`PIS (1% custom): R$ ${item.pisValue.toFixed(2)}`);
  console.log(`COFINS (8% custom): R$ ${item.cofinsValue.toFixed(2)}`);
  console.log(`ICMS (negociado): R$ ${item.icmsClienteValue.toFixed(2)}`);
  console.log(`Trading benefit (spread): R$ ${item.ganhoBeneficioIcms.toFixed(2)}`);
  console.log(`\nClient Invoice Total: R$ ${item.totalInvoiceValue.toFixed(2)}`);
}

// ============================================================
// Example 5: Excel Export (Accountant Format)
// ============================================================

import { generateEstimativaExcel } from "../server/services/excelEstimativaService";

async function example5_excelExport() {
  const result = await calculateEstimativa({
    products: [
      {
        productName: "Industrial Motor",
        ncmCode: "85023000",
        quantity: 20,
        unit: "UN",
        unitPrice: 450.00,
      },
    ],
    exchangeRate: 5.25,
    currency: "USD",
    freight: 2000,
    insurance: 400,
    afrmmBrl: 500,
    siscomexBrl: 154.23,
    armazenagemBrl: 1500,
    despachoAduaneiroBrl: 400,

    taxRegime: "lucro_real",
    ttdPhase: "primeiros_36m",
    applyCofinsLc224: true,
  });

  // Generate Excel for accountant (internal = exposes TTD benefit calculation)
  const buffer = await generateEstimativaExcel(result, {
    quotationName: "EST-001-MOTOR-2026",
    supplierName: "Supplier Industrial Ltd.",
    originCountry: "China",
    clientName: "SUPPLEY Trading",
    regime: "lucro_real",
    currency: "USD",
    mode: "internal", // Shows TTD benefit details
  });

  console.log("\n=== Example 5: Excel Export ===");
  console.log(`Excel buffer generated: ${buffer.length} bytes`);
  console.log(`Save as: EST-001-MOTOR-2026.xlsx`);
}

// ============================================================
// Run Examples
// ============================================================

async function runAllExamples() {
  try {
    await example1_simpleProduct();
    await example2_multipleProducts();
    await example3_taxRegimeComparison();
    await example4_taxOverrides();
    await example5_excelExport();
  } catch (error) {
    console.error("Error running examples:", error);
  }
}

// Export for testing
export { example1_simpleProduct, example2_multipleProducts, example3_taxRegimeComparison, example4_taxOverrides, example5_excelExport, runAllExamples };

// Uncomment to run:
// runAllExamples().then(() => console.log("\nAll examples completed!"));
