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
  operacoes, operacaoEventos, operacaoEstagios, operacaoAnexos, operacaoFinanceiro, operacaoMarcos, demandas,
  quotations, importCalculations, suppliers,
  type InsertOperacao, type Operacao,
} from "../../drizzle/schema";

export type Estagio = "demand" | "source" | "analyze" | "execute" | "finance" | "closed" | "lost";
export type Prioridade = "baixa" | "media" | "alta" | "critica";
export type TipoAnexo = "desenho" | "pdf" | "imagem" | "especificacao" | "catalogo" | "cotacao" | "outro";
export type TipoFinanceiro =
  | "cambio" | "pagamento_fornecedor" | "imposto" | "frete" | "seguro"
  | "despesa_local" | "comissao" | "receita" | "outro";
export type DirecaoFinanceiro = "entrada" | "saida";
export type StatusFinanceiro = "previsto" | "realizado" | "cancelado";
export type TipoMarco =
  | "pedido_confirmado" | "producao_iniciada" | "produto_embarcado"
  | "di_registrada" | "nacionalizado" | "entregue";
export type StatusMarco = "planejado" | "realizado" | "cancelado";
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
  prioridade?: Prioridade;
  prazoDesejado?: Date;
  responsavelId?: number;
  origemDesejada?: string;
}): Promise<Operacao | null> {
  const db = await getDb();
  if (!db) return null;

  if (input.prazoDesejado && input.prazoDesejado.getTime() < Date.now()) {
    throw new Error("Prazo desejado não pode ser no passado");
  }

  const codigo = await nextCodigo(db, input.userId);
  const values: InsertOperacao = {
    userId: input.userId,
    codigo,
    titulo: input.titulo,
    demandaId: input.demandaId ?? null,
    clienteNome: input.clienteNome ?? null,
    origemPais: input.origemPais ?? null,
    regimeTributario: input.regimeTributario ?? null,
    prioridade: input.prioridade ?? "media",
    prazoDesejado: input.prazoDesejado ?? null,
    responsavelId: input.responsavelId ?? null,
    origemDesejada: input.origemDesejada ?? null,
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
// Atualizar metadados da operação (prioridade, prazo, responsável, etc.)
// ---------------------------------------------------------------------------
export async function updateOperacao(input: {
  userId: number;
  operacaoId: number;
  titulo?: string;
  clienteNome?: string;
  origemPais?: string;
  regimeTributario?: "lucro_real" | "lucro_presumido" | "simples_nacional";
  prioridade?: Prioridade;
  prazoDesejado?: Date | null;
  responsavelId?: number | null;
  origemDesejada?: string;
}): Promise<Operacao | null> {
  const db = await getDb();
  if (!db) return null;

  const [op] = await db.select().from(operacoes)
    .where(and(eq(operacoes.id, input.operacaoId), eq(operacoes.userId, input.userId)))
    .limit(1);
  if (!op) throw new Error("operação não encontrada");

  if (input.prazoDesejado && input.prazoDesejado.getTime() < Date.now()) {
    throw new Error("Prazo desejado não pode ser no passado");
  }

  const patch: Partial<InsertOperacao> = {};
  if (input.titulo !== undefined) patch.titulo = input.titulo;
  if (input.clienteNome !== undefined) patch.clienteNome = input.clienteNome;
  if (input.origemPais !== undefined) patch.origemPais = input.origemPais;
  if (input.regimeTributario !== undefined) patch.regimeTributario = input.regimeTributario;
  if (input.prioridade !== undefined) patch.prioridade = input.prioridade;
  if (input.prazoDesejado !== undefined) patch.prazoDesejado = input.prazoDesejado;
  if (input.responsavelId !== undefined) patch.responsavelId = input.responsavelId;
  if (input.origemDesejada !== undefined) patch.origemDesejada = input.origemDesejada;

  if (Object.keys(patch).length === 0) return op;

  await db.update(operacoes).set(patch).where(eq(operacoes.id, input.operacaoId));
  const [updated] = await db.select().from(operacoes).where(eq(operacoes.id, input.operacaoId)).limit(1);
  return updated ?? null;
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
// Anexos (desenhos, PDFs, imagens, especificações, catálogos, cotações)
//
// O arquivo em si já foi enviado ao storage (via calculations.uploadQuotation);
// aqui só registramos o metadado + gravamos o evento na timeline (coesão).
// ---------------------------------------------------------------------------
export async function anexarDocumento(input: {
  userId: number;
  operacaoId: number;
  tipo?: TipoAnexo;
  nome: string;
  fileKey: string;
  fileUrl: string;
  contentType?: string;
  tamanhoBytes?: number;
  descricao?: string;
  autor?: "usuario" | "excambia" | "sistema";
}) {
  const db = await getDb();
  if (!db) return null;

  const [op] = await db.select().from(operacoes)
    .where(and(eq(operacoes.id, input.operacaoId), eq(operacoes.userId, input.userId)))
    .limit(1);
  if (!op) throw new Error("operação não encontrada");

  const [res] = await db.insert(operacaoAnexos).values({
    operacaoId: input.operacaoId,
    userId: input.userId,
    tipo: (input.tipo ?? "outro") as any,
    nome: input.nome,
    fileKey: input.fileKey,
    fileUrl: input.fileUrl,
    contentType: input.contentType ?? null,
    tamanhoBytes: input.tamanhoBytes ?? null,
    descricao: input.descricao ?? null,
    autor: input.autor ?? "usuario",
    estagio: op.estagioAtual as any,
  });
  const id = (res as any).insertId as number;

  await addEvento({
    operacaoId: input.operacaoId,
    tipo: "anexo_adicionado",
    estagio: op.estagioAtual as Estagio,
    refTipo: "operacao_anexos",
    refId: id,
    autor: input.autor ?? "usuario",
    titulo: `Anexo adicionado: ${input.nome}`,
    payload: { tipo: input.tipo ?? "outro", nome: input.nome },
  });

  const [anexo] = await db.select().from(operacaoAnexos).where(eq(operacaoAnexos.id, id)).limit(1);
  return anexo ?? null;
}

export async function listarAnexos(userId: number, operacaoId: number) {
  const db = await getDb();
  if (!db) return [];
  const [op] = await db.select().from(operacoes)
    .where(and(eq(operacoes.id, operacaoId), eq(operacoes.userId, userId)))
    .limit(1);
  if (!op) return [];
  return db.select().from(operacaoAnexos)
    .where(eq(operacaoAnexos.operacaoId, operacaoId))
    .orderBy(desc(operacaoAnexos.criadoEm));
}

export async function removerAnexo(userId: number, anexoId: number) {
  const db = await getDb();
  if (!db) return { ok: false, message: "sem conexão" };

  const [anexo] = await db.select().from(operacaoAnexos)
    .where(eq(operacaoAnexos.id, anexoId)).limit(1);
  if (!anexo) return { ok: false, message: "anexo não encontrado" };

  // Confirma que a operação pertence ao usuário
  const [op] = await db.select().from(operacoes)
    .where(and(eq(operacoes.id, anexo.operacaoId), eq(operacoes.userId, userId)))
    .limit(1);
  if (!op) return { ok: false, message: "sem permissão" };

  await db.delete(operacaoAnexos).where(eq(operacaoAnexos.id, anexoId));
  await addEvento({
    operacaoId: anexo.operacaoId,
    tipo: "anexo_removido",
    estagio: op.estagioAtual as Estagio,
    autor: "usuario",
    titulo: `Anexo removido: ${anexo.nome}`,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Financeiro (camada transversal): câmbio, pagamentos, impostos, despesas, receita.
// Cada lançamento grava um evento na timeline (coesão Painel ↔ Excambia).
// ---------------------------------------------------------------------------
export async function lancarFinanceiro(input: {
  userId: number;
  operacaoId: number;
  tipo?: TipoFinanceiro;
  direcao?: DirecaoFinanceiro;
  status?: StatusFinanceiro;
  descricao?: string;
  valorCents: number;
  moeda?: string;
  valorBrlCents?: number;
  cambioRate?: number;
  refTipo?: string;
  refId?: number;
  dataReferencia?: Date;
  vencimento?: Date;
  autor?: "usuario" | "excambia" | "sistema";
}) {
  const db = await getDb();
  if (!db) return null;

  const [op] = await db.select().from(operacoes)
    .where(and(eq(operacoes.id, input.operacaoId), eq(operacoes.userId, input.userId)))
    .limit(1);
  if (!op) throw new Error("operação não encontrada");

  // Se moeda BRL e sem valorBrlCents, usa o próprio valor como BRL.
  const moeda = (input.moeda ?? "BRL").toUpperCase();
  const valorBrlCents = input.valorBrlCents ?? (moeda === "BRL" ? input.valorCents : null);

  const [res] = await db.insert(operacaoFinanceiro).values({
    operacaoId: input.operacaoId,
    userId: input.userId,
    tipo: (input.tipo ?? "outro") as any,
    direcao: (input.direcao ?? "saida") as any,
    status: (input.status ?? "previsto") as any,
    descricao: input.descricao ?? null,
    valorCents: input.valorCents,
    moeda,
    valorBrlCents,
    cambioRate: input.cambioRate ?? null,
    refTipo: input.refTipo ?? null,
    refId: input.refId ?? null,
    dataReferencia: input.dataReferencia ?? null,
    vencimento: input.vencimento ?? null,
    autor: input.autor ?? "usuario",
    estagio: op.estagioAtual as any,
  });
  const id = (res as any).insertId as number;

  await addEvento({
    operacaoId: input.operacaoId,
    tipo: "financeiro_lancado",
    estagio: op.estagioAtual as Estagio,
    refTipo: "operacao_financeiro",
    refId: id,
    autor: input.autor ?? "usuario",
    titulo: `Financeiro: ${input.descricao ?? input.tipo ?? "lançamento"}`,
    payload: { tipo: input.tipo ?? "outro", direcao: input.direcao ?? "saida", valorCents: input.valorCents, moeda },
  });

  const [lanc] = await db.select().from(operacaoFinanceiro).where(eq(operacaoFinanceiro.id, id)).limit(1);
  return lanc ?? null;
}

export async function listarFinanceiro(userId: number, operacaoId: number) {
  const db = await getDb();
  if (!db) return [];
  const [op] = await db.select().from(operacoes)
    .where(and(eq(operacoes.id, operacaoId), eq(operacoes.userId, userId)))
    .limit(1);
  if (!op) return [];
  return db.select().from(operacaoFinanceiro)
    .where(eq(operacaoFinanceiro.operacaoId, operacaoId))
    .orderBy(desc(operacaoFinanceiro.criadoEm));
}

export async function removerFinanceiro(userId: number, lancamentoId: number) {
  const db = await getDb();
  if (!db) return { ok: false, message: "sem conexão" };

  const [lanc] = await db.select().from(operacaoFinanceiro)
    .where(eq(operacaoFinanceiro.id, lancamentoId)).limit(1);
  if (!lanc) return { ok: false, message: "lançamento não encontrado" };

  const [op] = await db.select().from(operacoes)
    .where(and(eq(operacoes.id, lanc.operacaoId), eq(operacoes.userId, userId)))
    .limit(1);
  if (!op) return { ok: false, message: "sem permissão" };

  await db.delete(operacaoFinanceiro).where(eq(operacaoFinanceiro.id, lancamentoId));
  await addEvento({
    operacaoId: lanc.operacaoId,
    tipo: "financeiro_removido",
    estagio: op.estagioAtual as Estagio,
    autor: "usuario",
    titulo: `Financeiro removido: ${lanc.descricao ?? lanc.tipo}`,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Marcos (pontos-chave: pedido confirmado, produção, embarque, nacionalização, entrega).
// Cada marco grava um evento na timeline (coesão Painel ↔ Excambia).
// Imutáveis: uma vez registrado, apenas marcar como cancelado.
// ---------------------------------------------------------------------------
export async function registrarMarco(input: {
  userId: number;
  operacaoId: number;
  tipo: TipoMarco;
  status?: StatusMarco;
  descricao?: string;
  dataReferencia?: Date;
  refTipo?: string;
  refId?: number;
  autor?: "usuario" | "excambia" | "sistema";
}) {
  const db = await getDb();
  if (!db) return null;

  const [op] = await db.select().from(operacoes)
    .where(and(eq(operacoes.id, input.operacaoId), eq(operacoes.userId, input.userId)))
    .limit(1);
  if (!op) throw new Error("operação não encontrada");

  // Mapeia tipo de marco → estagio esperado
  const estagioEsperado: Record<TipoMarco, Estagio | null> = {
    pedido_confirmado: "source",
    producao_iniciada: "execute",
    produto_embarcado: "execute",
    di_registrada: "finance",
    nacionalizado: "finance",
    entregue: "finance",
  };

  const [res] = await db.insert(operacaoMarcos).values({
    operacaoId: input.operacaoId,
    userId: input.userId,
    tipo: input.tipo,
    status: (input.status ?? "realizado") as any,
    descricao: input.descricao ?? null,
    dataReferencia: input.dataReferencia ?? sql`now()`,
    refTipo: input.refTipo ?? null,
    refId: input.refId ?? null,
    autor: input.autor ?? "usuario",
  });
  const id = (res as any).insertId as number;

  await addEvento({
    operacaoId: input.operacaoId,
    tipo: input.tipo as any,
    estagio: estagioEsperado[input.tipo] ?? op.estagioAtual as Estagio,
    refTipo: "operacao_marcos",
    refId: id,
    autor: input.autor ?? "usuario",
    titulo: input.descricao ?? `Marco registrado: ${input.tipo.replace(/_/g, " ")}`,
    payload: { tipo: input.tipo, status: input.status ?? "realizado" },
  });

  const [marco] = await db.select().from(operacaoMarcos).where(eq(operacaoMarcos.id, id)).limit(1);
  return marco ?? null;
}

export async function listarMarcos(userId: number, operacaoId: number) {
  const db = await getDb();
  if (!db) return [];
  const [op] = await db.select().from(operacoes)
    .where(and(eq(operacoes.id, operacaoId), eq(operacoes.userId, userId)))
    .limit(1);
  if (!op) return [];
  return db.select().from(operacaoMarcos)
    .where(eq(operacaoMarcos.operacaoId, operacaoId))
    .orderBy(operacaoMarcos.dataReferencia);
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
    prioridade: o.prioridade, prazoDesejado: o.prazoDesejado,
    responsavelId: o.responsavelId, origemDesejada: o.origemDesejada,
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
  const anexos = await db.select().from(operacaoAnexos)
    .where(eq(operacaoAnexos.operacaoId, id))
    .orderBy(desc(operacaoAnexos.criadoEm));
  const financeiro = await db.select().from(operacaoFinanceiro)
    .where(eq(operacaoFinanceiro.operacaoId, id))
    .orderBy(desc(operacaoFinanceiro.criadoEm));
  const marcos = await db.select().from(operacaoMarcos)
    .where(eq(operacaoMarcos.operacaoId, id))
    .orderBy(operacaoMarcos.dataReferencia);
  return { operacao: op, eventos, estagios, anexos, financeiro, marcos };
}
