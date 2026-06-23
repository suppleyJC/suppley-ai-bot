/**
 * Operações de banco de dados para CONVERSAS da Excambia.
 * Camada de abstração sobre Drizzle — torna conversasRouter agnóstico ao banco.
 *
 * Nota: a distinção "operação × avulsa" é derivada de `operacaoId`
 * (com operação vinculada = operação; sem = avulsa). Não há coluna `tipo`.
 */
import { getDb } from "./connection";
import { conversas, conversaMensagens } from "../../drizzle/schema";
import { and, eq, desc } from "drizzle-orm";
import type { InsertConversa, InsertConversaMensagem } from "../../drizzle/schema";

type EstagioConversa =
  | "demand" | "source" | "analyze" | "execute" | "finance" | "closed" | "lost";

export async function listConversas(userId: number) {
  const db = await getDb();
  if (!db) return { operacoes: [], avulsas: [] };

  const rows = await db
    .select()
    .from(conversas)
    .where(and(eq(conversas.userId, userId), eq(conversas.status, "ativa")))
    .orderBy(desc(conversas.fixada), desc(conversas.ultimaMensagemEm));

  return {
    operacoes: rows.filter((c) => c.operacaoId != null),
    avulsas: rows.filter((c) => c.operacaoId == null),
  };
}

/**
 * Lista plana (não agrupada) filtrada por status — consumida pela sidebar
 * que renderiza todas as conversas numa única lista ordenada por atividade.
 */
export async function listConversasFlat(
  userId: number,
  opts?: { status?: "ativa" | "arquivada" }
) {
  const db = await getDb();
  if (!db) return [];

  const status = opts?.status ?? "ativa";
  return db
    .select()
    .from(conversas)
    .where(and(eq(conversas.userId, userId), eq(conversas.status, status)))
    .orderBy(desc(conversas.fixada), desc(conversas.ultimaMensagemEm));
}

export async function getConversa(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [conv] = await db
    .select()
    .from(conversas)
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));

  if (!conv) throw new Error("Conversa não encontrada");

  const mensagens = await db
    .select()
    .from(conversaMensagens)
    .where(eq(conversaMensagens.conversaId, id))
    .orderBy(conversaMensagens.criadaEm);

  return { ...conv, mensagens };
}

export async function createConversa(
  userId: number,
  input: { titulo?: string; operacaoId?: number; estagio?: EstagioConversa }
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const values = {
    userId,
    titulo: input.titulo || "Nova conversa",
    operacaoId: input.operacaoId,
    estagio: input.estagio,
  } as InsertConversa;

  const result = await db.insert(conversas).values(values);
  return { id: Number(result[0].insertId) };
}

export async function renameConversa(id: number, userId: number, titulo: string) {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(conversas)
    .set({ titulo })
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
  const [updated] = await db
    .select()
    .from(conversas)
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
  return updated ?? null;
}

export async function setPinnedConversa(id: number, userId: number, fixada: boolean) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(conversas)
    .set({ fixada })
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
}

export async function archiveConversa(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(conversas)
    .set({ status: "arquivada" })
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
}

/** Define o status da conversa (ativa/arquivada) e retorna a linha atualizada. */
export async function setConversaStatus(
  id: number,
  userId: number,
  status: "ativa" | "arquivada"
) {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(conversas)
    .set({ status })
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
  const [updated] = await db
    .select()
    .from(conversas)
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
  return updated ?? null;
}

export async function deleteConversa(id: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  await db
    .update(conversas)
    .set({ status: "arquivada" })
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
  return true;
}

/** Atualiza o carimbo de última atividade (ordena a sidebar). */
export async function touchConversa(conversaId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(conversas)
    .set({ ultimaMensagemEm: new Date() })
    .where(eq(conversas.id, conversaId));
}

/** Retorna apenas as mensagens de uma conversa (validando posse). */
export async function getConversaMessages(conversaId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];

  const [conv] = await db
    .select()
    .from(conversas)
    .where(and(eq(conversas.id, conversaId), eq(conversas.userId, userId)));
  if (!conv) return [];

  return db
    .select()
    .from(conversaMensagens)
    .where(eq(conversaMensagens.conversaId, conversaId))
    .orderBy(conversaMensagens.criadaEm);
}

export async function addMessage(
  conversaId: number,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  toolsUsed?: string[],
  toolResults?: any
) {
  const db = await getDb();
  if (!db) return;

  const values = {
    conversaId,
    role,
    content,
    toolsUsed: toolsUsed ?? null,
    toolResults: toolResults ?? null,
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
  operacaoId: number | null,
  estagio?: EstagioConversa
) {
  const db = await getDb();
  if (!db) return null;

  const patch: Partial<InsertConversa> = { operacaoId };
  if (estagio !== undefined) patch.estagio = estagio;

  await db
    .update(conversas)
    .set(patch)
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
  const [updated] = await db
    .select()
    .from(conversas)
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)));
  return updated ?? null;
}
