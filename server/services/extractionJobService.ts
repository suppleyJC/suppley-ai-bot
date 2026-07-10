/**
 * Extraction Job Service — extração de proforma como JOB assíncrono.
 *
 * Por quê: a extração por IA de um arquivo grande pode levar vários minutos.
 * Segurar uma única requisição HTTP aberta esse tempo todo estoura o timeout
 * de qualquer proxy (nginx 504) — o navegador via "The string did not match
 * the expected pattern" ao tentar ler a página HTML de erro como JSON.
 *
 * Fluxo: extractStart → jobId → extractStatus (polling barato a cada ~4s).
 * Os jobs vivem em memória (container único); resultados são consumidos em
 * minutos e podados após TTL — reinício do app apenas exige reenviar.
 */
import { randomUUID } from "node:crypto";
import { extractProformaFromFile, type ProformaExtraction } from "./proformaService";

export type ExtractionJobStatus = "processando" | "concluida" | "erro";

interface ExtractionJob {
  id: string;
  userId: number;
  status: ExtractionJobStatus;
  result?: ProformaExtraction;
  error?: string;
  criadoEm: number;
}

const TTL_MS = 30 * 60 * 1000;
const jobs = new Map<string, ExtractionJob>();

function prune() {
  const agora = Date.now();
  jobs.forEach((job, id) => {
    if (agora - job.criadoEm > TTL_MS) jobs.delete(id);
  });
}

export function startExtractionJob(
  userId: number,
  fileUrl: string,
  mimeType: string,
  hints?: { supplierName?: string; expectedProducts?: string[]; fileName?: string },
): string {
  prune();
  const id = randomUUID();
  jobs.set(id, { id, userId, status: "processando", criadoEm: Date.now() });

  void extractProformaFromFile(fileUrl, mimeType, hints)
    .then((result) => {
      const job = jobs.get(id);
      if (job) Object.assign(job, { status: "concluida" as const, result });
    })
    .catch((e: unknown) => {
      const job = jobs.get(id);
      if (job) {
        Object.assign(job, {
          status: "erro" as const,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });

  return id;
}

export function getExtractionJob(userId: number, jobId: string): ExtractionJob | undefined {
  prune();
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return undefined;
  return job;
}
