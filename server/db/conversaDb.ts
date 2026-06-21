/**
 * Operações de banco de dados para CONVERSAS da Excambia.
 * Camada de abstração sobre Drizzle — torna conversasRouter agnóstico ao banco.
 */
import { getDb } from "./config";
import { conversas, conversaMensagens } from "../../drizzle/schema";
import { and, eq, desc } from "drizzle-orm";
import type { InsertConversa, InsertConversaMensagem } from "../../drizzle/schema";

export async function listConversas(userId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversas)
    .where(and(eq(conversas.userId, userId), eq(conversas.status, "ativa")))
    .orderBy(desc(conversas.ultimaMensagemEm));

  return {
    operacoes: rows.filter((c: any) => c.tipo === "operacao"),
    avulsas: rows.filter((c: any) => c.tipo === "avulsa"),
  };
}

export async function getConversa(id: number, userId: number) {
  const db = getDb();
  const [conv] = await db
    .select()
    .from(conversas)
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));

  if (!conv) throw new Error("Conversa não encontrada");

  const mensagens = await db
    .select()
    .from(conversaMensagens)
    .where(eq(conversaMensagens.conversaId, id));

  return { ...conv, mensagens };
}

export async function createConversa(
  userId: number,
  input: { titulo?: string; operacaoId?: number; tipo?: "avulsa" | "operacao" }
) {
  const db = getDb();
  const values = {
    userId,
    titulo: input.titulo || "Nova conversa",
    operacaoId: input.operacaoId,
    tipo: input.tipo || "avulsa",
  } as InsertConversa;
  
  const result = await db.insert(conversas).values(values);
  return result;
}

export async function renameConversa(id: number, userId: number, titulo: string) {
  const db = getDb();
  await db
    .update(conversas)
    .set({ titulo })
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
}

export async function archiveConversa(id: number, userId: number) {
  const db = getDb();
  await db
    .update(conversas)
    .set({ status: "arquivada" })
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
}

export async function deleteConversa(id: number, userId: number) {
  const db = getDb();
  await db
    .update(conversas)
    .set({ status: "arquivada" })
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
}

export async function addMessage(
  conversaId: number,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  toolsUsed?: string[],
  toolResults?: any
) {
  const db = getDb();
  const values = {
    conversaId,
    role,
    content,
    toolsUsed: toolsUsed ? JSON.stringify(toolsUsed) : null,
    toolResults: toolResults ? JSON.stringify(toolResults) : null,
  } as InsertConversaMensagem;
  
  await db.insert(conversaMensagens).values(values);

  await db
    .update(conversas)
    .set({ ultimaMensagemEm: new Date() })
    .where(eq(conversas.id, conversaId));
}

export async function linkConversaToOperacao(
  id: number,
  userId: number,
  operacaoId: number
) {
  const db = getDb();
  await db
    .update(conversas)
    .set({ operacaoId, tipo: "operacao" })
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
}
