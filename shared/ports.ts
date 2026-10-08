// Portos brasileiros por estado com custos estimados
export interface Port {
  code: string;
  name: string;
  state: string;
  stateCode: string;
  thcCost: number; // Terminal Handling Charge em R$
  storageCostPercent: number; // % do CIF por período
  liberationCost: number; // Custo de liberação em R$
}

export const BRAZILIAN_PORTS: Port[] = [
  // Amazonas
  { code: 'BRMAN', name: 'Porto de Manaus', state: 'Amazonas', stateCode: 'AM', thcCost: 1200, storageCostPercent: 1.5, liberationCost: 400 },
  
  // Pará
  { code: 'BRBEL', name: 'Porto de Belém', state: 'Pará', stateCode: 'PA', thcCost: 1100, storageCostPercent: 1.5, liberationCost: 380 },
  { code: 'BRVDC', name: 'Porto de Vila do Conde', state: 'Pará', stateCode: 'PA', thcCost: 1000, storageCostPercent: 1.4, liberationCost: 350 },
  
  // Maranhão
  { code: 'BRITQ', name: 'Porto de Itaqui', state: 'Maranhão', stateCode: 'MA', thcCost: 1050, storageCostPercent: 1.4, liberationCost: 360 },
  
  // Ceará
  { code: 'BRFOR', name: 'Porto de Fortaleza (Mucuripe)', state: 'Ceará', stateCode: 'CE', thcCost: 1100, storageCostPercent: 1.5, liberationCost: 380 },
  { code: 'BRPEC', name: 'Porto do Pecém', state: 'Ceará', stateCode: 'CE', thcCost: 1150, storageCostPercent: 1.5, liberationCost: 390 },
  
  // Rio Grande do Norte
  { code: 'BRNAT', name: 'Porto de Natal', state: 'Rio Grande do Norte', stateCode: 'RN', thcCost: 1000, storageCostPercent: 1.4, liberationCost: 350 },
  
  // Pernambuco
  { code: 'BRREC', name: 'Porto de Recife', state: 'Pernambuco', stateCode: 'PE', thcCost: 1100, storageCostPercent: 1.5, liberationCost: 380 },
  { code: 'BRSUA', name: 'Porto de Suape', state: 'Pernambuco', stateCode: 'PE', thcCost: 1200, storageCostPercent: 1.5, liberationCost: 400 },
  
  // Bahia
  { code: 'BRSSA', name: 'Porto de Salvador', state: 'Bahia', stateCode: 'BA', thcCost: 1150, storageCostPercent: 1.5, liberationCost: 390 },
  { code: 'BRARI', name: 'Porto de Aratu', state: 'Bahia', stateCode: 'BA', thcCost: 1100, storageCostPercent: 1.4, liberationCost: 370 },
  
  // Espírito Santo
  { code: 'BRVIX', name: 'Porto de Vitória', state: 'Espírito Santo', stateCode: 'ES', thcCost: 1200, storageCostPercent: 1.5, liberationCost: 400 },
  { code: 'BRTUB', name: 'Porto de Tubarão', state: 'Espírito Santo', stateCode: 'ES', thcCost: 1100, storageCostPercent: 1.4, liberationCost: 370 },
  
  // Rio de Janeiro
  { code: 'BRRIO', name: 'Porto do Rio de Janeiro', state: 'Rio de Janeiro', stateCode: 'RJ', thcCost: 1400, storageCostPercent: 1.8, liberationCost: 450 },
  { code: 'BRSEP', name: 'Porto de Sepetiba (Itaguaí)', state: 'Rio de Janeiro', stateCode: 'RJ', thcCost: 1300, storageCostPercent: 1.6, liberationCost: 420 },
  
  // São Paulo
  { code: 'BRSSZ', name: 'Porto de Santos', state: 'São Paulo', stateCode: 'SP', thcCost: 1500, storageCostPercent: 2.0, liberationCost: 500 },
  { code: 'BRSFS', name: 'Porto de São Sebastião', state: 'São Paulo', stateCode: 'SP', thcCost: 1200, storageCostPercent: 1.5, liberationCost: 400 },
  
  // Paraná
  { code: 'BRPNG', name: 'Porto de Paranaguá', state: 'Paraná', stateCode: 'PR', thcCost: 1300, storageCostPercent: 1.6, liberationCost: 420 },
  { code: 'BRANT', name: 'Porto de Antonina', state: 'Paraná', stateCode: 'PR', thcCost: 1100, storageCostPercent: 1.4, liberationCost: 370 },
  
  // Santa Catarina
  { code: 'BRIOA', name: 'Porto de Itajaí', state: 'Santa Catarina', stateCode: 'SC', thcCost: 1250, storageCostPercent: 1.5, liberationCost: 410 },
  { code: 'BRNAV', name: 'Porto de Navegantes', state: 'Santa Catarina', stateCode: 'SC', thcCost: 1200, storageCostPercent: 1.5, liberationCost: 400 },
  { code: 'BRSFS', name: 'Porto de São Francisco do Sul', state: 'Santa Catarina', stateCode: 'SC', thcCost: 1150, storageCostPercent: 1.4, liberationCost: 380 },
  { code: 'BRIBB', name: 'Porto de Imbituba', state: 'Santa Catarina', stateCode: 'SC', thcCost: 1100, storageCostPercent: 1.4, liberationCost: 370 },
  
  // Rio Grande do Sul
  { code: 'BRRGI', name: 'Porto de Rio Grande', state: 'Rio Grande do Sul', stateCode: 'RS', thcCost: 1200, storageCostPercent: 1.5, liberationCost: 400 },
  { code: 'BRPOA', name: 'Porto de Porto Alegre', state: 'Rio Grande do Sul', stateCode: 'RS', thcCost: 1100, storageCostPercent: 1.4, liberationCost: 370 },
];

// Estados brasileiros
export const BRAZILIAN_STATES = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'PR', name: 'Paraná' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'TO', name: 'Tocantins' },
];

// Custos fixos de importação
export const IMPORT_FIXED_COSTS = {
  siscomexBase: 214.50, // Taxa base Siscomex
  siscomexPerAddition: 107.00, // Por adição
  blLiberation: 350.00, // Liberação do BL
  customsBroker: 800.00, // Despachante aduaneiro (estimativa)
  afrmmRate: 0.25, // 25% do frete marítimo
};

// Função para obter portos por estado
export function getPortsByState(stateCode: string): Port[] {
  return BRAZILIAN_PORTS.filter(port => port.stateCode === stateCode);
}

// Função para obter custos portuários estimados
export function getPortCosts(portCode: string, cifValue: number): {
  thc: number;
  storage: number;
  liberation: number;
  total: number;
} {
  const port = BRAZILIAN_PORTS.find(p => p.code === portCode);
  
  if (!port) {
    // Valores padrão se porto não encontrado
    return {
      thc: 1200,
      storage: cifValue * 0.015,
      liberation: 400,
      total: 1200 + (cifValue * 0.015) + 400,
    };
  }

  const thc = port.thcCost;
  const storage = cifValue * (port.storageCostPercent / 100);
  const liberation = port.liberationCost;

  return {
    thc,
    storage,
    liberation,
    total: thc + storage + liberation,
  };
}
