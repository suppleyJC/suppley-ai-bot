/**
 * Uso da IA — medição de tokens e custo estimado por modelo (Claude).
 * Consome trpc.usage.summary. Custo é ESTIMATIVA (preço público × tokens).
 */
import React from "react";
import { trpc } from "@/lib/trpc";
import { Activity, Zap } from "lucide-react";

const usd = (n: number) => `US$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("pt-BR");

export function UsoIaPanel() {
  const { data, isLoading } = trpc.usage.summary.useQuery({ days: 30 });

  if (isLoading) return <Placeholder text="Carregando uso…" />;
  if (!data || data.totalCalls === 0) {
    return <Placeholder text="Ainda não há uso registrado nos últimos 30 dias. Conforme a Excambia for usada, os números aparecem aqui." />;
  }

  const cacheReadTotal = data.byModel.reduce((a, m) => a + m.cacheReadTokens, 0);
  const cacheWriteTotal = data.byModel.reduce((a, m) => a + m.cacheCreationTokens, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Custo estimado (30 dias)" value={usd(data.totalEstCostUsd)} strong />
        <Stat label="Chamadas de IA" value={num(data.totalCalls)} />
        <Stat label="Custo médio / chamada" value={usd(data.avgCostPerCallUsd)} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Por modelo
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Modelo</th>
                <th className="px-4 py-2.5">Chamadas</th>
                <th className="px-4 py-2.5">Input</th>
                <th className="px-4 py-2.5">Output</th>
                <th className="px-4 py-2.5">Cache (leitura)</th>
                <th className="px-4 py-2.5 text-right">Custo est.</th>
              </tr>
            </thead>
            <tbody>
              {data.byModel.map((m) => (
                <tr key={m.model} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-mono text-[12px] text-slate-700">{m.model}</td>
                  <td className="px-4 py-2.5">{num(m.calls)}</td>
                  <td className="px-4 py-2.5">{num(m.promptTokens)}</td>
                  <td className="px-4 py-2.5">{num(m.completionTokens)}</td>
                  <td className="px-4 py-2.5 text-teal-700">{num(m.cacheReadTokens)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{usd(m.estCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-teal-100 bg-teal-50 p-3 text-[13px] text-teal-800">
        <Zap className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          <strong>Prompt caching ativo.</strong> Tokens em "Cache (leitura)" custam ~10% do
          preço normal — quanto maior, mais barato escala. Leitura de cache nos 30 dias:{" "}
          <strong>{num(cacheReadTotal)}</strong> · escrita: {num(cacheWriteTotal)}. Custo é
          estimativa (preço público × tokens); o valor cobrado real está no Console da Anthropic.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-3 ${strong ? "border-violet-200 ring-1 ring-violet-100" : "border-slate-200"}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
function Placeholder({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
      <Activity className="mx-auto mb-2 h-6 w-6 text-slate-300" />
      {text}
    </div>
  );
}
