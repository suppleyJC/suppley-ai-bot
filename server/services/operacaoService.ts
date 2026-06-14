/**
 * Operação Service — orquestra a espinha dorsal da plataforma.
 *
 * Responsabilidades:
 *  - Criar operação (a partir de uma demanda ou avulsa)
 *  - Registrar eventos na linha do tempo (operacao_eventos)
 *  - Avançar de estágio com checagem de gate
 *  - Decisão GO / NO-GO com snapshot dos números
 *  - Vincular cotação vencedora e cálculo de viabilidade
 *
 * Não chama LLM nem rede — pura orquestração sobre o banco (Drizzle).
 */
import { and, desc, eq, like, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  operacoes, operacaoEventos, operacaoEstagios, demandas,
  quotations, importCalculations, suppliers,
  type InsertOperacao, type Operacao,
} from "../../drizzle/schema";

export type Estagio = "demand" | "source" | "analyze" | "execute" | "finance" | "closed" | "lost";
const ORDER: Estagio[] = ["demand", "source", "analyze", "execute", "finance", "closed"];

// ---------------------------------------------------------------------------
// Código sequencial OP-AAAA-NNNN
// ---------------------------------------------------------------------------
async function nextCodigo(db: any, userId: number): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await db
    .select({ codigo: operacoes.codigo })
    .from(operacoes)
    .where(like(operacoes.codigo, `OP-${year}-%`))
    .orderBy(desc(operacoes.codigo))
    .limit(1);
  const last = rows[0]?.codigo as string | undefined;
  const seq = last ? parseInt(last.split("-")[2], 10) + 1 : 1;
  return `OP-${year}-${String(seq).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Eventos (linha do tempo)
// ---------------------------------------------------------------------------
export async function addEvento(input: {
  operacaoId: number;
  tipo: string;
  estagio: Estagio;
  refTipo?: string;
  refId?: number;
  autor?: "usuario" | "excambia" | "sistema";
  titulo?: string;
  payload?: unknown;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(operacaoEventos).values({
    operacaoId: input.operacaoId,
    tipo: input.tipo as any,
    estagio: input.estagio as any,
    refTipo: input.refTipo ?? null,
    refId: input.refId ?? null,
    autor: input.autor ?? "usuario",
    titulo: input.titulo ?? null,
    payload: (input.payload ?? null) as any,
  });
}

// ---------------------------------------------------------------------------
// Criar operação
// ---------------------------------------------------------------------------
export async function createOperacao(input: {
  userId: number;
  titulo: string;
  demandaId?: number;
  clienteNome?: string;
  origemPais?: string;
  regimeTributario?: "lucro_real" | "lucro_presumido" | "simples_nacional";
}): Promise<Operacao | null> {
  const db = await getDb();
  if (!db) return null;

  const codigo = await nextCodigo(db, input.userId);
  const values: InsertOperacao = {
    userId: input.userId,
    codigo,
    titulo: input.titulo,
    demandaId: input.demandaId ?? null,
    clienteNome: input.clienteNome ?? null,
    origemPais: input.origemPais ?? null,
    regimeTributario: input.regimeTributario ?? null,
    estagioAtual: "demand",
    status: "ativa",
  };
  const [res] = await db.insert(operacoes).values(values);
  const id = (res as any).insertId as number;

  await db.insert(operacaoEstagios).values({ operacaoId: id, estagio: "demand" });
  await addEvento({
    operacaoId: id, tipo: "operacao_criada", estagio: "demand", autor: "sistema",
    titulo: `Operação ${codigo} criada`,
  });
  if (input.demandaId) {
    await db.update(demandas).set({ status: "em_operacao" }).where(eq(demandas.id, input.demandaId));
  }
  const [op] = await db.select().from(operacoes).where(eq(operacoes.id, id)).limit(1);
  return op ?? null;
}

// ---------------------------------------------------------------------------
// Avançar de estágio (com gate)
// ---------------------------------------------------------------------------
export async function advanceStage(input: {
  operacaoId: number;
  to?: Estagio;          // se omitido, vai para o próximo
  gateChecklist?: unknown;
}): Promise<{ ok: boolean; estagio?: Estagio; message?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, message: "sem conexão" };

  const [op] = await db.select().from(operacoes).where(eq(operacoes.id, input.operacaoId)).limit(1);
  if (!op) return { ok: false, message: "operação não encontrada" };

  const current = op.estagioAtual as Estagio;
  const idx = ORDER.indexOf(current);
  const target = input.to ?? ORDER[Math.min(idx + 1, ORDER.length - 1)];
  if (ORDER.indexOf(target) <= idx && target !== "lost") {
    return { ok: false, message: `não é possível voltar de ${current} para ${target}` };
  }

  // Fecha o estágio atual
  await db.update(operacaoEstagios)
    .set({ saiuEm: sql`now()`, gateCumprido: 1, gateChecklist: (input.gateChecklist ?? null) as any })
    .where(and(eq(operacaoEstagios.operacaoId, op.id), eq(operacaoEstagios.estagio, current as any)));

  // Abre o novo (se for um dos 5 estágios operacionais)
  if (["demand", "source", "analyze", "execute", "finance"].includes(target)) {
    await db.insert(operacaoEstagios).values({ operacaoId: op.id, estagio: target as any });
  }
  await db.update(operacoes).set({ estagioAtual: target as any }).where(eq(operacoes.id, op.id));
  await addEvento({
    operacaoId: op.id, tipo: "estagio_avancado", estagio: target, autor: "usuario",
    titulo: `Avançou para ${target}`,
  });
  return { ok: true, estagio: target };
}

// ---------------------------------------------------------------------------
// Vincular cotação vencedora / cálculo de viabilidade
// ---------------------------------------------------------------------------
export async function linkQuotation(operacaoId: number, quotationId: number) {
  const db = await getDb();
  if (!db) return;
  const [q] = await db.select().from(quotations).where(eq(quotations.id, quotationId)).limit(1);
  await db.update(operacoes).set({
    cotacaoVencedoraId: quotationId,
    fornecedorId: q?.supplierId ?? null,
    fornecedorNome: q?.supplierName ?? null,
  }).where(eq(operacoes.id, operacaoId));
  await addEvento({
    operacaoId, tipo: "cotacao_recebida", estagio: "source",
    refTipo: "quotations", refId: quotationId,
    titulo: `Cotação ${q?.quotationNumber ?? quotationId} vinculada`,
  });
}

export async function linkCalculation(operacaoId: number, calculationId: number, snapshot?: {
  valorBrlCents?: number; margemBp?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(operacoes).set({
    calculoId: calculationId,
    valorEstimadoBrlCents: snapshot?.valorBrlCents ?? null,
    margemEstimadaBp: snapshot?.margemBp ?? null,
  }).where(eq(operacoes.id, operacaoId));
  await addEvento({
    operacaoId, tipo: "calculo_executado", estagio: "analyze",
    refTipo: "import_calculations", refId: calculationId,
    titulo: "Cálculo de viabilidade vinculado",
    payload: snapshot ?? null,
  });
}

// ---------------------------------------------------------------------------
// GO / NO-GO (decisão de primeira classe)
// ---------------------------------------------------------------------------
export async function decideGoNoGo(input: {
  operacaoId: number;
  decision: "go" | "no_go";
  decidedBy: number;
  motivo?: string;
  valoresSnapshot?: unknown;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(operacoes).set({
    status: input.decision,
    decisaoGoNoGo: {
      decision: input.decision,
      decidedBy: input.decidedBy,
      decidedAt: new Date().toISOString(),
      motivo: input.motivo ?? null,
      valores: input.valoresSnapshot ?? null,
    } as any,
  }).where(eq(operacoes.id, input.operacaoId));
  await addEvento({
    operacaoId: input.operacaoId,
    tipo: input.decision === "go" ? "go_decidido" : "no_go_decidido",
    estagio: "analyze",
    titulo: input.decision === "go" ? "GO — operação aprovada" : "NO-GO — operação reprovada",
    payload: { motivo: input.motivo ?? null },
  });
  // GO avança para execute; NO-GO encerra como lost
  if (input.decision === "go") {
    await advanceStage({ operacaoId: input.operacaoId, to: "execute" });
  } else {
    await db.update(operacoes).set({ estagioAtual: "lost" }).where(eq(operacoes.id, input.operacaoId));
  }
}

// ---------------------------------------------------------------------------
// Leituras (consumidas pelo Kanban e pela tela da operação)
// ---------------------------------------------------------------------------
export async function listOperacoes(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(operacoes)
    .where(eq(operacoes.userId, userId))
    .orderBy(desc(operacoes.atualizadaEm));
  return rows.map((o) => ({
    id: o.id, codigo: o.codigo, titulo: o.titulo,
    estagioAtual: o.estagioAtual, status: o.status,
    clienteNome: o.clienteNome, fornecedorNome: o.fornecedorNome,
    valorEstimadoBrl: o.valorEstimadoBrlCents, margemEstimada: o.margemEstimadaBp,
  }));
}

export async function getOperacao(userId: number, id: number) {
  const db = await getDb();
  if (!db) return null;
  const [op] = await db.select().from(operacoes)
    .where(and(eq(operacoes.id, id), eq(operacoes.userId, userId))).limit(1);
  if (!op) return null;
  const eventos = await db.select().from(operacaoEventos)
    .where(eq(operacaoEventos.operacaoId, id))
    .orderBy(desc(operacaoEventos.criadoEm));
  const estagios = await db.select().from(operacaoEstagios)
    .where(eq(operacaoEstagios.operacaoId, id));
  return { operacao: op, eventos, estagios };
}
