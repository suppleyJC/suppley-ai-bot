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
import { and, desc, eq, like, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import {
  operacoes, operacaoEventos, operacaoEstagios, operacaoAnexos, operacaoFinanceiro, operacaoMarcos, demandas,
  quotations, conversas, users,
  type InsertOperacao, type Operacao, type OperacaoAnexo,
} from "../../drizzle/schema";
import { storageGet } from "../storage";

export type Estagio = "demand" | "source" | "analyze" | "execute" | "finance" | "closed" | "lost";
export type Prioridade = "baixa" | "media" | "alta" | "critica";
export type TipoAnexo = "desenho" | "pdf" | "imagem" | "especificacao" | "catalogo" | "cotacao" | "outro";
export type TipoFinanceiro =
  | "cambio" | "pagamento_fornecedor" | "imposto" | "frete" | "seguro"
  | "despesa_local" | "comissao" | "receita" | "outro";
export type DirecaoFinanceiro = "entrada" | "saida";
export type StatusFinanceiro = "previsto" | "realizado" | "cancelado";
export type TipoMarco =
  | "item_pesquisado" | "fornecedores_identificados"
  | "rfq_enviada" | "cotacao_recebida" | "fornecedor_selecionado"
  | "calculo_feito" | "go_aprovado"
  | "pedido_confirmado" | "producao_iniciada" | "produto_embarcado"
  | "di_registrada" | "nacionalizado" | "entregue";
export type StatusMarco = "planejado" | "realizado" | "cancelado";
export type ModoOperacao = "cotacao" | "desenvolvimento";
// QUEM deve agir num marco (dimensão separada do estado do trabalho).
export type Responsavel =
  | "cliente" | "excambia" | "fornecedor" | "agente" | "despachante" | "anuente" | "sistema";
// Saúde do prazo — DERIVADA do vencimento + status (não é coluna).
export type SaudePrazo = "no_prazo" | "atencao" | "atrasado" | "sem_prazo";
const ORDER: Estagio[] = ["demand", "source", "analyze", "execute", "finance", "closed"];

// ---------------------------------------------------------------------------
// Vocabulário ÚNICO da jornada (fonte de verdade compartilhada Painel ↔ Excambia).
// Os rótulos espelham client/src/lib/stageLabels.ts e OperacaoMarcos.tsx —
// alterar lá exige alterar aqui (e vice-versa) para o chat e o painel falarem
// a mesma língua.
// ---------------------------------------------------------------------------
export const STAGE_LABEL_PT: Record<Estagio, string> = {
  demand: "Estudo do item", source: "Cotação e RFQ", analyze: "Viabilidade",
  execute: "Produção e Embarque", finance: "Nacionalização e Entrega",
  closed: "Encerrada", lost: "Perdida",
};

export const MARCO_LABEL_PT: Record<TipoMarco, string> = {
  item_pesquisado: "Item pesquisado",
  fornecedores_identificados: "Fornecedores identificados",
  rfq_enviada: "RFQ enviada",
  cotacao_recebida: "Cotação recebida",
  fornecedor_selecionado: "Fornecedor selecionado",
  calculo_feito: "Cálculo feito",
  go_aprovado: "GO aprovado",
  pedido_confirmado: "Pedido confirmado",
  producao_iniciada: "Produção iniciada",
  produto_embarcado: "Produto embarcado",
  di_registrada: "DI registrada",
  nacionalizado: "Nacionalizado",
  entregue: "Entregue",
};

/** Estágio da jornada a que cada marco pertence (agrupamento do funil). */
export const MARCO_ESTAGIO: Record<TipoMarco, Estagio> = {
  item_pesquisado: "demand",
  fornecedores_identificados: "demand",
  rfq_enviada: "source",
  cotacao_recebida: "source",
  fornecedor_selecionado: "source",
  calculo_feito: "analyze",
  go_aprovado: "analyze",
  pedido_confirmado: "execute",
  producao_iniciada: "execute",
  produto_embarcado: "execute",
  di_registrada: "finance",
  nacionalizado: "finance",
  entregue: "finance",
};

/** Tipo de evento da timeline gerado por cada marco (alguns reusam eventos existentes). */
const MARCO_EVENTO: Record<TipoMarco, string> = {
  item_pesquisado: "item_pesquisado",
  fornecedores_identificados: "fornecedores_identificados",
  rfq_enviada: "rfq_enviada",
  cotacao_recebida: "cotacao_recebida",
  fornecedor_selecionado: "fornecedor_selecionado",
  calculo_feito: "calculo_executado",
  go_aprovado: "go_decidido",
  pedido_confirmado: "pedido_confirmado",
  producao_iniciada: "producao_iniciada",
  produto_embarcado: "produto_embarcado",
  di_registrada: "di_registrada",
  nacionalizado: "nacionalizado",
  entregue: "entregue",
};

// ---------------------------------------------------------------------------
// DERIVAÇÃO DA JORNADA — próxima ação ("Agora"), pendências e progresso.
// Tudo calculado a partir dos marcos já existentes; nenhuma coluna nova além
// de responsavel/vencimento. Alimenta o cabeçalho executivo e o cartão "Agora".
// ---------------------------------------------------------------------------

/** Ordem canônica dos 13 marcos (funil da jornada). */
export const MARCO_ORDER: TipoMarco[] = [
  "item_pesquisado", "fornecedores_identificados",
  "rfq_enviada", "cotacao_recebida", "fornecedor_selecionado",
  "calculo_feito", "go_aprovado",
  "pedido_confirmado", "producao_iniciada", "produto_embarcado",
  "di_registrada", "nacionalizado", "entregue",
];

/** Responsável SUGERIDO por marco (usado quando não há responsável manual). */
export const MARCO_RESPONSAVEL_DEFAULT: Record<TipoMarco, Responsavel> = {
  item_pesquisado: "excambia",
  fornecedores_identificados: "excambia",
  rfq_enviada: "excambia",
  cotacao_recebida: "fornecedor",
  fornecedor_selecionado: "cliente",
  calculo_feito: "excambia",
  go_aprovado: "cliente",
  pedido_confirmado: "cliente",
  producao_iniciada: "fornecedor",
  produto_embarcado: "fornecedor",
  di_registrada: "despachante",
  nacionalizado: "despachante",
  entregue: "agente",
};

/** Verbo de ação por marco (texto do cartão "Agora"). */
export const MARCO_ACAO_PT: Record<TipoMarco, string> = {
  item_pesquisado: "Pesquisar o item (preço médio, países, concorrentes)",
  fornecedores_identificados: "Mapear fornecedores elegíveis",
  rfq_enviada: "Enviar a RFQ aos fornecedores",
  cotacao_recebida: "Receber e registrar as cotações",
  fornecedor_selecionado: "Selecionar o fornecedor",
  calculo_feito: "Calcular a viabilidade (landed cost)",
  go_aprovado: "Aprovar a viabilidade (GO / NO-GO)",
  pedido_confirmado: "Confirmar o pedido (PO)",
  producao_iniciada: "Acompanhar o início da produção",
  produto_embarcado: "Confirmar o embarque",
  di_registrada: "Registrar a declaração (DI / DUIMP)",
  nacionalizado: "Concluir o desembaraço",
  entregue: "Confirmar a entrega final",
};

function saudeDoPrazo(vencimento?: Date | string | null): SaudePrazo {
  if (!vencimento) return "sem_prazo";
  const diffDias = (new Date(vencimento).getTime() - Date.now()) / 86_400_000;
  if (diffDias < 0) return "atrasado";
  if (diffDias <= 2) return "atencao";
  return "no_prazo";
}

interface MarcoRow {
  tipo: string;
  status: string;
  responsavel?: string | null;
  vencimento?: Date | string | null;
  dataReferencia?: Date | string | null;
}

interface MarcoInfo {
  tipo: TipoMarco;
  label: string;
  acao: string;
  estagio: Estagio;
  responsavel: Responsavel;
  vencimento: string | null;
  saudePrazo: SaudePrazo;
}

export interface JornadaResumo {
  progressoPct: number;
  realizados: number;
  total: number;
  proximaAcao: MarcoInfo | null;
  pendencias: (MarcoInfo & { status: StatusMarco })[];
  riscos: number;
}

/**
 * Resume a jornada para o cabeçalho executivo e o cartão "Agora":
 *  - progresso (marcos realizados / 13)
 *  - próxima ação (primeiro marco não concluído, com responsável e prazo)
 *  - pendências (não concluídos, ordenados por urgência)
 *  - riscos (pendências atrasadas ou em atenção)
 */
export function computeJornadaResumo(marcos: MarcoRow[]): JornadaResumo {
  // Um marco por tipo: "realizado" tem precedência; senão, o mais recente.
  const byTipo = new Map<TipoMarco, MarcoRow>();
  for (const m of marcos) {
    const t = m.tipo as TipoMarco;
    if (!MARCO_ORDER.includes(t)) continue;
    const prev = byTipo.get(t);
    if (!prev || m.status === "realizado" || prev.status !== "realizado") byTipo.set(t, m);
  }

  const total = MARCO_ORDER.length;
  const realizados = MARCO_ORDER.filter((t) => byTipo.get(t)?.status === "realizado").length;
  const progressoPct = Math.round((realizados / total) * 100);

  const concluido = (t: TipoMarco) => {
    const s = byTipo.get(t)?.status;
    return s === "realizado" || s === "cancelado";
  };

  const info = (t: TipoMarco): MarcoInfo => {
    const m = byTipo.get(t);
    return {
      tipo: t,
      label: MARCO_LABEL_PT[t],
      acao: MARCO_ACAO_PT[t],
      estagio: MARCO_ESTAGIO[t],
      responsavel: (m?.responsavel as Responsavel) ?? MARCO_RESPONSAVEL_DEFAULT[t],
      vencimento: m?.vencimento ? new Date(m.vencimento).toISOString() : null,
      saudePrazo: saudeDoPrazo(m?.vencimento),
    };
  };

  const naoConcluidos = MARCO_ORDER.filter((t) => !concluido(t));
  const proximaAcao = naoConcluidos.length ? info(naoConcluidos[0]) : null;

  const PESO: Record<SaudePrazo, number> = { atrasado: 0, atencao: 1, no_prazo: 2, sem_prazo: 3 };
  const pendencias = naoConcluidos
    .map((t) => ({ ...info(t), status: (byTipo.get(t)?.status as StatusMarco) ?? "planejado" }))
    .sort((a, b) =>
      PESO[a.saudePrazo] !== PESO[b.saudePrazo]
        ? PESO[a.saudePrazo] - PESO[b.saudePrazo]
        : MARCO_ORDER.indexOf(a.tipo) - MARCO_ORDER.indexOf(b.tipo),
    );

  const riscos = pendencias.filter((p) => p.saudePrazo === "atrasado" || p.saudePrazo === "atencao").length;

  return { progressoPct, realizados, total, proximaAcao, pendencias, riscos };
}

// ---------------------------------------------------------------------------
// NÍVEL DE ACESSO: usuário comum só enxerga/atua no que criou; administrador
// tem visibilidade e acesso TOTAL (o filtro de posse é dispensado).
// ---------------------------------------------------------------------------
function posseOperacao(operacaoId: number, userId: number, admin?: boolean): SQL | undefined {
  return admin
    ? eq(operacoes.id, operacaoId)
    : and(eq(operacoes.id, operacaoId), eq(operacoes.userId, userId));
}

/**
 * Corrige nomes gravados com escapes JSON literais no legado
 * ("Acess\\u00f3rios" → "Acessórios").
 */
function decodeUnicodeEscapes(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Prepara anexos para a UI: RE-ASSINA a URL de download a partir do fileKey
 * (a fileUrl gravada no banco é pré-assinada e EXPIRA em ~1h — era por isso
 * que "abrir anexo do card" caía em AccessDenied/Request has expired).
 * Best-effort: sem fileKey (legado) ou falha no storage, mantém a URL salva.
 */
const ANEXO_URL_TTL = 6 * 3600; // cobre a sessão de trabalho
async function prepararAnexos<T extends Pick<OperacaoAnexo, "nome" | "fileKey" | "fileUrl">>(
  anexos: T[],
): Promise<T[]> {
  return Promise.all(
    anexos.map(async (a) => {
      let fileUrl = a.fileUrl;
      if (a.fileKey) {
        try { fileUrl = (await storageGet(a.fileKey, ANEXO_URL_TTL)).url; } catch { /* mantém a salva */ }
      }
      return { ...a, nome: decodeUnicodeEscapes(a.nome), fileUrl };
    }),
  );
}

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
  modo?: ModoOperacao;
  /** Estágio em que a operação nasce (default "demand"). Modo "cotacao" → "analyze". */
  estagioInicial?: Estagio;
}): Promise<Operacao | null> {
  const db = await getDb();
  if (!db) return null;

  if (input.prazoDesejado && input.prazoDesejado.getTime() < Date.now()) {
    throw new Error("Prazo desejado não pode ser no passado");
  }

  // Estágio inicial: explícito > derivado do modo > "demand".
  const estagioInicial: Estagio =
    input.estagioInicial ?? (input.modo === "cotacao" ? "analyze" : "demand");

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
    modo: input.modo ?? null,
    estagioAtual: estagioInicial,
    status: "ativa",
  };
  const [res] = await db.insert(operacoes).values(values);
  const id = (res as any).insertId as number;

  await db.insert(operacaoEstagios).values({ operacaoId: id, estagio: estagioInicial as any });
  await addEvento({
    operacaoId: id, tipo: "operacao_criada", estagio: estagioInicial, autor: "sistema",
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
  modo?: ModoOperacao;
  trackingContainer?: string | null;
  trackingBl?: string | null;
  trackingArmador?: string | null;
  trackingNavio?: string | null;
  trackingEta?: Date | null;
  trackingStatus?: string | null;
  admin?: boolean;
}): Promise<Operacao | null> {
  const db = await getDb();
  if (!db) return null;

  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(input.operacaoId, input.userId, input.admin))
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
  if (input.modo !== undefined) patch.modo = input.modo;
  if (input.trackingContainer !== undefined) patch.trackingContainer = input.trackingContainer;
  if (input.trackingBl !== undefined) patch.trackingBl = input.trackingBl;
  if (input.trackingArmador !== undefined) patch.trackingArmador = input.trackingArmador;
  if (input.trackingNavio !== undefined) patch.trackingNavio = input.trackingNavio;
  if (input.trackingEta !== undefined) patch.trackingEta = input.trackingEta;
  if (input.trackingStatus !== undefined) patch.trackingStatus = input.trackingStatus;

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
  /** Posse: quando informado, usuário comum só avança a própria operação. */
  userId?: number;
  admin?: boolean;
}): Promise<{ ok: boolean; estagio?: Estagio; message?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, message: "sem conexão" };

  const [op] = await db.select().from(operacoes)
    .where(input.userId != null
      ? posseOperacao(input.operacaoId, input.userId, input.admin)
      : eq(operacoes.id, input.operacaoId))
    .limit(1);
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
// Mover de estágio MANUALMENTE (Kanban drag-and-drop)
// Diferente de advanceStage: permite mover em qualquer direção (inclusive
// voltar), sem checagem de gate — é uma ação explícita do usuário arrastando
// o card. Registra o movimento na timeline.
// ---------------------------------------------------------------------------
export async function setStageManual(input: {
  operacaoId: number;
  to: Estagio;
  /** Posse: quando informado, usuário comum só move a própria operação. */
  userId?: number;
  admin?: boolean;
}): Promise<{ ok: boolean; estagio?: Estagio; message?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, message: "sem conexão" };

  const [op] = await db.select().from(operacoes)
    .where(input.userId != null
      ? posseOperacao(input.operacaoId, input.userId, input.admin)
      : eq(operacoes.id, input.operacaoId))
    .limit(1);
  if (!op) return { ok: false, message: "operação não encontrada" };

  const current = op.estagioAtual as Estagio;
  if (current === input.to) return { ok: true, estagio: current };

  // Fecha o estágio atual (se ainda aberto)
  await db.update(operacaoEstagios)
    .set({ saiuEm: sql`now()` })
    .where(and(
      eq(operacaoEstagios.operacaoId, op.id),
      eq(operacaoEstagios.estagio, current as any),
      sql`${operacaoEstagios.saiuEm} is null`,
    ));

  // Abre o novo (se for um dos 5 estágios operacionais)
  if (["demand", "source", "analyze", "execute", "finance"].includes(input.to)) {
    await db.insert(operacaoEstagios).values({ operacaoId: op.id, estagio: input.to as any });
  }

  // Sincroniza status quando move para estados finais (e destrava se voltar).
  const patch: Record<string, unknown> = { estagioAtual: input.to as any };
  if (input.to === "closed") patch.status = "concluida";
  else if (input.to === "lost") patch.status = "perdida";
  else if (op.status === "concluida" || op.status === "perdida") patch.status = "ativa";
  await db.update(operacoes).set(patch).where(eq(operacoes.id, op.id));

  await addEvento({
    operacaoId: op.id, tipo: "estagio_avancado", estagio: input.to, autor: "usuario",
    titulo: `Movido para ${STAGE_LABEL_PT[input.to]}`,
  });
  return { ok: true, estagio: input.to };
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
  admin?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  // Posse: usuário comum só decide sobre a própria operação.
  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(input.operacaoId, input.decidedBy, input.admin))
    .limit(1);
  if (!op) throw new Error("operação não encontrada");
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
  admin?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;

  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(input.operacaoId, input.userId, input.admin))
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

