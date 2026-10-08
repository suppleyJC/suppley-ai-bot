/**
 * Registro dos especialistas como TOOLS da Excambia.
 *
 * Cada SpecialistDef vira uma AgentTool (via specialistAsTool) que o
 * orquestrador pode chamar como qualquer outra ferramenta — esse é o padrão
 * "agents-as-tools". Para adicionar um 6º especialista, basta declará-lo em
 * definitions.ts; ele aparece aqui automaticamente.
 */
import type { AgentTool } from "../tools/types";
import { specialistAsTool } from "./runtime";
import { SPECIALISTS } from "./definitions";

export const SPECIALIST_TOOLS: AgentTool[] = SPECIALISTS.map(specialistAsTool);

export { SPECIALISTS } from "./definitions";
export { runSpecialist } from "./runtime";
export type { SpecialistDef } from "./types";
