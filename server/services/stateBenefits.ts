/**
 * Registro PARAMETRIZADO de benefícios fiscais de ICMS na importação, por estado.
 *
 * Antes, só Santa Catarina (TTD) estava embutido no motor. Este registro torna o
 * benefício estadual um DADO (não código): cada UF aponta seu programa, base
 * legal e — quando a alíquota efetiva é conhecida e confirmada — o motor aplica
 * automaticamente (como faz com SC).
 *
 * REGRA DE SEGURANÇA TRIBUTÁRIA: NUNCA reduzimos imposto com número "chutado".
 * Só entra em `aplicarAutomatico: true` quem tem `icmsEfetivo` CONFIRMADO. Para os
 * demais, o motor mantém o ICMS importação CHEIO e AVISA que existe um programa
 * no estado, pedindo para confirmar a alíquota efetiva do enquadramento — aí é só
 * preencher `icmsEfetivo` + `aplicarAutomatico: true` para ativar.
 *
 * Modelagem: o benefício é aplicado como ICMS importação ANTECIPADO/efetivo (mesma
 * mecânica do TTD/SC no motor: gross-up de 4% da Res. Senado 13/2012 + alíquota
 * efetiva reduzida), coerente com trading de importação com benefício estadual.
 */

export interface StateImportBenefit {
  uf: string;
  programa: string;
  baseLegal: string;
  /** Alíquota efetiva de ICMS importação (fração), quando confirmada. null = a confirmar. */
  icmsEfetivo: number | null;
  /** Confiança da alíquota: 'confirmado' pode aplicar; 'estimado' só orienta. */
  confianca: "confirmado" | "estimado" | "a_confirmar";
  /** Se true, o motor aplica o benefício automaticamente para esta UF. */
  aplicarAutomatico: boolean;
  observacao?: string;
}

/**
 * Programas por UF. SC fica documentado aqui, mas continua sendo tratado pelo
 * caminho dedicado do TTD no estimativaService (não pela aplicação genérica) —
 * por isso `aplicarAutomatico: false` para SC neste registro (evita dupla aplicação).
 */
export const STATE_IMPORT_BENEFITS: Record<string, StateImportBenefit> = {
  SC: {
    uf: "SC",
    programa: "TTD 409/410/411 (Tratamento Tributário Diferenciado)",
    baseLegal: "RICMS-SC / Dec. 105/2007",
    icmsEfetivo: 0.01,
    confianca: "confirmado",
    aplicarAutomatico: false, // tratado pelo caminho dedicado do TTD (ver estimativaService)
    observacao: "TTD máximo (após 36 meses): ICMS antecipado efetivo 1,0%. Aplicado pelo caminho dedicado.",
  },
  ES: {
    uf: "ES",
    programa: "FUNDAP",
    baseLegal: "ES Lei 2.508/1970",
    icmsEfetivo: null,
    confianca: "estimado",
    aplicarAutomatico: false,
    observacao:
      "Carga efetiva depende do enquadramento/financiamento FUNDAP. Confirme a alíquota efetiva para aplicar.",
  },
  GO: {
    uf: "GO",
    programa: "COMEXPRODUZIR / PRODUZIR",
    baseLegal: "GO Lei 14.186/2002",
    icmsEfetivo: null,
    confianca: "a_confirmar",
    aplicarAutomatico: false,
    observacao: "Crédito outorgado na importação via portos/aeroportos de GO. Confirme a alíquota efetiva.",
  },
  AL: {
    uf: "AL",
    programa: "PRODESIN / Desenvolve Alagoas",
    baseLegal: "AL Lei 5.671/1995",
    icmsEfetivo: null,
    confianca: "a_confirmar",
    aplicarAutomatico: false,
    observacao: "Incentivo à importação/industrialização. Confirme a alíquota efetiva do enquadramento.",
  },
  MG: {
    uf: "MG",
    programa: "Corredor de Importação (diferimento + crédito presumido)",
    baseLegal: "RICMS-MG, Anexo VIII",
    icmsEfetivo: null,
    confianca: "a_confirmar",
    aplicarAutomatico: false,
    observacao: "Diferimento do ICMS importação + crédito presumido na saída. Confirme a alíquota efetiva.",
  },
  PE: {
    uf: "PE",
    programa: "PRODEPE (importação)",
    baseLegal: "PE Lei 11.675/1999",
    icmsEfetivo: null,
    confianca: "a_confirmar",
    aplicarAutomatico: false,
    observacao: "Crédito presumido para importação por PE. Confirme a alíquota efetiva.",
  },
  MA: {
    uf: "MA",
    programa: "Mais Empresas / incentivo à importação",
    baseLegal: "MA — legislação estadual de incentivo",
    icmsEfetivo: null,
    confianca: "a_confirmar",
    aplicarAutomatico: false,
    observacao: "Confirme o programa e a alíquota efetiva do enquadramento.",
  },
  RO: {
    uf: "RO",
    programa: "Incentivo estadual à importação",
    baseLegal: "RO — legislação estadual de incentivo",
    icmsEfetivo: null,
    confianca: "a_confirmar",
    aplicarAutomatico: false,
    observacao: "Confirme o programa e a alíquota efetiva do enquadramento.",
  },
  TO: {
    uf: "TO",
    programa: "Programa estadual de incentivo (importação)",
    baseLegal: "TO — legislação estadual de incentivo",
    icmsEfetivo: null,
    confianca: "a_confirmar",
    aplicarAutomatico: false,
    observacao: "Confirme o programa e a alíquota efetiva do enquadramento.",
  },
};

/** Benefício parametrizado para uma UF (ou null se não houver programa cadastrado). */
export function getStateImportBenefit(stateCode: string): StateImportBenefit | null {
  const uf = (stateCode || "").toUpperCase().slice(0, 2);
  return STATE_IMPORT_BENEFITS[uf] ?? null;
}