export async function listarAnexos(userId: number, operacaoId: number, admin = false) {
  const db = await getDb();
  if (!db) return [];
  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(operacaoId, userId, admin))
    .limit(1);
  if (!op) return [];
  const rows = await db.select().from(operacaoAnexos)
    .where(eq(operacaoAnexos.operacaoId, operacaoId))
    .orderBy(desc(operacaoAnexos.criadoEm));
  // Link sempre abrível (re-assinado) + nome saneado.
  return prepararAnexos(rows);
}

export async function removerAnexo(userId: number, anexoId: number, admin = false) {
  const db = await getDb();
  if (!db) return { ok: false, message: "sem conexão" };

  const [anexo] = await db.select().from(operacaoAnexos)
    .where(eq(operacaoAnexos.id, anexoId)).limit(1);
  if (!anexo) return { ok: false, message: "anexo não encontrado" };

  // Confirma que a operação pertence ao usuário (admin passa direto)
  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(anexo.operacaoId, userId, admin))
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
  admin?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;

  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(input.operacaoId, input.userId, input.admin))
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

export async function listarFinanceiro(userId: number, operacaoId: number, admin = false) {
  const db = await getDb();
  if (!db) return [];
  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(operacaoId, userId, admin))
    .limit(1);
  if (!op) return [];
  return db.select().from(operacaoFinanceiro)
    .where(eq(operacaoFinanceiro.operacaoId, operacaoId))
    .orderBy(desc(operacaoFinanceiro.criadoEm));
}

