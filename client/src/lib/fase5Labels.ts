/**
 * FASE 5 · FATIA 1 — Renomeações de menu e vocabulário.
 *
 * Centraliza os rótulos da Fase 5 num só lugar. O frontend importa daqui.
 * Renomear é só rótulo + rota — os nomes internos de tabela/rota NÃO mudam
 * (evita migração e quebra de links). Muda o que o usuário vê.
 */

/** Rótulos dos itens de menu (chave interna → rótulo exibido). */
export const MENU_LABELS = {
  excambia: "Excambia",
  market: "Inteligência de Mercado",
  operations: "Painel de Operações",
  suppliers: "Fornecedores / Fabricantes",   // era "Fornecedores"
  assets: "Ativos & Insumos",                 // era "Produtos / Insumos"
  // "Indústrias / Clientes" SAI da Base e vira sub-item de Inteligência de Mercado:
  buyers: "Compradores nacionais / Setores",
} as const;

/** Estrutura do menu da Fase 5 (para montar a sidebar). */
export const MENU_STRUCTURE = [
  {
    grupo: "Inteligência",
    itens: [
      { key: "excambia", label: MENU_LABELS.excambia, rota: "/excambia" },
      {
        key: "market", label: MENU_LABELS.market, rota: "/excambia/market",
        sub: [
          { key: "cambio", label: "Câmbio" },
          { key: "commodities", label: "Commodities" },
          { key: "tendencias", label: "Tendências de preço" },
          { key: "buyers", label: MENU_LABELS.buyers },
          { key: "benchmark", label: "Benchmark de mercado" },
          { key: "preditiva", label: "Análises preditivas" },
          { key: "bloomberg", label: "API Bloomberg (e fontes externas)" },
        ],
      },
    ],
  },
  {
    grupo: "Operações",
    itens: [
      { key: "operations", label: MENU_LABELS.operations, rota: "/operacoes" },
    ],
  },
  {
    grupo: "Base Operacional",
    itens: [
      { key: "suppliers", label: MENU_LABELS.suppliers, rota: "/suppliers" },
      { key: "assets", label: MENU_LABELS.assets, rota: "/products" }, // rota interna mantida
    ],
  },
] as const;

/** Selos de origem (Ativos e Fornecedores). */
export type Origem = "nacional" | "internacional" | "ambos" | "importado_antes" | "cotado_nao_importado";

export const ORIGEM_SELO: Record<Origem, { label: string; cor: string; bg: string }> = {
  nacional:               { label: "Nacional",                 cor: "#1aa885", bg: "#e6faf4" },
  internacional:          { label: "Internacional",            cor: "#2b5fd0", bg: "#e8f0fe" },
  ambos:                  { label: "Nacional + Internacional", cor: "#682ABA", bg: "#f0ebfa" },
  importado_antes:        { label: "Importado anteriormente",  cor: "#0c8f7c", bg: "#e6faf4" },
  cotado_nao_importado:   { label: "Cotado, não importado",    cor: "#e0922b", bg: "#fcf0dd" },
};

/** Tipos de fornecedor/fabricante. */
export const TIPO_FORNECEDOR = [
  "fabrica", "trading", "distribuidor", "exportador", "representante",
  "fornecedor_nacional", "fabricante_nacional", "importador_local", "distribuidor_brasileiro",
] as const;

export const TIPO_FORNECEDOR_LABEL: Record<string, string> = {
  fabrica: "Fábrica", trading: "Trading", distribuidor: "Distribuidor",
  exportador: "Exportador", representante: "Representante",
  fornecedor_nacional: "Fornecedor Nacional", fabricante_nacional: "Fabricante Nacional",
  importador_local: "Importador Local", distribuidor_brasileiro: "Distribuidor Brasileiro",
};
