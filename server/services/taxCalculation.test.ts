import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTaxRatesForNcm, calculateImportTaxes, isMercosulCountry, calculateSellingPrice, calculateMargin, calculateSaleTaxes, calculateAFRMM, calculateSiscomex, calculateSimplesEffectiveRate, calculateDIFAL, calculateTargetPriceAnalysis } from './taxCalculationService';

// Mock do db.ts
vi.mock('../db', () => ({
  getNcmTaxRate: vi.fn().mockResolvedValue({
    ncmCode: '7317.00.90',
    iiRate: 1400, // 14%
    ipiRate: 650, // 6.5%
    pisRate: 210, // 2.1% (atualizado 2026)
    cofinsRate: 1025, // 10.25% (9.65% + 0.6% acréscimo LC 224/2025)
    mercosulIiRate: 0,
  }),
  getIcmsRate: vi.fn().mockResolvedValue({
    stateCode: 'SC',
    stateName: 'Santa Catarina',
    internalRate: 1700, // 17%
    importRate: 400, // 4% (interestadual)
    icmsAntecipadoRate: 100, // 1% (antecipado na importação - TTD 409 após 36m)
    interstateRate: 1200, // 12%
    hasIncentive: true,
  }),
  // Parâmetros versionados/ex-tarifário: vazio → fallback p/ constantes 2026.
  getActiveTaxParameters: vi.fn().mockResolvedValue({}),
  getActiveNcmException: vi.fn().mockResolvedValue(null),
}));

