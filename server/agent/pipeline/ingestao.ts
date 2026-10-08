/**
 * FASE 5 · FATIA 3 — Pipeline de ingestão de documentos.
 *
 * O coração da Fase 5: transforma proforma/invoice/cotação em dados estruturados,
 * com REVISÃO HUMANA obrigatória antes de gravar.
 *
 * Fluxo: extrair → estruturar itens → estruturar fornecedores → preços → NCM →
 *        qualidade → consolidar → (humano aprova) → gravar.
 *
 * O orquestrador chama cada agente (em ../tools/agentesFase5). Só `gravarAprovado`
 * escreve nas bases — `ingerirDocumento` apenas PROPÕE.
 */
import * as fase5Db from "../../db/fase5Db";
import {
  agenteDocumental, agenteAtivos, agenteFornecedores,
  agentePrecos, agenteFiscalNcm, agenteQualidade,
  type ItemExtraido, type FornecedorExtraido, type PrecoExtraido, type NcmSugestao,
} from "../tools/agentesFase5";

export interface IngestaoInput {
  userId: number;
  documentoId: number;       // já criado em fase5_documentos com status "recebido"
  storageKey: string;
  tipo: string;
}

export interface PropostaIngestao {
  itens: ItemExtraido[];
  fornecedores: FornecedorExtraido[];
  precos: PrecoExtraido[];
  ncmSugestoes: NcmSugestao[];
  alertasQualidade: string[];
  confianca: number; // 0-100
}

export interface IngestaoResultado {
  ok: boolean;
  proposta: PropostaIngestao;
  erro?: string;
}

const propostaVazia = (): PropostaIngestao => ({
  itens: [], fornecedores: [], precos: [], ncmSugestoes: [], alertasQualidade: [], confianca: 0,
});

/**
 * Roda o pipeline completo sobre um documento. NÃO grava nas bases —
 * devolve uma proposta consolidada para o usuário revisar e aprovar.
 */
export async function ingerirDocumento(input: IngestaoInput): Promise<IngestaoResultado> {
  try {
    await fase5Db.marcarStatusDocumento(input.documentoId, "extraindo");

    // 1) Agente Documental — extrai dados brutos do PDF
    const bruto = await agenteDocumental({
      storageKey: input.storageKey, tipo: input.tipo, userId: input.userId,
    });

    // 2-4) Itens, fornecedores e preços
    const itens = await agenteAtivos({ bruto, userId: input.userId });
    const fornecedores = await agenteFornecedores({ bruto, userId: input.userId });
    const precos = await agentePrecos({ bruto, itens, fornecedores });

    // 5) NCM (sugestão + confiança)
    const ncmSugestoes = await agenteFiscalNcm({ itens });
    // injeta a NCM sugerida nos itens que não tinham
    for (const item of itens) {
      if (!item.ncmSugerido) {
        const s = ncmSugestoes.find((n) => n.ativoRef === item.ref);
        if (s?.ncmSugerido) item.ncmSugerido = s.ncmSugerido;
      }
    }

    // 6) Qualidade
    const qualidade = await agenteQualidade({ itens, fornecedores, precos });

    const proposta: PropostaIngestao = {
      itens, fornecedores, precos, ncmSugestoes,
      alertasQualidade: qualidade.alertas,
      confianca: qualidade.confianca,
    };

    await fase5Db.marcarStatusDocumento(input.documentoId, "em_revisao", {
      extracao: proposta, confianca: qualidade.confianca,
    });

    return { ok: true, proposta };
  } catch (e: any) {
    await fase5Db.marcarStatusDocumento(input.documentoId, "erro");
    return { ok: false, proposta: propostaVazia(), erro: String(e?.message ?? e) };
  }
}

/**
 * Grava a proposta nas bases DEPOIS que o humano aprovou (eventualmente editada).
 * Idempotente: reaproveita ativo/fornecedor já existente (dedupe por nome).
 */
export async function gravarAprovado(input: {
  userId: number;
  documentoId: number;
  proposta: PropostaIngestao;
}): Promise<{ ok: boolean; ativosGravados: number; precosGravados: number }> {
  const { userId, proposta } = input;

  // 1) Fornecedores → mapa ref → id real
  const fornecedorId = new Map<string, number>();
  for (const f of proposta.fornecedores) {
    const r = await fase5Db.upsertFornecedor(userId, {
      name: f.nome, country: f.pais, city: f.cidade, tipo: f.tipo, origem: f.origem,
    });
    fornecedorId.set(f.ref, r.id);
  }

  // 2) Ativos → mapa ref → id real
  const ativoId = new Map<string, number>();
  let ativosGravados = 0;
  for (const item of proposta.itens) {
    const r = await fase5Db.upsertAtivo(userId, {
      name: item.descricao,
      ncmCode: item.ncmSugerido,
      ncmStatus: "sugerido",
      categoria: item.categoria,
      material: item.material,
      dimensoes: item.dimensoes,
      origem: item.origem,
      paisOrigem: item.paisOrigem,
    });
    ativoId.set(item.ref, r.id);
    if (r.criado) ativosGravados++;
  }

  // 3) Vínculos ativo ↔ fornecedor + preços
  let precosGravados = 0;
  for (const p of proposta.precos) {
    const aId = ativoId.get(p.ativoRef);
    const fId = fornecedorId.get(p.fornecedorRef);
    if (!aId) continue;

    const origem: "nacional" | "internacional" =
      proposta.itens.find((i) => i.ref === p.ativoRef)?.origem ?? "internacional";

    if (fId) {
      await fase5Db.vincularAtivoFornecedor({ ativoId: aId, fornecedorId: fId, origem } as any);
    }

    await fase5Db.registrarPreco({
      ativoId: aId,
      origem,
      fornecedorId: fId ?? null,
      precoCents: p.precoCents,
      moeda: p.moeda,
      incoterm: p.incoterm ?? null,
      moq: p.moq ?? null,
      fonte: "proforma",
      documentoId: input.documentoId,
    } as any);
    precosGravados++;
  }

  await fase5Db.marcarStatusDocumento(input.documentoId, "aprovado");
  return { ok: true, ativosGravados, precosGravados };
}