export async function removerFinanceiro(userId: number, lancamentoId: number, admin = false) {
  const db = await getDb();
  if (!db) return { ok: false, message: "sem conexão" };

  const [lanc] = await db.select().from(operacaoFinanceiro)
    .where(eq(operacaoFinanceiro.id, lancamentoId)).limit(1);
  if (!lanc) return { ok: false, message: "lançamento não encontrado" };

  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(lanc.operacaoId, userId, admin))
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

// RESILIÊNCIA A DEPLOY-ANTES-DA-MIGRAÇÃO: o schema já declara responsavel/vencimento
// (migração 0043), mas se o binário subir antes de aplicá-la, o MySQL responde
// "Unknown column" e derruba a operação inteira. Os helpers abaixo detectam esse
// caso e caem para as colunas-base, tratando os campos novos como null — o painel
// abre e funciona com ou sem a migração; ao aplicá-la, os campos passam a persistir.
function isMissingColumnError(e: unknown): boolean {
  const msg = (e as any)?.message ?? String(e ?? "");
  const code = (e as any)?.code ?? "";
  return code === "ER_BAD_FIELD_ERROR" || /unknown column|no such column|ER_BAD_FIELD_ERROR/i.test(msg);
}

// Colunas garantidas em produção (pré-0043). Sem responsavel/vencimento.
const MARCO_COLS_BASE = {
  id: operacaoMarcos.id,
  operacaoId: operacaoMarcos.operacaoId,
  userId: operacaoMarcos.userId,
  tipo: operacaoMarcos.tipo,
  status: operacaoMarcos.status,
  descricao: operacaoMarcos.descricao,
  dataReferencia: operacaoMarcos.dataReferencia,
  refTipo: operacaoMarcos.refTipo,
  refId: operacaoMarcos.refId,
  autor: operacaoMarcos.autor,
  criadoEm: operacaoMarcos.criadoEm,
} as const;

