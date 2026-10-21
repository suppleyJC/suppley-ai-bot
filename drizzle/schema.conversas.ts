/**
 * Schema de CONVERSAS da Excambia.
 *
 * Coesão com operações (decisão de produto):
 *  - Uma conversa pode estar VINCULADA a uma operação (operacaoId) ou ser AVULSA.
 *  - Quando uma conversa avulsa "vira operação", basta preencher operacaoId —
 *    ela migra do grupo "Conversas" para "Operações" na UI, sem perder histórico.
 *  - As mensagens são persistidas para reabrir a conversa depois.
 *
 * Integração: adicionar estas tabelas ao drizzle/schema.ts (ou importar deste arquivo).
 */
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

export const conversas = mysqlTable("conversas", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),

  // VÍNCULO COM OPERAÇÃO — null = conversa avulsa; preenchido = operação
  operacaoId: int("operacaoId"), // FK lógica para operacoes.id

  titulo: varchar("titulo", { length: 255 }).notNull().default("Nova conversa"),

  // tipo derivado: "operacao" se operacaoId != null, senão "avulsa"
  // (mantemos explícito para facilitar a query de agrupamento na UI)
  tipo: mysqlEnum("tipo", ["avulsa", "operacao"]).default("avulsa").notNull(),

  // estado para arquivamento/exclusão (soft delete)
  status: mysqlEnum("status", ["ativa", "arquivada"]).default("ativa").notNull(),

  ultimaMensagemEm: timestamp("ultimaMensagemEm").defaultNow().notNull(),
  criadaEm: timestamp("criadaEm").defaultNow().notNull(),
});

export const conversaMensagens = mysqlTable("conversa_mensagens", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(),

  role: mysqlEnum("role", ["user", "assistant", "system", "tool"]).notNull(),
  content: text("content").notNull(),

  // se a mensagem do assistente usou ferramentas (coesão com a camada agêntica):
  // guarda quais tools foram chamadas e o resultado resumido
  toolsUsed: json("toolsUsed"),       // string[] | null
  toolResults: json("toolResults"),   // [{name, ok, data}] | null

  criadaEm: timestamp("criadaEm").defaultNow().notNull(),
});
