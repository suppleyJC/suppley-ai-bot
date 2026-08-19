import { upsertIcmsRate, upsertNcmTaxRate } from "./db";

// Brazilian states with ICMS rates
export const BRAZILIAN_STATES = [
  { stateCode: "AC", stateName: "Acre", internalRate: 1900, importRate: 400, interstateRate: 1200 },
  { stateCode: "AL", stateName: "Alagoas", internalRate: 1900, importRate: 400, interstateRate: 1200 },
  { stateCode: "AP", stateName: "Amapá", internalRate: 1800, importRate: 400, interstateRate: 1200 },
  { stateCode: "AM", stateName: "Amazonas", internalRate: 2000, importRate: 400, interstateRate: 1200 },
  { stateCode: "BA", stateName: "Bahia", internalRate: 2050, importRate: 400, interstateRate: 1200 },
  { stateCode: "CE", stateName: "Ceará", internalRate: 2000, importRate: 400, interstateRate: 1200 },
  { stateCode: "DF", stateName: "Distrito Federal", internalRate: 2000, importRate: 400, interstateRate: 1200 },
  { stateCode: "ES", stateName: "Espírito Santo", internalRate: 1700, importRate: 400, interstateRate: 1200 },
  { stateCode: "GO", stateName: "Goiás", internalRate: 1900, importRate: 400, interstateRate: 1200 },
  { stateCode: "MA", stateName: "Maranhão", internalRate: 2200, importRate: 400, interstateRate: 1200 },
  { stateCode: "MT", stateName: "Mato Grosso", internalRate: 1700, importRate: 400, interstateRate: 1200 },
  { stateCode: "MS", stateName: "Mato Grosso do Sul", internalRate: 1700, importRate: 400, interstateRate: 1200 },
  { stateCode: "MG", stateName: "Minas Gerais", internalRate: 1800, importRate: 400, interstateRate: 1200 },
  { stateCode: "PA", stateName: "Pará", internalRate: 1900, importRate: 400, interstateRate: 1200 },
  { stateCode: "PB", stateName: "Paraíba", internalRate: 2000, importRate: 400, interstateRate: 1200 },
  { stateCode: "PR", stateName: "Paraná", internalRate: 1950, importRate: 400, interstateRate: 1200 },
  { stateCode: "PE", stateName: "Pernambuco", internalRate: 2050, importRate: 400, interstateRate: 1200 },
  { stateCode: "PI", stateName: "Piauí", internalRate: 2100, importRate: 400, interstateRate: 1200 },
  { stateCode: "RJ", stateName: "Rio de Janeiro", internalRate: 2200, importRate: 400, interstateRate: 1200 },
  { stateCode: "RN", stateName: "Rio Grande do Norte", internalRate: 2000, importRate: 400, interstateRate: 1200 },
  { stateCode: "RS", stateName: "Rio Grande do Sul", internalRate: 1700, importRate: 400, interstateRate: 1200 },
  { stateCode: "RO", stateName: "Rondônia", internalRate: 1950, importRate: 400, interstateRate: 1200 },
  { stateCode: "RR", stateName: "Roraima", internalRate: 2000, importRate: 400, interstateRate: 1200 },
  { stateCode: "SC", stateName: "Santa Catarina", internalRate: 1700, importRate: 400, interstateRate: 1200, hasIncentive: true, incentiveDescription: "TTD - Tratamento Tributário Diferenciado para importadores" },
  { stateCode: "SP", stateName: "São Paulo", internalRate: 1800, importRate: 400, interstateRate: 1200 },
  { stateCode: "SE", stateName: "Sergipe", internalRate: 1900, importRate: 400, interstateRate: 1200 },
  { stateCode: "TO", stateName: "Tocantins", internalRate: 2000, importRate: 400, interstateRate: 1200 },
];

