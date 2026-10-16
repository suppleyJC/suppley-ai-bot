/**
 * barreiraSyncService — a BASE VIVA de defesa comercial (ex-tarifário/antidumping).
 *
 * Mantém a tabela `trade_barriers` atualizada com as medidas VIGENTES por NCM:
 *  1. PESQUISA nas fontes oficiais (Resoluções GECEX/CAMEX, DOU, gov.br) via
 *     web search nativa da Anthropic — texto com citações;
 *  2. EXTRAÇÃO estruturada (modelo rápido + schema forçado) — tipo, mecanismo,
 *     valor, origem, base legal, vigência;
 *  3. UPSERT idempotente em trade_barriers (chave ncmPrefix+paisOrigem+tipo),
 *     com fonte e data — o cálculo (detectarBarreiras) passa a usar o vigente.
 *
 * Acionamento SOB DEMANDA (tool sincronizar_barreiras) — sem cron, conforme
 * decisão de produto (nada proativo por enquanto).
 */
import { invokeLLM, MODELS } from "../_core/llm";
import { getDb } from "../db";
import { tradeBarriers, type TradeBarrier } from "../../drizzle/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export interface MedidaVigente {
  tipo: "antidumping" | "medida_compensatoria" | "salvaguarda" | "cide" | "direito_provisorio";
  paisOrigem: string | null;
  mecanismo: "ad_valorem" | "usd_por_kg" | "usd_por_ton" | "usd_por_unidade" | null;
  /** ad_valorem: percentual (ex.: 10.8); específicos: USD na unidade do mecanismo. */
  valorOriginal: number | null;
  descricao: string;
  baseLegal: string | null;
  /** "YYYY-MM-DD" ou null (sem vigência conhecida). */
  vigenciaAte: string | null;
}

export interface ResultadoSync {
  ncm: string;
  pesquisou: boolean;
  encontradas: number;
  inseridas: number;
  atualizadas: number;
  medidas: MedidaVigente[];
  fontes: string;
}

const EXTRACAO_SCHEMA = {
  name: "medidas_defesa_comercial",
  schema: {
    type: "object",
    properties: {
      medidas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tipo: {
              type: "string",
              enum: ["antidumping", "medida_compensatoria", "salvaguarda", "cide", "direito_provisorio"],
            },
            paisOrigem: { type: ["string", "null"], description: "País de origem alvo da medida (null se todas as origens)" },
            mecanismo: {
              type: ["string", "null"],
              enum: ["ad_valorem", "usd_por_kg", "usd_por_ton", "usd_por_unidade", null],
            },
            valorOriginal: { type: ["number", "null"], description: "ad_valorem: percentual (10.8 = 10,8%); específicos: USD na unidade do mecanismo" },
            descricao: { type: "string" },
            baseLegal: { type: ["string", "null"], description: "Ex.: Resolução GECEX nº 123/2025" },
            vigenciaAte: { type: ["string", "null"], description: "YYYY-MM-DD ou null" },
          },
          required: ["tipo", "descricao"],
        },
      },
    },
    required: ["medidas"],
  },
} as const;

/** Converte o valor da medida para a convenção da tabela (bp / cents USD). */
export function valorParaTabela(mecanismo: MedidaVigente["mecanismo"], valorOriginal: number | null): number | null {
  if (valorOriginal == null || !Number.isFinite(valorOriginal) || valorOriginal < 0) return null;
  if (mecanismo === "ad_valorem") return Math.round(valorOriginal * 100); // % → bp
  if (mecanismo) return Math.round(valorOriginal * 100);                  // USD → cents
  return null;
}

/**
 * Passo 1+2: pesquisa oficial + extração estruturada das medidas vigentes.
 * Best-effort: qualquer falha → lista vazia (o chamador reporta "sem confirmação").
 */
