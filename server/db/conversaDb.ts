/**
 * conversaDb — persistência das conversas da Excambia (Fase 3).
 *
 * Uma "conversa" é uma thread de chat nomeável e retomável, opcionalmente
 * vinculada a uma Operação (sincronização chat ↔ Painel). As mensagens vivem
 * em `sofia_chat_messages` e referenciam a conversa por `conversaId`.
 *
 * Segue o mesmo padrão dos outros módulos de db: `getDb()` pode devolver null
 * (sem conexão) e cada função degrada para um retorno seguro.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  conversas,
  sofiaChatMessages,
  type Conversa,
  type InsertConversa,
  type SofiaChatMessage,
} from "../../drizzle/schema";
import { getDb } from "./connection";

type Estagio = "demand" | "source" | "analyze" | "execute" | "finance" | "closed" | "lost";

export async function createConversa(input: {
  userId: number;
  titulo?: string;
  operacaoId?: number | null;
  estagio?: Estagio | null;
}): Promise<Conversa | null> {
  const db = await getDb();
  if (!db) return null;

  const values: InsertConversa = {
    userId: input.userId,
    titulo: input.titulo?.trim() || "Nova conversa",
    operacaoId: input.operacaoId ?? null,
    estagio: (input.estagio ?? null) as any,
    ultimaMensagemEm: new Date(),
  };
  const [res] = await db.insert(conversas).values(values);
  const id = (res as any).insertId as number;
  const [saved] = await db.select().from(conversas).where(eq(conversas.id, id)).limit(1);
  return saved ?? null;
}

/** Lista as conversas do usuário, mais recentes primeiro. */
export async function listConversas(
  userId: number,
  opts?: { status?: "ativa" | "arquivada" },
): Promise<Conversa[]> {
  const db = await getDb();
  if (!db) return [];

  const where = opts?.status
    ? and(eq(conversas.userId, userId), eq(conversas.status, opts.status))
    : eq(conversas.userId, userId);

  return db
    .select()
    .from(conversas)
    .where(where)
    .orderBy(desc(sql`COALESCE(${conversas.ultimaMensagemEm}, ${conversas.criadaEm})`));
}

export async function getConversa(id: number, userId: number): Promise<Conversa | null> {
  const db = await getDb();
  if (!db) return null;
  const [c] = await db
    .select()
    .from(conversas)
    .where(and(eq(conversas.id, id), eq(conversas.userId, userId)))
    .limit(1);
  return c ?? null;
}

/** Mensagens de uma conversa (ordem cronológica), validando posse. */
export async function getConversaMessages(
  id: number,
  userId: number,
): Promise<SofiaChatMessage[]> {
  const db = await getDb();
  if (!db) return [];
  const owner = await getConversa(id, userId);
  if (!owner) return [];
  return db
    .select()
    .from(sofiaChatMessages)
    .where(eq(sofiaChatMessages.conversaId, id))
    .orderBy(sofiaChatMessages.createdAt);
}

export async function renameConversa(
  id: number,
  userId: number,
  titulo: string,
): Promise<Conversa | null> {
  const db = await getDb();
  if (!db) return null;
  const owner = await getConversa(id, userId);
  if (!owner) return null;
  await db.update(conversas).set({ titulo: titulo.trim() || owner.titulo }).where(eq(conversas.id, id));
  return getConversa(id, userId);
}

export async function setConversaStatus(
  id: number,
  userId: number,
  status: "ativa" | "arquivada",
): Promise<Conversa | null> {
  const db = await getDb();
  if (!db) return null;
  const owner = await getConversa(id, userId);
  if (!owner) return null;
  await db.update(conversas).set({ status }).where(eq(conversas.id, id));
  return getConversa(id, userId);
}

/** Vincula (ou desvincula com operacaoId=null) a conversa a uma operação. */
export async function linkConversaToOperacao(
  id: number,
  userId: number,
  operacaoId: number | null,
  estagio?: Estagio | null,
): Promise<Conversa | null> {
  const db = await getDb();
  if (!db) return null;
  const owner = await getConversa(id, userId);
  if (!owner) return null;
  await db
    .update(conversas)
    .set({ operacaoId, estagio: (estagio ?? owner.estagio) as any })
    .where(eq(conversas.id, id));
  return getConversa(id, userId);
}

/** Apaga a conversa e suas mensagens (validando posse). */
export async function deleteConversa(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const owner = await getConversa(id, userId);
  if (!owner) return false;
  await db.delete(sofiaChatMessages).where(eq(sofiaChatMessages.conversaId, id));
  await db.delete(conversas).where(eq(conversas.id, id));
  return true;
}

/** Marca atividade recente (chamado a cada mensagem salva). */
export async function touchConversa(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(conversas).set({ ultimaMensagemEm: new Date() }).where(eq(conversas.id, id));
}

/**
 * Conta mensagens "órfãs" (conversaId NULL) de um usuário — o histórico legado
 * pré-Fase 3, exibido como uma entrada especial na sidebar.
 */
export async function countLegacyMessages(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sofiaChatMessages)
    .where(and(eq(sofiaChatMessages.userId, userId), isNull(sofiaChatMessages.conversaId)));
  return Number(row?.n ?? 0);
}
