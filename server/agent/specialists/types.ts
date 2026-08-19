/**
 * Tipos dos AGENTES ESPECIALISTAS (sub-agentes) coordenados pela Excambia.
 *
 * Padrão arquitetural: "orchestrator-worker" (agents-as-tools).
 *   - A Excambia (orquestrador) é a identidade única que conversa com o cliente.
 *   - Cada especialista é um sub-agente agêntico com prompt próprio e um
 *     SUBCONJUNTO das tools-base; roda seu próprio loop quando acionado.
 *   - A Excambia chama o especialista COMO SE FOSSE UMA FERRAMENTA.
 *
 * Vantagens: modular (cada especialista evolui isolado), escalável (adiciona um
 * 6º sem tocar nos outros) e auditável (cada delegação registra quem decidiu o quê).
 */

/** Definição declarativa de um especialista. */
export interface SpecialistDef {
  /** Chave curta de domínio: demand | sourcing | analise | op | fin. */
  key: string;
  /** Nome da tool que a Excambia chama (ex.: especialista_sourcing). */
  toolName: string;
  /** Rótulo humano para UI/logs/auditoria. */
  displayName: string;
  /** O que o especialista faz — vira a description da tool vista pela Excambia. */
  descricao: string;
  /** Prompt de sistema do sub-agente. */
  systemPrompt: string;
  /** Nomes das BASE_TOOLS que este especialista pode acionar. */
  toolNames: string[];
  /** Modelo (override). Default: smart (opus). Rotear por complexidade/custo. */
  model?: string;
  /** Teto de idas-e-voltas internas com tools. Default: 5. */
  maxTurns?: number;
}