describe('Tax Calculation Service - 2026', () => {
  describe('isMercosulCountry', () => {
    it('deve identificar países do Mercosul', () => {
      expect(isMercosulCountry('Paraguai')).toBe(true);
      expect(isMercosulCountry('Paraguay')).toBe(true);
      expect(isMercosulCountry('Argentina')).toBe(true);
      expect(isMercosulCountry('Uruguai')).toBe(true);
    });

    it('deve retornar false para países fora do Mercosul', () => {
      expect(isMercosulCountry('China')).toBe(false);
      expect(isMercosulCountry('Estados Unidos')).toBe(false);
      expect(isMercosulCountry('Alemanha')).toBe(false);
    });
  });

  describe('getTaxRatesForNcm', () => {
    it('deve retornar ICMS Antecipado (1%) para importação em SC após 36 meses', async () => {
      const rates = await getTaxRatesForNcm('7317.00.90', 'SC', false);
      expect(rates.icms).toBe(100); // 1% TTD 409 após 36m
      expect(rates.ii).toBe(1400);
      expect(rates.ipi).toBe(650);
      expect(rates.pis).toBe(210);
      expect(rates.cofins).toBe(1025);
    });

    it('deve retornar ICMS Antecipado (2.6%) para primeiros 36 meses', async () => {
      const rates = await getTaxRatesForNcm('7317.00.90', 'SC', false, 'primeiros_36m');
      expect(rates.icms).toBe(260); // 2.6% TTD 409 primeiros 36m
    });

    it('deve zerar II para produtos do Mercosul', async () => {
      const rates = await getTaxRatesForNcm('7317.00.90', 'SC', true);
      expect(rates.ii).toBe(0);
    });
  });

  describe('calculateImportTaxes', () => {
    it('deve calcular impostos corretamente para importação da China em SC', async () => {
      const result = await calculateImportTaxes({
        cifValueCents: 1000000, // R$ 10.000,00
        ncmCode: '7317.00.90',
        originCountry: 'China',
        destinationState: 'SC',
        freightCents: 200000, // R$ 2.000 de frete marítimo
        numItems: 3,
      });

      // ICMS usa alíquota de 1% (antecipado TTD 409)
      expect(result.rates.icms).toBe(100);
      
      // II: 14% × R$ 10.000 = R$ 1.400
      expect(result.values.iiValueCents).toBe(140000);
      
      // IPI: 6.5% × (R$ 10.000 + R$ 1.400) = 6.5% × R$ 11.400 = R$ 741
      expect(result.values.ipiValueCents).toBe(74100);
      
      // PIS: 2.1% × R$ 10.000 (CIF) = R$ 210
      expect(result.values.pisValueCents).toBe(21000);
      
      // COFINS: 10.25% × R$ 10.000 (CIF) = R$ 1.025
      expect(result.values.cofinsValueCents).toBe(102500);
      
      // AFRMM: 8% × R$ 2.000 = R$ 160 (longo curso, Lei 14.301/2022)
      expect(result.values.afrmmValueCents).toBe(16000);
      
      // Siscomex: R$ 185 + 2 × R$ 29,50 = R$ 244
      expect(result.values.siscomexValueCents).toBe(18500 + 2 * 2950);
      
      // ICMS: 1% × (CIF + II + IPI + PIS + COFINS) = 1% × base
      // Base = 1.000.000 + 140.000 + 74.100 + 21.000 + 102.500 = 1.337.600
      // ICMS = 1% × 1.337.600 = 13.376
      expect(result.values.icmsValueCents).toBe(13376);
      
      // Não é Mercosul
      expect(result.isMercosulPreferential).toBe(false);
    });

    it('deve aplicar isenção de II para Mercosul', async () => {
      const result = await calculateImportTaxes({
        cifValueCents: 1000000,
        ncmCode: '7317.00.90',
        originCountry: 'Paraguai',
        destinationState: 'SC',
        isMercosul: true,
      });

      expect(result.values.iiValueCents).toBe(0);
      expect(result.isMercosulPreferential).toBe(true);
    });

    it('deve calcular PIS/COFINS sobre CIF (não sobre CIF+II+IPI)', async () => {
      const result = await calculateImportTaxes({
        cifValueCents: 500000, // R$ 5.000
        ncmCode: '7317.00.90',
        originCountry: 'China',
        destinationState: 'SC',
      });

      // PIS base = CIF = R$ 5.000 (não CIF + II + IPI)
      expect(result.breakdown.basePISCOFINS).toBe(500000);
      // PIS = 2.1% × 5.000 = R$ 105
      expect(result.values.pisValueCents).toBe(10500);
      // COFINS = 10.25% × 5.000 = R$ 512,50
      expect(result.values.cofinsValueCents).toBe(51250);
    });
  });

  describe('calculateSellingPrice', () => {
    it('deve calcular preço com markup de 30%', () => {
      expect(calculateSellingPrice(100000, 3000)).toBe(130000);
    });

    it('deve calcular preço com markup de 50%', () => {
      expect(calculateSellingPrice(200000, 5000)).toBe(300000);
    });
  });

  describe('calculateMargin', () => {
    it('deve calcular margem corretamente', () => {
      const margin = calculateMargin(130000, 100000);
      expect(margin).toBe(2308); // 23.08%
    });

    it('deve retornar 0 para preço zero', () => {
      expect(calculateMargin(0, 100000)).toBe(0);
    });
  });

  describe('calculateAFRMM', () => {
    it('deve calcular 8% do frete marítimo (longo curso, Lei 14.301/2022)', () => {
      expect(calculateAFRMM(100000)).toBe(8000);
      expect(calculateAFRMM(200000)).toBe(16000);
    });
  });

  describe('calculateSiscomex', () => {
    it('deve calcular taxa base para 1 item', () => {
      expect(calculateSiscomex(1)).toBe(18500);
    });

    it('deve adicionar R$ 29,50 por item adicional', () => {
      expect(calculateSiscomex(5)).toBe(18500 + 4 * 2950);
    });
  });

  describe('calculateSaleTaxes - Simples Nacional', () => {
    it('deve calcular alíquota única sobre receita', () => {
      const result = calculateSaleTaxes({
        sellingPriceCents: 100000,
        costCents: 60000,
        stateCode: 'SC',
        taxRegime: 'simples_nacional',
        simplesAliquota: 400,
      });
      expect(result.simplesTotal).toBe(4000);
      expect(result.totalTaxesOnSale).toBe(4000);
      expect(result.effectiveRate).toBe(400);
    });
  });

  describe('calculateSaleTaxes - Lucro Presumido', () => {
    it('deve calcular PIS 0.65%, COFINS 3%, IRPJ, CSLL, ICMS', () => {
      const result = calculateSaleTaxes({
        sellingPriceCents: 1000000, // R$ 10.000
        costCents: 600000,
        stateCode: 'SC',
        taxRegime: 'lucro_presumido',
      });
      expect(result.pisOnSale).toBe(6500);     // 0.65% × 10.000
      expect(result.cofinsOnSale).toBe(30000); // 3% × 10.000
      expect(result.irpj).toBe(12000);         // 15% × (8% × 10.000)
      expect(result.csll).toBe(10800);         // 9% × (12% × 10.000)
      expect(result.icmsOnSale).toBe(170000);  // 17% × 10.000
    });

    it('deve aplicar crédito de ICMS da importação', () => {
      const result = calculateSaleTaxes({
        sellingPriceCents: 1000000,
        costCents: 600000,
        stateCode: 'SC',
        taxRegime: 'lucro_presumido',
        icmsPagoImportacaoCents: 50000,
      });
      expect(result.icmsOnSale).toBe(120000); // 170.000 - 50.000
    });
  });

  describe('calculateSaleTaxes - Lucro Real', () => {
    it('deve calcular PIS/COFINS não-cumulativo com créditos', () => {
      const result = calculateSaleTaxes({
        sellingPriceCents: 1000000,
        costCents: 600000,
        stateCode: 'SC',
        taxRegime: 'lucro_real',
      });
      // PIS: 1.65% × 10.000 - 1.65% × 6.000 = 165 - 99 = R$ 66
      expect(result.pisOnSale).toBe(6600);
      // COFINS: 7.6% × 10.000 - 7.6% × 6.000 = 760 - 456 = R$ 304
      expect(result.cofinsOnSale).toBe(30400);
      expect(result.pisCredito).toBe(9900);
      expect(result.cofinsCredito).toBe(45600);
    });

    it('deve aplicar crédito de ICMS da importação', () => {
      const result = calculateSaleTaxes({
        sellingPriceCents: 1000000,
        costCents: 600000,
        stateCode: 'SC',
        taxRegime: 'lucro_real',
        icmsPagoImportacaoCents: 100000,
      });
      expect(result.icmsOnSale).toBe(70000); // 170.000 - 100.000
      expect(result.icmsCredito).toBe(100000);
    });

    it('não deve ter ICMS negativo quando crédito > débito', () => {
      const result = calculateSaleTaxes({
        sellingPriceCents: 100000,
        costCents: 90000,
        stateCode: 'SC',
        taxRegime: 'lucro_real',
        icmsPagoImportacaoCents: 200000, // Crédito > débito
      });
      // ICMS débito: 17% × 1.000 = 170, crédito: 2.000 → líquido = 0 (não negativo)
      expect(result.icmsOnSale).toBe(0);
      // PIS: débito 1.65% × 1.000 = 16,50 | crédito 1.65% × 900 = 14,85 | líquido = 1,65
      expect(result.pisOnSale).toBe(165);
    });
  });

  describe('calculateSimplesEffectiveRate', () => {
    it('deve retornar 4% para primeira faixa', () => {
      const result = calculateSimplesEffectiveRate(10000000);
      expect(result.faixa).toBe(1);
      expect(result.aliquotaEfetiva).toBe(400);
    });

    it('deve calcular alíquota efetiva para segunda faixa', () => {
      const result = calculateSimplesEffectiveRate(25000000);
      expect(result.faixa).toBe(2);
      expect(result.aliquotaEfetiva).toBeGreaterThan(400);
      expect(result.aliquotaEfetiva).toBeLessThan(730);
    });
  });

  describe('calculateDIFAL', () => {
    it('deve calcular DIFAL para venda interestadual de produto importado', () => {
      const result = calculateDIFAL(100000, 'SP');
      // (18% - 4%) × 1.000 = R$ 140
      expect(result.difal).toBe(14000);
      expect(result.aliquotaInterna).toBe(1800);
      expect(result.aliquotaInterestadual).toBe(400);
    });

    it('deve calcular DIFAL para SC', () => {
      const result = calculateDIFAL(100000, 'SC');
      // (17% - 4%) × 1.000 = R$ 130
      expect(result.difal).toBe(13000);
    });
  });

  describe('calculateTargetPriceAnalysis', () => {
    it('deve identificar preço viável', () => {
      const result = calculateTargetPriceAnalysis({
        targetPriceCents: 200000,
        totalCostCents: 100000,
        fobValueCents: 50000,
        taxRegime: 'lucro_presumido',
        stateCode: 'SC',
      });
      expect(result.isViable).toBe(true);
      expect(result.grossMarginPercent).toBe(5000); // 50%
      expect(result.netMarginPercent).toBeGreaterThan(0);
    });

    it('deve identificar preço não-viável', () => {
      const result = calculateTargetPriceAnalysis({
        targetPriceCents: 105000,
        totalCostCents: 100000,
        fobValueCents: 50000,
        taxRegime: 'lucro_presumido',
        stateCode: 'SC',
      });
      expect(result.isViable).toBe(false);
      expect(result.netMarginPercent).toBeLessThan(0);
    });
  });
});