/** SELECT de marcos com fallback para colunas-base quando a 0043 ainda não rodou. */
async function fetchMarcos(
  db: any,
  whereExpr: any,
  opts: { ordenar?: boolean; unico?: boolean } = {},
): Promise<any[]> {
  const build = (cols?: any) => {
    let q = (cols ? db.select(cols) : db.select()).from(operacaoMarcos).where(whereExpr);
    if (opts.ordenar) q = q.orderBy(operacaoMarcos.dataReferencia);
    if (opts.unico) q = q.limit(1);
    return q;
  };
  try {
    return await build();
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    const rows = await build(MARCO_COLS_BASE);
    return rows.map((r: any) => ({ ...r, responsavel: null, vencimento: null }));
  }
}

/** INSERT de marco com fallback: sem responsavel/vencimento quando a 0043 ainda não rodou. */
async function inserirMarco(db: any, values: Record<string, unknown>): Promise<any> {
  try {
    return await db.insert(operacaoMarcos).values(values);
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    const { responsavel, vencimento, ...base } = values;
    return db.insert(operacaoMarcos).values(base);
  }
}

export async function registrarMarco(input: {
  userId: number;
  operacaoId: number;
  tipo: TipoMarco;
  status?: StatusMarco;
  descricao?: string;
  dataReferencia?: Date;
  responsavel?: Responsavel;
  vencimento?: Date | null;
  refTipo?: string;
  refId?: number;
  autor?: "usuario" | "excambia" | "sistema";
  admin?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;

  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(input.operacaoId, input.userId, input.admin))
    .limit(1);
  if (!op) throw new Error("operação não encontrada");

  const [res] = await inserirMarco(db, {
    operacaoId: input.operacaoId,
    userId: input.userId,
    tipo: input.tipo,
    status: (input.status ?? "realizado") as any,
    descricao: input.descricao ?? null,
    dataReferencia: input.dataReferencia ?? sql`now()`,
    responsavel: (input.responsavel ?? null) as any,
    vencimento: input.vencimento ?? null,
    refTipo: input.refTipo ?? null,
    refId: input.refId ?? null,
    autor: input.autor ?? "usuario",
  });
  const id = (res as any).insertId as number;

  await addEvento({
    operacaoId: input.operacaoId,
    tipo: (MARCO_EVENTO[input.tipo] ?? "alerta_ia") as any,
    estagio: MARCO_ESTAGIO[input.tipo] ?? op.estagioAtual as Estagio,
    refTipo: "operacao_marcos",
    refId: id,
    autor: input.autor ?? "usuario",
    titulo: input.descricao ?? `Marco registrado: ${MARCO_LABEL_PT[input.tipo] ?? input.tipo}`,
    payload: { tipo: input.tipo, status: input.status ?? "realizado" },
  });

  // CONVERGÊNCIA JORNADA ↔ PAINEL: um marco REALIZADO de um estágio à frente
  // avança a operação (o card muda de coluna sozinho — registrado no chat OU
  // no painel, a esteira conta a mesma história). Nunca volta estágio, nunca
  // reabre operação encerrada/perdida.
  let estagioSincronizado: Estagio | null = null;
  const alvo = MARCO_ESTAGIO[input.tipo];
  const atual = op.estagioAtual as Estagio;
  if (
    (input.status ?? "realizado") === "realizado" &&
    alvo && !["closed", "lost"].includes(atual) &&
    ORDER.indexOf(alvo) > ORDER.indexOf(atual)
  ) {
    await db.update(operacaoEstagios)
      .set({ saiuEm: sql`now()` })
      .where(and(
        eq(operacaoEstagios.operacaoId, op.id),
        eq(operacaoEstagios.estagio, atual as any),
        sql`${operacaoEstagios.saiuEm} is null`,
      ));
    await db.insert(operacaoEstagios).values({ operacaoId: op.id, estagio: alvo as any });
    await db.update(operacoes).set({ estagioAtual: alvo as any }).where(eq(operacoes.id, op.id));
    await addEvento({
      operacaoId: op.id, tipo: "estagio_avancado", estagio: alvo,
      autor: input.autor ?? "usuario",
      titulo: `Jornada avançou para ${STAGE_LABEL_PT[alvo]} (marco: ${MARCO_LABEL_PT[input.tipo]})`,
    });
    estagioSincronizado = alvo;
  }

  const [marco] = await fetchMarcos(db, eq(operacaoMarcos.id, id), { unico: true });
  if (!marco) return null;
  // Anexa a informação de sincronia para quem registrou poder narrar o avanço.
  return { ...marco, estagioSincronizado };
}

