/**
 * OperacaoFinanceiro — camada financeira transversal da operação.
 *
 * Lista lançamentos (previstos/realizados), mostra resumo (entradas, saídas,
 * saldo em BRL) e permite lançar novos. Cada lançamento grava um evento na
 * timeline via trpc.operations.lancarFinanceiro (coesão Painel ↔ Excambia).
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CircleDollarSign, Plus, Loader2, Trash2, ArrowDownLeft, ArrowUpRight } from "lucide-react";

type Tipo =
  | "cambio" | "pagamento_fornecedor" | "imposto" | "frete" | "seguro"
  | "despesa_local" | "comissao" | "receita" | "outro";
type Direcao = "entrada" | "saida";
type Status = "previsto" | "realizado" | "cancelado";

interface Lancamento {
  id: number;
  tipo: string;
  direcao: string;
  status: string;
  descricao?: string | null;
  valorCents: number;
  moeda: string;
  valorBrlCents?: number | null;
  criadoEm: string | Date;
}

const TIPO_LABEL: Record<string, string> = {
  cambio: "Câmbio",
  pagamento_fornecedor: "Pagamento ao fornecedor",
  imposto: "Imposto",
  frete: "Frete",
  seguro: "Seguro",
  despesa_local: "Despesa local",
  comissao: "Comissão",
  receita: "Receita",
  outro: "Outro",
};

const STATUS_META: Record<string, { txt: string; cls: string }> = {
  previsto:  { txt: "Previsto",  cls: "bg-amber-50 text-amber-700" },
  realizado: { txt: "Realizado", cls: "bg-teal-50 text-teal-700" },
  cancelado: { txt: "Cancelado", cls: "bg-slate-100 text-slate-400" },
};

const TIPOS: Tipo[] = [
  "cambio", "pagamento_fornecedor", "imposto", "frete", "seguro",
  "despesa_local", "comissao", "receita", "outro",
];

function fmtBRL(cents?: number | null) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function OperacaoFinanceiro({
  operacaoId, lancamentos, onChange,
}: {
  operacaoId: number;
  lancamentos: Lancamento[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("pagamento_fornecedor");
  const [direcao, setDirecao] = useState<Direcao>("saida");
  const [status, setStatus] = useState<Status>("previsto");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");

  const lancar = trpc.operations.lancarFinanceiro.useMutation({
    onSuccess: () => { onChange(); resetForm(); toast.success("Lançamento registrado."); },
    onError: (e) => toast.error(e.message || "Erro ao lançar"),
  });
  const remover = trpc.operations.removeFinanceiro.useMutation({ onSuccess: onChange });

  function resetForm() {
    setShowForm(false);
    setDescricao("");
    setValor("");
    setTipo("pagamento_fornecedor");
    setDirecao("saida");
    setStatus("previsto");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valorNum = Math.round(parseFloat(valor.replace(",", ".")) * 100);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    lancar.mutate({
      operacaoId, tipo, direcao, status,
      descricao: descricao.trim() || undefined,
      valorCents: valorNum,
      moeda: "BRL",
    });
  }

  function handleRemove(id: number, label: string) {
    if (!window.confirm(`Remover o lançamento "${label}"?`)) return;
    remover.mutate({ lancamentoId: id });
  }

  // Resumo em BRL (ignora cancelados)
  const ativos = lancamentos.filter((l) => l.status !== "cancelado");
  const entradas = ativos.filter((l) => l.direcao === "entrada")
    .reduce((s, l) => s + (l.valorBrlCents ?? 0), 0);
  const saidas = ativos.filter((l) => l.direcao === "saida")
    .reduce((s, l) => s + (l.valorBrlCents ?? 0), 0);
  const saldo = entradas - saidas;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          <CircleDollarSign className="h-3.5 w-3.5" /> Financeiro ({lancamentos.length})
        </h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          <Plus className="h-3.5 w-3.5" /> Lançar
        </button>
      </div>

      {/* resumo */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-teal-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-teal-600">Entradas</p>
          <p className="mt-0.5 text-sm font-bold text-teal-700">{fmtBRL(entradas)}</p>
        </div>
        <div className="rounded-xl bg-red-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-red-600">Saídas</p>
          <p className="mt-0.5 text-sm font-bold text-red-700">{fmtBRL(saidas)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Saldo</p>
          <p className={`mt-0.5 text-sm font-bold ${saldo >= 0 ? "text-teal-700" : "text-red-700"}`}>
            {fmtBRL(saldo)}
          </p>
        </div>
      </div>

      {/* formulário */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo</span>
              <select
                value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Direção</span>
              <select
                value={direcao} onChange={(e) => setDirecao(e.target.value as Direcao)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="saida">Saída (custo)</option>
                <option value="entrada">Entrada (receita)</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Valor (R$)</span>
              <input
                type="text" inputMode="decimal" value={valor}
                onChange={(e) => setValor(e.target.value)} placeholder="0,00"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Status</span>
              <select
                value={status} onChange={(e) => setStatus(e.target.value as Status)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="previsto">Previsto</option>
                <option value="realizado">Realizado</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Descrição</span>
            <input
              type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Sinal 30% ao fornecedor"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit" disabled={lancar.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {lancar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Salvar
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

      {/* lista */}
      {lancamentos.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-300">
          Nenhum lançamento ainda. Registre câmbio, pagamentos, impostos e despesas.
        </p>
      ) : (
        <ul className="space-y-2">
          {lancamentos.map((l) => {
            const st = STATUS_META[l.status] ?? { txt: l.status, cls: "bg-slate-100 text-slate-400" };
            const isEntrada = l.direcao === "entrada";
            return (
              <li key={l.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2.5">
                <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${isEntrada ? "bg-teal-50 text-teal-600" : "bg-red-50 text-red-600"}`}>
                  {isEntrada ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {l.descricao || TIPO_LABEL[l.tipo] || l.tipo}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {TIPO_LABEL[l.tipo] ?? l.tipo}
                    {l.moeda !== "BRL" ? ` · ${l.moeda}` : ""}
                  </p>
                </div>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.txt}</span>
                <span className={`whitespace-nowrap text-sm font-bold ${isEntrada ? "text-teal-700" : "text-red-700"}`}>
                  {isEntrada ? "+" : "−"} {fmtBRL(l.valorBrlCents ?? l.valorCents)}
                </span>
                <button
                  onClick={() => handleRemove(l.id, l.descricao || TIPO_LABEL[l.tipo] || l.tipo)}
                  disabled={remover.isPending}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
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