export async function pesquisarMedidasVigentes(
  ncm: string,
  paisOrigem?: string | null,
): Promise<{ medidas: MedidaVigente[]; fontes: string }> {
  const ncmFmt = ncm.replace(/\D/g, "");
  const origemTxt = paisOrigem ? ` com origem ${paisOrigem}` : "";

  // Passo 1 — pesquisa com citações nas fontes oficiais.
  let texto = "";
  try {
    const r = await invokeLLM({
      model: MODELS.balanced,
      maxTokens: 3000,
      webSearch: true,
      webSearchMaxUses: 5,
      messages: [
        {
          role: "system",
          content:
            "Você é um pesquisador de defesa comercial brasileira. Responda APENAS com fatos " +
            "encontrados em fontes oficiais (gov.br, DOU/in.gov.br, Resoluções GECEX/CAMEX, MDIC). " +
            "Para cada medida cite: tipo, país de origem, mecanismo e valor (% ad valorem ou US$/t, US$/kg), " +
            "a RESOLUÇÃO (número/ano) e a vigência. Se não houver medida vigente, diga claramente 'nenhuma'.",
        },
        {
          role: "user",
          content:
            `Quais medidas de defesa comercial (antidumping, medidas compensatórias, salvaguardas, ` +
            `direitos provisórios) estão VIGENTES HOJE para a NCM ${ncmFmt}${origemTxt}? ` +
            `Verifique as Resoluções GECEX/CAMEX mais recentes.`,
        },
      ],
    });
    texto = typeof r.choices?.[0]?.message?.content === "string" ? r.choices[0].message.content : "";
  } catch {
    return { medidas: [], fontes: "" };
  }
  if (!texto.trim() || /^nenhuma/i.test(texto.trim())) return { medidas: [], fontes: texto };

  // Passo 2 — extração estruturada (modelo rápido; schema forçado).
  try {
    const r = await invokeLLM({
      model: MODELS.fast,
      maxTokens: 2000,
      outputSchema: EXTRACAO_SCHEMA as any,
      messages: [
        {
          role: "system",
          content:
            "Extraia APENAS as medidas de defesa comercial VIGENTES descritas no texto, no schema. " +
            "Não invente valores: sem número claro no texto → valorOriginal null. " +
            "Texto que diz 'nenhuma medida' → lista vazia.",
        },
        { role: "user", content: texto.slice(0, 20_000) },
      ],
    });
    const raw = typeof r.choices?.[0]?.message?.content === "string" ? r.choices[0].message.content : "{}";
    const parsed = JSON.parse(raw) as { medidas?: MedidaVigente[] };
    return { medidas: Array.isArray(parsed.medidas) ? parsed.medidas : [], fontes: texto };
  } catch {
    return { medidas: [], fontes: texto };
  }
}

/**
 * Passo 3: upsert idempotente na base (chave ncmPrefix + paisOrigem + tipo).
 * Atualiza valor/baseLegal/vigência/fonte de registros existentes; insere novos.
 */
export async function sincronizarBarreirasNcm(
  ncm: string,
  paisOrigem?: string | null,
): Promise<ResultadoSync> {
  const ncm8 = ncm.replace(/\D/g, "").slice(0, 8);
  const vazio: ResultadoSync = { ncm: ncm8, pesquisou: false, encontradas: 0, inseridas: 0, atualizadas: 0, medidas: [], fontes: "" };
  if (ncm8.length < 4) return vazio;

  const { medidas, fontes } = await pesquisarMedidasVigentes(ncm8, paisOrigem);
  const resultado: ResultadoSync = { ...vazio, pesquisou: true, encontradas: medidas.length, medidas, fontes };

  const db = await getDb();
  if (!db || !medidas.length) return resultado;

  for (const m of medidas) {
    const valor = valorParaTabela(m.mecanismo ?? null, m.valorOriginal ?? null);
    const vigencia = m.vigenciaAte && /^\d{4}-\d{2}-\d{2}/.test(m.vigenciaAte) ? new Date(m.vigenciaAte) : null;
    const pais = m.paisOrigem?.trim() || null;

    try {
      const existentes: TradeBarrier[] = await db
        .select()
        .from(tradeBarriers)
        .where(and(
          eq(tradeBarriers.ncmPrefix, ncm8),
          pais == null ? isNull(tradeBarriers.paisOrigem) : eq(tradeBarriers.paisOrigem, pais),
          eq(tradeBarriers.tipo, m.tipo as any),
        ))
        .limit(1);

      if (existentes.length) {
        await db.update(tradeBarriers).set({
          mecanismo: (m.mecanismo ?? existentes[0].mecanismo) as any,
          valor: valor ?? existentes[0].valor,
          descricao: m.descricao || existentes[0].descricao,
          baseLegal: m.baseLegal ?? existentes[0].baseLegal,
          vigenciaAte: vigencia ?? existentes[0].vigenciaAte,
          isActive: true,
          fonte: "sync GECEX (pesquisa oficial via Excambia)",
        }).where(eq(tradeBarriers.id, existentes[0].id));
        resultado.atualizadas++;
      } else {
        await db.insert(tradeBarriers).values({
          ncmPrefix: ncm8,
          paisOrigem: pais,
          tipo: m.tipo as any,
          mecanismo: (m.mecanismo ?? null) as any,
          valor,
          descricao: m.descricao,
          baseLegal: m.baseLegal ?? null,
          vigenciaAte: vigencia,
          isActive: true,
          fonte: "sync GECEX (pesquisa oficial via Excambia)",
        });
        resultado.inseridas++;
      }
    } catch (e) {
      console.error(`[barreiraSync ${ncm8}] upsert falhou:`, e);
    }
  }

  return resultado;
}
