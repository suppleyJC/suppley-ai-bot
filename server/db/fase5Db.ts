/**
 * FASE 5 — Camada de banco de dados (documentos, ativos, preços, fornecedores).
 *
 * Abstrai o Drizzle para o pipeline de ingestão, os agentes e o router.
 * Segue o padrão do projeto: await getDb() + guarda de null.
 */
import { getDb } from "./connection";
import {
  fase5Documentos, ativoPrecos, ativoFornecedor, fornecedorOcorrencias,
  products, suppliers,
} from "../../drizzle/schema";
import type {
  InsertFase5Documento, InsertAtivoPreco, InsertAtivoFornecedor,
  InsertProduct, InsertSupplier,
} from "../../drizzle/schema";
import { and, desc, eq, like } from "drizzle-orm";

/* ---------------- Documentos ingeridos ---------------- */

export async function criarDocumento(input: InsertFase5Documento): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(fase5Documentos).values(input);
  return { id: Number(result[0].insertId) };
}

export async function marcarStatusDocumento(
  documentoId: number,
  status: "recebido" | "extraindo" | "extraido" | "em_revisao" | "aprovado" | "erro",
  extras?: { extracao?: unknown; confianca?: number },
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(fase5Documentos)
    .set({
      status,
      ...(extras?.extracao !== undefined ? { extracao: extras.extracao as any } : {}),
      ...(extras?.confianca !== undefined ? { confianca: extras.confianca } : {}),
    })
    .where(eq(fase5Documentos.id, documentoId));
}

export async function listarDocumentos(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fase5Documentos)
    .where(eq(fase5Documentos.userId, userId))
    .orderBy(desc(fase5Documentos.criadoEm));
}

export async function getDocumento(documentoId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [doc] = await db.select().from(fase5Documentos)
    .where(and(eq(fase5Documentos.id, documentoId), eq(fase5Documentos.userId, userId)));
  return doc ?? null;
}

/* ---------------- Ativos (products) ---------------- */

/** Procura um ativo do usuário por nome aproximado (dedupe básico). */
export async function acharAtivoPorNome(userId: number, nome: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(products)
    .where(and(eq(products.userId, userId), like(products.name, nome)))
    .limit(1);
  return row ?? null;
}

export async function upsertAtivo(userId: number, input: Partial<InsertProduct> & { name: string; ncmCode?: string }): Promise<{ id: number; criado: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const existente = await acharAtivoPorNome(userId, input.name);
  if (existente) {
    await db.update(products).set({
      ...(input.categoria ? { categoria: input.categoria } : {}),
      ...(input.material ? { material: input.material } : {}),
      ...(input.dimensoes ? { dimensoes: input.dimensoes } : {}),
      ...(input.paisOrigem ? { paisOrigem: input.paisOrigem } : {}),
      ...(input.origem ? { origem: input.origem } : {}),
    }).where(eq(products.id, existente.id));
    return { id: existente.id, criado: false };
  }

  const values = {
    userId,
    name: input.name,
    description: input.description ?? null,
    ncmCode: input.ncmCode || "00000000",
    unit: input.unit || "UN",
    categoria: input.categoria,
    aplicacao: input.aplicacao,
    material: input.material,
    dimensoes: input.dimensoes,
    ncmStatus: input.ncmStatus || "sugerido",
    origem: input.origem,
    paisOrigem: input.paisOrigem,
    moqPadrao: input.moqPadrao,
  } as InsertProduct;

  const result = await db.insert(products).values(values);
  return { id: Number(result[0].insertId), criado: true };
}

/* ---------------- Fornecedores (suppliers) ---------------- */

export async function acharFornecedorPorNome(userId: number, nome: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(suppliers)
    .where(and(eq(suppliers.userId, userId), like(suppliers.name, nome)))
    .limit(1);
  return row ?? null;
}

export async function upsertFornecedor(userId: number, input: { name: string; country?: string; city?: string; tipo?: any; origem?: any }): Promise<{ id: number; criado: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const existente = await acharFornecedorPorNome(userId, input.name);
  if (existente) {
    await db.update(suppliers).set({
      ...(input.country ? { country: input.country } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.tipo ? { tipo: input.tipo } : {}),
      ...(input.origem ? { origem: input.origem } : {}),
    }).where(eq(suppliers.id, existente.id));
    return { id: existente.id, criado: false };
  }

  const values = {
    userId,
    name: input.name,
    country: input.country || "—",
    city: input.city,
    tipo: input.tipo || "fabrica",
    origem: input.origem || "internacional",
  } as InsertSupplier;

  const result = await db.insert(suppliers).values(values);
  return { id: Number(result[0].insertId), criado: true };
}

/* ---------------- Preços (ativo_precos) ---------------- */

export async function registrarPreco(input: InsertAtivoPreco): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(ativoPrecos).values(input);
  return { id: Number(result[0].insertId) };
}

export async function precosDoAtivo(ativoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ativoPrecos)
    .where(eq(ativoPrecos.ativoId, ativoId))
    .orderBy(desc(ativoPrecos.registradoEm));
}

/* ---------------- Vínculo ativo ↔ fornecedor ---------------- */

export async function vincularAtivoFornecedor(input: InsertAtivoFornecedor): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(ativoFornecedor).values(input);
}

/* ---------------- Busca (lado "leitura" do ciclo) ---------------- */

export async function buscarAtivos(userId: number, termo: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products)
    .where(and(eq(products.userId, userId), like(products.name, `%${termo}%`)))
    .limit(20);
}

export async function getAtivo(ativoId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(products)
    .where(and(eq(products.id, ativoId), eq(products.userId, userId)));
  return row ?? null;
}