/**
 * Edita campos de planejamento de um marco JÁ EXISTENTE (responsável, prazo,
 * descrição). Não altera status nem dispara sincronia de estágio — para marcar
 * como realizado use registrarMarco. Atualização parcial (só o que veio).
 */
export async function atualizarMarco(input: {
  userId: number;
  marcoId: number;
  responsavel?: Responsavel | null;
  vencimento?: Date | null;
  descricao?: string | null;
  admin?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;

  // Posse via join à operação (o marco pertence à operação do usuário).
  // Projeção só do dono para não arrastar responsavel/vencimento pré-0043.
  const [row] = await db
    .select({ id: operacaoMarcos.id, opUser: operacoes.userId })
    .from(operacaoMarcos)
    .innerJoin(operacoes, eq(operacoes.id, operacaoMarcos.operacaoId))
    .where(eq(operacaoMarcos.id, input.marcoId))
    .limit(1);
  if (!row) throw new Error("marco não encontrado");
  if (!input.admin && row.opUser !== input.userId) throw new Error("sem acesso a este marco");

  const patch: Record<string, unknown> = {};
  if (input.responsavel !== undefined) patch.responsavel = input.responsavel;
  if (input.vencimento !== undefined) patch.vencimento = input.vencimento;
  if (input.descricao !== undefined) patch.descricao = input.descricao;

  if (Object.keys(patch).length > 0) {
    try {
      await db.update(operacaoMarcos).set(patch as any).where(eq(operacaoMarcos.id, input.marcoId));
    } catch (e) {
      if (!isMissingColumnError(e)) throw e;
      // Pré-0043: aplica só o que existe (descricao); responsavel/vencimento ficam para depois da migração.
      const { responsavel, vencimento, ...rest } = patch;
      if (Object.keys(rest).length > 0) {
        await db.update(operacaoMarcos).set(rest as any).where(eq(operacaoMarcos.id, input.marcoId));
      }
    }
  }
  const [marco] = await fetchMarcos(db, eq(operacaoMarcos.id, input.marcoId), { unico: true });
  return marco ?? null;
}

export async function listarMarcos(userId: number, operacaoId: number, admin = false) {
  const db = await getDb();
  if (!db) return [];
  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(operacaoId, userId, admin))
    .limit(1);
  if (!op) return [];
  return fetchMarcos(db, eq(operacaoMarcos.operacaoId, operacaoId), { ordenar: true });
}

