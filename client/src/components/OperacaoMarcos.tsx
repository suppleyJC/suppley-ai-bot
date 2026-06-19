/**
 * OperacaoMarcos — marcos da operação na esteira de execução.
 *
 * Timeline visual dos marcos principais: pedido confirmado → produção iniciada →
 * produto embarcado → DI registrada → nacionalizado → entregue.
 * Cada marco registrado gera um evento na timeline (coesão Painel ↔ Excambia).
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Plus, Loader2, PackageCheck, Truck,
  FileCheck, Zap, ShoppingCart, Factory,
} from "lucide-react";

type TipoMarco =
  | "pedido_confirmado" | "producao_iniciada" | "produto_embarcado"
  | "di_registrada" | "nacionalizado" | "entregue";
type StatusMarco = "planejado" | "realizado" | "cancelado";

interface Marco {
  id: number;
  tipo: string;
  status: string;
  descricao?: string | null;
  dataReferencia: string | Date;
}

const TIPOS_MARCO: TipoMarco[] = [
  "pedido_confirmado", "producao_iniciada", "produto_embarcado",
  "di_registrada", "nacionalizado", "entregue",
];

const TIPO_META: Record<TipoMarco, { label: string; Icon: any }> = {
  pedido_confirmado:  { label: "Pedido Confirmado",  Icon: ShoppingCart },
  producao_iniciada:  { label: "Produção Iniciada",  Icon: Factory },
  produto_embarcado:  { label: "Produto Embarcado",  Icon: Truck },
  di_registrada:      { label: "DI Registrada",      Icon: FileCheck },
  nacionalizado:      { label: "Nacionalizado",      Icon: Zap },
  entregue:           { label: "Entregue",           Icon: PackageCheck },
};

const STATUS_META: Record<StatusMarco, { txt: string; cls: string }> = {
  planejado:  { txt: "Planejado",  cls: "bg-amber-50 text-amber-700" },
  realizado:  { txt: "Realizado",  cls: "bg-teal-50 text-teal-700" },
  cancelado:  { txt: "Cancelado",  cls: "bg-slate-100 text-slate-400" },
};

function fmtData(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OperacaoMarcos({
  operacaoId, marcos, onChange,
}: {
  operacaoId: number;
  marcos: Marco[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState<TipoMarco>("pedido_confirmado");
  const [status, setStatus] = useState<StatusMarco>("realizado");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");

  const registrar = trpc.operations.registrarMarco.useMutation({
    onSuccess: () => { onChange(); resetForm(); toast.success("Marco registrado."); },
    onError: (e) => toast.error(e.message || "Erro ao registrar marco"),
  });

  function resetForm() {
    setShowForm(false);
    setTipo("pedido_confirmado");
    setStatus("realizado");
    setDescricao("");
    setData("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) {
      toast.error("Informe a data do marco.");
      return;
    }
    registrar.mutate({
      operacaoId,
      tipo,
      status,
      descricao: descricao.trim() || undefined,
      dataReferencia: new Date(data),
    });
  }

  // Mapa: which marcos are marked as "realizado"
  const realizados = new Set(marcos.filter((m) => m.status === "realizado").map((m) => m.tipo));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          <Truck className="h-3.5 w-3.5" /> Marcos ({marcos.length})
        </h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          <Plus className="h-3.5 w-3.5" /> Registrar
        </button>
      </div>

      {/* Timeline visual */}
      <div className="mb-4 space-y-2">
        {TIPOS_MARCO.map((t, idx) => {
          const meta = TIPO_META[t];
          const Icon = meta.Icon;
          const marcado = marcos.find((m) => m.tipo === t);
          const realizado = realizados.has(t);

          return (
            <div key={t} className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-1">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                    realizado
                      ? "border-teal-500 bg-teal-500 text-white"
                      : "border-slate-300 bg-white text-slate-400"
                  }`}
                >
                  {realizado ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                {idx < TIPOS_MARCO.length - 1 && (
                  <div className="my-1 h-6 w-0.5 bg-slate-200" />
                )}
              </div>
              <div className="flex-1 pt-0.5">
                <p className={`text-sm font-semibold ${realizado ? "text-slate-800" : "text-slate-400"}`}>
                  {meta.label}
                </p>
                {marcado && (
                  <>
                    <p className="text-[11px] text-slate-500">
                      {fmtData(marcado.dataReferencia)}
                      {marcado.descricao ? ` · ${marcado.descricao}` : ""}
                    </p>
                    {marcado.status !== "realizado" && (
                      <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${STATUS_META[marcado.status as StatusMarco]?.cls || ""}`}>
                        {STATUS_META[marcado.status as StatusMarco]?.txt || marcado.status}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* formulário */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Marco</span>
              <select
                value={tipo} onChange={(e) => setTipo(e.target.value as TipoMarco)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                {TIPOS_MARCO.map((t) => (
                  <option key={t} value={t}>{TIPO_META[t].label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Status</span>
              <select
                value={status} onChange={(e) => setStatus(e.target.value as StatusMarco)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="planejado">Planejado</option>
                <option value="realizado">Realizado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Data</span>
            <input
              type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Descrição (opcional)</span>
            <input
              type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Confirmado com Fabricante XYZ"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit" disabled={registrar.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {registrar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Salvar
            </button>
            <button
              type="button" onClick={resetForm}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
