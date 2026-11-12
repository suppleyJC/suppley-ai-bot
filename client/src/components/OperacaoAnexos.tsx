/**
 * OperacaoAnexos — painel de anexos da operação (desenhos, PDFs, imagens,
 * especificações, catálogos, cotações).
 *
 * Fluxo de upload (reaproveita a infra existente):
 *   1. arquivo → base64 → trpc.calculations.uploadQuotation (storage)
 *   2. metadados → trpc.operations.addAnexo (registra + grava evento na timeline)
 *
 * Cada anexo registrado também aparece na linha do tempo (coesão Painel ↔ Excambia).
 */
import React, { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Paperclip, Upload, Loader2, FileText, Image as ImageIcon,
  FileBox, Trash2, ExternalLink,
} from "lucide-react";

type TipoAnexo = "desenho" | "pdf" | "imagem" | "especificacao" | "catalogo" | "cotacao" | "outro";

interface Anexo {
  id: number;
  tipo: string;
  nome: string;
  fileUrl: string;
  contentType?: string | null;
  tamanhoBytes?: number | null;
  criadoEm: string | Date;
}

const TIPO_LABEL: Record<string, string> = {
  desenho: "Desenho",
  pdf: "PDF",
  imagem: "Imagem",
  especificacao: "Especificação",
  catalogo: "Catálogo",
  cotacao: "Cotação",
  outro: "Outro",
};

/** Deriva o tipo do anexo a partir do nome/contentType. */
function inferTipo(fileName: string, contentType: string): TipoAnexo {
  const lower = fileName.toLowerCase();
  if (contentType.startsWith("image/")) return "imagem";
  if (lower.includes("desenho") || lower.endsWith(".dwg") || lower.endsWith(".dxf")) return "desenho";
  if (lower.includes("catalog")) return "catalogo";
  if (lower.includes("spec") || lower.includes("especif")) return "especificacao";
  if (lower.includes("cotac") || lower.includes("quote") || lower.includes("invoice")) return "cotacao";
  if (contentType === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  return "outro";
}

function fmtTamanho(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(tipo: string) {
  if (tipo === "imagem") return ImageIcon;
  if (tipo === "desenho" || tipo === "catalogo") return FileBox;
  return FileText;
}

export default function OperacaoAnexos({
  operacaoId, anexos, onChange,
}: {
  operacaoId: number;
  anexos: Anexo[];
  onChange: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = trpc.calculations.uploadQuotation.useMutation();
  const addAnexo = trpc.operations.addAnexo.useMutation({ onSuccess: onChange });
  const removeAnexo = trpc.operations.removeAnexo.useMutation({ onSuccess: onChange });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 16MB.");
      return;
    }

    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const res = await upload.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type || "application/octet-stream",
      });

      await addAnexo.mutateAsync({
        operacaoId,
        tipo: inferTipo(file.name, file.type || ""),
        nome: file.name,
        fileKey: res.fileKey,
        fileUrl: res.fileUrl,
        contentType: file.type || undefined,
        tamanhoBytes: file.size,
      });

      toast.success("Anexo adicionado.");
    } catch (err) {
      console.error("Erro no upload de anexo:", err);
      toast.error("Não foi possível enviar o anexo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemove(id: number, nome: string) {
    if (!window.confirm(`Remover o anexo "${nome}"?`)) return;
    removeAnexo.mutate({ anexoId: id });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" /> Anexos ({anexos.length})
        </h3>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFile}
          accept=".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,image/*"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Anexar
        </button>
      </div>

      {anexos.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground/60">
          Nenhum anexo ainda. Envie desenhos, PDFs, especificações ou cotações.
        </p>
      ) : (
        <ul className="space-y-2">
          {anexos.map((a) => {
            const Icon = iconFor(a.tipo);
            return (
              <li
                key={a.id}
                className="group flex items-center gap-3 rounded-xl border border-border p-2.5"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{a.nome}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {TIPO_LABEL[a.tipo] ?? a.tipo}
                    {a.tamanhoBytes ? ` · ${fmtTamanho(a.tamanhoBytes)}` : ""}
                  </p>
                </div>
                <a
                  href={a.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-violet-700"
                  title="Abrir"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  onClick={() => handleRemove(a.id, a.nome)}
                  disabled={removeAnexo.isPending}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