// Common NCM codes with tax rates (construction materials focus)
export const COMMON_NCM_RATES = [
  // Pregos e similares (Nails)
  { ncmCode: "73170010", description: "Pregos de ferro ou aço", iiRate: 1400, ipiRate: 500, mercosulIiRate: 0 },
  { ncmCode: "73170090", description: "Outros artigos semelhantes de ferro ou aço", iiRate: 1400, ipiRate: 500, mercosulIiRate: 0 },
  
  // Escoras metálicas (Metal props/shores)
  { ncmCode: "73089090", description: "Outras construções e suas partes de ferro ou aço", iiRate: 1400, ipiRate: 500, mercosulIiRate: 0 },
  { ncmCode: "73084000", description: "Equipamento para andaimes, armações e escoramentos", iiRate: 1400, ipiRate: 500, mercosulIiRate: 0 },
  
  // Ferramentas
  { ncmCode: "82011000", description: "Pás", iiRate: 1800, ipiRate: 1000, mercosulIiRate: 0 },
  { ncmCode: "82012000", description: "Forcados e forquilhas", iiRate: 1800, ipiRate: 1000, mercosulIiRate: 0 },
  { ncmCode: "82013000", description: "Picaretas, enxadas e similares", iiRate: 1800, ipiRate: 1000, mercosulIiRate: 0 },
  { ncmCode: "82019000", description: "Outras ferramentas agrícolas manuais", iiRate: 1800, ipiRate: 1000, mercosulIiRate: 0 },
  
  // Máquinas e equipamentos
  { ncmCode: "84295200", description: "Escavadeiras com superestrutura giratória", iiRate: 0, ipiRate: 0, mercosulIiRate: 0 },
  { ncmCode: "84295900", description: "Outras pás mecânicas e escavadeiras", iiRate: 0, ipiRate: 0, mercosulIiRate: 0 },
  { ncmCode: "84314100", description: "Caçambas, mesmo de mandíbulas, pás, garras e pinças", iiRate: 1400, ipiRate: 500, mercosulIiRate: 0 },
  
  // Cimento e materiais de construção
  { ncmCode: "25232900", description: "Outros cimentos Portland", iiRate: 400, ipiRate: 0, mercosulIiRate: 0 },
  { ncmCode: "68101100", description: "Blocos e tijolos para construção", iiRate: 1000, ipiRate: 500, mercosulIiRate: 0 },
  
  // Aço e ferro
  { ncmCode: "72142000", description: "Barras de ferro ou aço", iiRate: 1200, ipiRate: 500, mercosulIiRate: 0 },
  { ncmCode: "72149100", description: "Barras de seção transversal retangular", iiRate: 1200, ipiRate: 500, mercosulIiRate: 0 },
  { ncmCode: "72149900", description: "Outras barras de ferro ou aço", iiRate: 1200, ipiRate: 500, mercosulIiRate: 0 },
  
  // Tubos
  { ncmCode: "73063000", description: "Outros tubos soldados de seção circular de ferro ou aço", iiRate: 1400, ipiRate: 500, mercosulIiRate: 0 },
  { ncmCode: "73069000", description: "Outros tubos de ferro ou aço", iiRate: 1400, ipiRate: 500, mercosulIiRate: 0 },
  
  // Fios e cabos
  { ncmCode: "72171000", description: "Fios de ferro ou aço não revestidos", iiRate: 1200, ipiRate: 500, mercosulIiRate: 0 },
  { ncmCode: "72172000", description: "Fios de ferro ou aço galvanizados", iiRate: 1200, ipiRate: 500, mercosulIiRate: 0 },
  
  // Parafusos e fixadores
  { ncmCode: "73181500", description: "Outros parafusos e pinos", iiRate: 1800, ipiRate: 1000, mercosulIiRate: 0 },
  { ncmCode: "73181600", description: "Porcas", iiRate: 1800, ipiRate: 1000, mercosulIiRate: 0 },
  { ncmCode: "73182100", description: "Arruelas de pressão e outras de segurança", iiRate: 1800, ipiRate: 1000, mercosulIiRate: 0 },
  { ncmCode: "73182200", description: "Outras arruelas", iiRate: 1800, ipiRate: 1000, mercosulIiRate: 0 },
  
  // Acabamentos
  { ncmCode: "73249000", description: "Artigos de higiene ou de toucador de ferro ou aço", iiRate: 1800, ipiRate: 1500, mercosulIiRate: 0 },
  { ncmCode: "74182000", description: "Artigos de higiene ou de toucador de cobre", iiRate: 1800, ipiRate: 1500, mercosulIiRate: 0 },
  
  // Tintas e revestimentos
  { ncmCode: "32091000", description: "Tintas à base de polímeros acrílicos", iiRate: 1400, ipiRate: 500, mercosulIiRate: 0 },
  { ncmCode: "32099000", description: "Outras tintas e vernizes", iiRate: 1400, ipiRate: 500, mercosulIiRate: 0 },
];

// Mercosul countries
export const MERCOSUL_COUNTRIES = [
  { name: "Argentina", code: "AR" },
  { name: "Paraguai", code: "PY" },
  { name: "Uruguai", code: "UY" },
  { name: "Venezuela", code: "VE" },
  { name: "Bolívia", code: "BO" },
];

/**
 * Seed initial data into the database
 */
export async function seedInitialData(): Promise<void> {
  console.log("[Seed] Starting data seeding...");
  
  // Seed ICMS rates
  console.log("[Seed] Seeding ICMS rates...");
  for (const state of BRAZILIAN_STATES) {
    await upsertIcmsRate(state);
  }
  console.log(`[Seed] Seeded ${BRAZILIAN_STATES.length} ICMS rates`);
  
  // Seed NCM tax rates
  console.log("[Seed] Seeding NCM tax rates...");
  for (const ncm of COMMON_NCM_RATES) {
    await upsertNcmTaxRate({
      ...ncm,
      pisRate: 216, // 2.16%
      cofinsRate: 1000, // 10%
    });
  }
  console.log(`[Seed] Seeded ${COMMON_NCM_RATES.length} NCM tax rates`);
  
  console.log("[Seed] Data seeding completed!");
}

// Export for use in API
export { BRAZILIAN_STATES as states };
