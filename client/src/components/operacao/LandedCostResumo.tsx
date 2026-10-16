/**
 * LandedCostResumo — o custo de aterrissagem (landed cost) da operação:
 * previsto × realizado, com quebra por tipo de custo.
 *
 * Pura derivação sobre os lançamentos financeiros JÁ existentes (nenhuma coluna
 * ou tabela nova). Responde: "quanto planejamos gastar para nacionalizar, quanto
 * já saiu de fato, e onde está o desvio" — e compara com o valor estimado no
 * cálculo de viabilidade.
 */
import React from "react";
import { Landmark, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Lancamento {
  tipo: string;
  direcao: string;
  status: string;
  valorCents: number;
  valorBrlCents?: number | null;
}

const TIPO_LABEL: Record<string, string> = {
  cambio: "Câmbio",
  pagamento_fornecedor: "Pagamento ao fornecedor",
  imposto: "Impostos",
  frete: "Frete",
  seguro: "Seguro",
  despesa_local: "Despesas locais",
  comissao: "Comissão",
  receita: "Receita",
  outro: "Outros",
};

function fmtBRL(cents?: number | null) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const val = (l: Lancamento) => l.valorBrlCents ?? l.valorCents ?? 0;

export default function LandedCostResumo({
  lancamentos, estimadoBrlCents,
}: {
  lancamentos: Lancamento[];
  estimadoBrlCents?: number | null;
}) {
  const ativos = lancamentos.filter((l) => l.status !== "cancelado");
  const custos = ativos.filter((l) => l.direcao === "saida");

  const somar = (arr: Lancamento[], status?: string) =>
    arr.filter((l) => (status ? l.status === status : true)).reduce((s, l) => s + val(l), 0);

  const previstoTotal = somar(custos, "previsto");
  const realizadoTotal = somar(custos, "realizado");
  const desvio = realizadoTotal - previstoTotal;
  const desvioPct = previstoTotal > 0 ? Math.round((desvio / previstoTotal) * 100) : null;

  // Quebra por tipo (ordenada pelo maior peso), com previsto e realizado lado a lado.
  const tipos = Array.from(new Set(custos.map((l) => l.tipo)));
  const linhas = tipos
    .map((t) => {
      const grp = custos.filter((l) => l.tipo === t);
      return { tipo: t, previsto: somar(grp, "previsto"), realizado: somar(grp, "realizado") };
    })
    .sort((a, b) => b.previsto + b.realizado - (a.previsto + a.realizado));

  const maxLinha = Math.max(1, ...linhas.map((l) => Math.max(l.previsto, l.realizado)));

  const DesvioIcon = desvio > 0 ? TrendingUp : desvio < 0 ? TrendingDown : Minus;
  // Custo acima do previsto = ruim (vermelho); abaixo = bom (turquesa).
  const desvioCls = desvio > 0 ? "text-red-600" : desvio < 0 ? "text-teal-600" : "text-muted-foreground";

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <Landmark className="h-3.5 w-3.5" /> Custo de aterrissagem (landed cost)
      </h3>

      {/* KPIs: previsto · realizado · desvio */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-muted/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Previsto</p>
          <p className="mt-0.5 text-sm font-bold text-foreground">{fmtBRL(previstoTotal)}</p>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Realizado</p>
          <p className="mt-0.5 text-sm font-bold text-foreground">{fmtBRL(realizadoTotal)}</p>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Desvio</p>
          <p className={`mt-0.5 inline-flex items-center gap-1 text-sm font-bold ${desvioCls}`}>
            <DesvioIcon className="h-3.5 w-3.5" />
            {desvio === 0 ? "—" : `${desvio > 0 ? "+" : "−"}${fmtBRL(Math.abs(desvio))}`}
            {desvioPct != null && desvio !== 0 && (
              <span className="text-[11px] font-semibold">({desvio > 0 ? "+" : "−"}{Math.abs(desvioPct)}%)</span>
            )}
          </p>
        </div>
      </div>

      {/* Referência: estimado no cálculo de viabilidade */}
      {estimadoBrlCents != null && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Estimado no cálculo de viabilidade: <span className="font-semibold text-foreground">{fmtBRL(estimadoBrlCents)}</span>
          {realizadoTotal > 0 && (
            <>
              {" · "}realizado está{" "}
              <span className={realizadoTotal > estimadoBrlCents ? "font-semibold text-red-600" : "font-semibold text-teal-600"}>
                {realizadoTotal > estimadoBrlCents ? "acima" : "dentro"}
              </span>{" "}do estimado
            </>
          )}
        </p>
      )}

      {/* Quebra por tipo de custo */}
      {linhas.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Sem custos lançados ainda. Registre câmbio, pagamentos, impostos e frete abaixo.
        </p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {linhas.map((l) => (
            <div key={l.tipo}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">{TIPO_LABEL[l.tipo] ?? l.tipo}</span>
                <span className="text-muted-foreground">
                  prev. <span className="font-semibold text-foreground">{fmtBRL(l.previsto)}</span>
                  {" · "}
                  real. <span className="font-semibold text-teal-700">{fmtBRL(l.realizado)}</span>
                </span>
              </div>
              {/* barras previsto (trilho) e realizado (turquesa) */}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="absolute inset-y-0 left-0 rounded-full bg-violet-200" style={{ width: `${(l.previsto / maxLinha) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-teal-500" style={{ width: `${(l.realizado / maxLinha) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