// ---------------------------------------------------------------------------
// Concluir operação (fechamento do ciclo previsto × realizado).
// Marca status "concluida" + estágio "closed" e registra o evento na timeline.
// ---------------------------------------------------------------------------
export async function concluirOperacao(input: {
  userId: number;
  operacaoId: number;
  resumo?: string;
  admin?: boolean;
}): Promise<Operacao | null> {
  const db = await getDb();
  if (!db) return null;

  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(input.operacaoId, input.userId, input.admin))
    .limit(1);
  if (!op) throw new Error("operação não encontrada");

  await db.update(operacoes)
    .set({ status: "concluida", estagioAtual: "closed" })
    .where(eq(operacoes.id, input.operacaoId));

  await addEvento({
    operacaoId: input.operacaoId,
    tipo: "estagio_avancado",
    estagio: "closed",
    autor: "excambia",
    titulo: `Operação ${op.codigo} concluída`,
    payload: input.resumo ? { resumo: input.resumo } : undefined,
  });

  const [updated] = await db.select().from(operacoes)
    .where(eq(operacoes.id, input.operacaoId)).limit(1);
  return updated ?? null;
}

// ---------------------------------------------------------------------------
// Excluir operação (e toda a sua descendência) — Fase 3.
// Remove eventos, estágios, anexos, financeiro e marcos antes da própria
// operação. Validando posse. Não há "soft delete": a esteira é apagada.
// ---------------------------------------------------------------------------
export async function deleteOperacao(userId: number, operacaoId: number, admin = false) {
  const db = await getDb();
  if (!db) return { ok: false, message: "sem conexão" };

  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(operacaoId, userId, admin))
    .limit(1);
  if (!op) return { ok: false, message: "operação não encontrada" };

  await db.delete(operacaoMarcos).where(eq(operacaoMarcos.operacaoId, operacaoId));
  await db.delete(operacaoFinanceiro).where(eq(operacaoFinanceiro.operacaoId, operacaoId));
  await db.delete(operacaoAnexos).where(eq(operacaoAnexos.operacaoId, operacaoId));
  await db.delete(operacaoEventos).where(eq(operacaoEventos.operacaoId, operacaoId));
  await db.delete(operacaoEstagios).where(eq(operacaoEstagios.operacaoId, operacaoId));
  // Conversas ligadas à operação ficam órfãs → desvincula (não apaga o chat).
  await db.update(conversas).set({ operacaoId: null }).where(eq(conversas.operacaoId, operacaoId));
  await db.delete(operacoes).where(eq(operacoes.id, operacaoId));

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Duplicar operação — Fase 3.
// Cria uma operação NOVA copiando só os metadados de planejamento (título,
// cliente, fornecedor, regime, prioridade, origem). Não copia a esteira
// (eventos, cálculo, cotação, marcos): a cópia começa do zero no estágio demand.
// ---------------------------------------------------------------------------
export async function duplicateOperacao(userId: number, operacaoId: number, admin = false): Promise<Operacao | null> {
  const db = await getDb();
  if (!db) return null;

  const [src] = await db.select().from(operacoes)
    .where(posseOperacao(operacaoId, userId, admin))
    .limit(1);
  if (!src) throw new Error("operação não encontrada");

  return createOperacao({
    userId,
    titulo: `${src.titulo} (cópia)`,
    clienteNome: src.clienteNome ?? undefined,
    origemPais: src.origemPais ?? undefined,
    regimeTributario: src.regimeTributario ?? undefined,
    prioridade: (src.prioridade ?? undefined) as Prioridade | undefined,
    origemDesejada: src.origemDesejada ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Leituras (consumidas pelo Kanban e pela tela da operação)
// ---------------------------------------------------------------------------
export async function listOperacoes(userId: number, admin = false) {
  const db = await getDb();
  if (!db) return [];
  // Auditoria no card: quem criou + quando. Admin vê as operações de TODOS.
  const rows = await db
    .select({ op: operacoes, criadoPorNome: users.name, criadoPorEmail: users.email })
    .from(operacoes)
    .leftJoin(users, eq(users.id, operacoes.userId))
    .where(admin ? undefined : eq(operacoes.userId, userId))
    .orderBy(desc(operacoes.atualizadaEm));
  return rows.map(({ op: o, criadoPorNome, criadoPorEmail }) => ({
    id: o.id, codigo: o.codigo, titulo: o.titulo,
    estagioAtual: o.estagioAtual, status: o.status,
    clienteNome: o.clienteNome, fornecedorNome: o.fornecedorNome,
    valorEstimadoBrl: o.valorEstimadoBrlCents, margemEstimada: o.margemEstimadaBp,
    prioridade: o.prioridade, prazoDesejado: o.prazoDesejado,
    responsavelId: o.responsavelId, origemDesejada: o.origemDesejada,
    modo: o.modo,
    criadaEm: o.criadaEm,
    atualizadaEm: o.atualizadaEm,
    criadoPorNome: criadoPorNome || criadoPorEmail || null,
  }));
}

export async function getOperacao(userId: number, id: number, admin = false) {
  const db = await getDb();
  if (!db) return null;
  const [op] = await db.select().from(operacoes)
    .where(posseOperacao(id, userId, admin)).limit(1);
  if (!op) return null;
  const eventos = await db.select().from(operacaoEventos)
    .where(eq(operacaoEventos.operacaoId, id))
    .orderBy(desc(operacaoEventos.criadoEm));
  const estagios = await db.select().from(operacaoEstagios)
    .where(eq(operacaoEstagios.operacaoId, id));
  const anexosRaw = await db.select().from(operacaoAnexos)
    .where(eq(operacaoAnexos.operacaoId, id))
    .orderBy(desc(operacaoAnexos.criadoEm));
  // Link SEMPRE abrível: re-assina pelo fileKey (a URL salva expira em ~1h).
  const anexos = await prepararAnexos(anexosRaw);
  const financeiro = await db.select().from(operacaoFinanceiro)
    .where(eq(operacaoFinanceiro.operacaoId, id))
    .orderBy(desc(operacaoFinanceiro.criadoEm));
  const marcos = await fetchMarcos(db, eq(operacaoMarcos.operacaoId, id), { ordenar: true });
  // Auditoria: quem criou a operação (nome do usuário; e-mail como fallback).
  const [dono] = await db.select({ name: users.name, email: users.email })
    .from(users).where(eq(users.id, op.userId)).limit(1);
  return {
    operacao: op, eventos, estagios, anexos, financeiro, marcos,
    criadoPorNome: dono?.name || dono?.email || null,
    // Derivação para o cabeçalho executivo e o cartão "Agora".
    jornada: computeJornadaResumo(marcos),
  };
}

// ---------------------------------------------------------------------------
// Snapshot da operação para o CHAT (injetado no system prompt da Excambia).
// É o elo Painel → Chat: tudo que acontece no painel (marcos, anexos,
// financeiro, movimentos de coluna) chega à Excambia a cada mensagem, sem
// depender de ela chamar consultar_operacao.
// ---------------------------------------------------------------------------
const AUTOR_LABEL: Record<string, string> = {
  usuario: "pessoa, no painel", excambia: "você, no chat", sistema: "sistema",
};

export async function getOperacaoContextoChat(
  userId: number,
  operacaoId: number,
): Promise<string | null> {
  const det = await getOperacao(userId, operacaoId);
  if (!det) return null;
  const { operacao: op, eventos, marcos, anexos, financeiro } = det;

  const brl = (cents?: number | null) =>
    cents == null ? null : `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const dt = (d: Date | string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  const linhas: string[] = [];
  linhas.push(
    `${op.codigo} — ${op.titulo} · estágio: ${STAGE_LABEL_PT[op.estagioAtual as Estagio] ?? op.estagioAtual} · status: ${op.status}` +
    (op.modo ? ` · modo: ${op.modo}` : ""),
  );
  const meta = [
    op.clienteNome ? `cliente: ${op.clienteNome}` : null,
    op.fornecedorNome ? `fornecedor: ${op.fornecedorNome}` : null,
    op.origemPais || op.origemDesejada ? `origem: ${op.origemPais ?? op.origemDesejada}` : null,
    brl(op.valorEstimadoBrlCents) ? `valor estimado: ${brl(op.valorEstimadoBrlCents)}` : null,
    op.prazoDesejado ? `prazo desejado: ${dt(op.prazoDesejado)}` : null,
  ].filter(Boolean);
  if (meta.length) linhas.push(meta.join(" · "));

  const realizados = marcos.filter((m) => m.status === "realizado");
  const pendentes = (Object.keys(MARCO_LABEL_PT) as TipoMarco[])
    .filter((t) => !realizados.some((m) => m.tipo === t));
  linhas.push(
    `Marcos realizados (${realizados.length}/13): ` +
    (realizados.length
      ? realizados.map((m) => `${MARCO_LABEL_PT[m.tipo as TipoMarco] ?? m.tipo} (${dt(m.dataReferencia)})`).join(", ")
      : "nenhum ainda"),
  );
  if (pendentes.length) {
    linhas.push(`Próximos marcos da jornada: ${pendentes.slice(0, 4).map((t) => MARCO_LABEL_PT[t]).join(", ")}${pendentes.length > 4 ? "…" : ""}`);
  }
  if (anexos.length) {
    linhas.push(`Documentos anexados (${anexos.length}): ${anexos.slice(0, 6).map((a) => a.nome).join(", ")}${anexos.length > 6 ? "…" : ""}`);
  }
  if (financeiro.length) {
    const saida = financeiro.filter((f) => f.direcao === "saida")
      .reduce((s, f) => s + (f.valorBrlCents ?? f.valorCents ?? 0), 0);
    linhas.push(`Financeiro: ${financeiro.length} lançamento(s) · saídas ${brl(saida) ?? "—"}`);
  }

  // Timeline (mais recente primeiro) — inclui ações feitas no painel.
  const recentes = eventos.slice(0, 8);
  if (recentes.length) {
    linhas.push("Últimos acontecimentos (timeline):");
    for (const e of recentes) {
      linhas.push(`- ${dt(e.criadoEm)} [${AUTOR_LABEL[e.autor] ?? e.autor}] ${e.titulo ?? e.tipo}`);
    }
  }

  return linhas.join("\n");
}
