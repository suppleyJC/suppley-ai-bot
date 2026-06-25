import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/** Ponto de preço (espelha PricePoint do backend; datas chegam como Date via superjson). */
export interface PricePointView {
  proformaId: number;
  numero: string | null;
  quotationDate: Date | string;
  supplierName: string | null;
  supplierCountry?: string | null;
  currency: string;
  unit: string;
  unitPriceCents: number;
  unitPriceBrlCents: number | null;
  nationalizedUnitCostBrlCents: number | null;
  nationalizedMarkupPercent: number | null;
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtMoney(cents: number | null | undefined, currency: string): string {
  if (cents == null) return "—";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function ChangeBadge({ percent }: { percent: number | null }) {
  if (percent == null) return null;
  const up = percent > 0;
  const flat = percent === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  // Para custo de compra: subir é ruim (vermelho), cair é bom (verde).
  const color = flat
    ? "bg-gray-100 text-gray-700"
    : up
      ? "bg-red-100 text-red-700"
      : "bg-green-100 text-green-700";
  return (
    <Badge className={`gap-1 ${color}`}>
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {percent.toFixed(1)}%
    </Badge>
  );
}

/**
 * Visão reutilizável de histórico de preços: estatísticas + gráfico cronológico
 * (FOB/EXW em BRL e custo nacionalizado estimado) + tabela detalhada.
 * Usada tanto no histórico por produto quanto no catálogo do fornecedor.
 */
export function PriceHistoryView({
  points,
  compact = false,
}: {
  points: PricePointView[];
  compact?: boolean;
}) {
  const sorted = useMemo(
    () =>
      [...points].sort(
        (a, b) =>
          new Date(a.quotationDate).getTime() - new Date(b.quotationDate).getTime()
      ),
    [points]
  );

  const currency = sorted[0]?.currency || "USD";

  const chartData = useMemo(
    () =>
      sorted.map((p) => ({
        date: fmtDate(p.quotationDate),
        fobBrl: p.unitPriceBrlCents != null ? p.unitPriceBrlCents / 100 : null,
        natBrl:
          p.nationalizedUnitCostBrlCents != null
            ? p.nationalizedUnitCostBrlCents / 100
            : null,
        fobOriginal: p.unitPriceCents / 100,
        currency: p.currency,
        supplier: p.supplierName || "—",
      })),
    [sorted]
  );

  const hasBrl = chartData.some((d) => d.fobBrl != null);
  const hasNat = chartData.some((d) => d.natBrl != null);

  // Variação do primeiro ao último (moeda original)
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const changePercent =
    first && last && first.unitPriceCents > 0
      ? Math.round(((last.unitPriceCents - first.unitPriceCents) / first.unitPriceCents) * 10000) / 100
      : null;

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Sem cotações registradas ainda.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Estatísticas resumidas */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Cotações: </span>
          <span className="font-medium">{sorted.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Último preço: </span>
          <span className="font-medium font-mono">
            {fmtMoney(last.unitPriceCents, last.currency)}
          </span>
          {last.unitPriceBrlCents != null && (
            <span className="text-muted-foreground"> ({fmtMoney(last.unitPriceBrlCents, "BRL")})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Variação:</span>
          <ChangeBadge percent={changePercent} />
        </div>
        {last.nationalizedMarkupPercent != null && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Posto no Brasil (estim.):</span>
            <Badge className="bg-amber-100 text-amber-800">
              +{last.nationalizedMarkupPercent.toFixed(0)}% sobre FOB
            </Badge>
          </div>
        )}
      </div>

      {/* Gráfico cronológico */}
      {(hasBrl || sorted.length > 1) && (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={56}
                tickFormatter={(v) => `R$ ${Number(v).toFixed(0)}`}
              />
              <Tooltip
                formatter={(value: any, name: string) => {
                  const label =
                    name === "fobBrl"
                      ? "FOB (BRL)"
                      : name === "natBrl"
                        ? "Nacionalizado (BRL)"
                        : name;
                  return [value != null ? `R$ ${Number(value).toFixed(2)}` : "—", label];
                }}
                labelClassName="text-xs"
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                formatter={(value) =>
                  value === "fobBrl"
                    ? "FOB/EXW (BRL)"
                    : value === "natBrl"
                      ? "Custo nacionalizado (estim.)"
                      : value
                }
                wrapperStyle={{ fontSize: 12 }}
              />
              {hasBrl && (
                <Line
                  type="monotone"
                  dataKey="fobBrl"
                  stroke="#682ABA"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              )}
              {hasNat && (
                <Line
                  type="monotone"
                  dataKey="natBrl"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 3 }}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela detalhada */}
      {!compact && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Data</th>
                <th className="text-left p-2 font-medium">Fornecedor</th>
                <th className="text-right p-2 font-medium">Preço (orig.)</th>
                <th className="text-right p-2 font-medium">FOB (BRL)</th>
                <th className="text-right p-2 font-medium">Nacionalizado</th>
                <th className="text-right p-2 font-medium">+% Brasil</th>
              </tr>
            </thead>
            <tbody>
              {[...sorted].reverse().map((p, i) => (
                <tr key={`${p.proformaId}-${i}`} className="border-t hover:bg-muted/30">
                  <td className="p-2 whitespace-nowrap">{fmtDate(p.quotationDate)}</td>
                  <td className="p-2 truncate max-w-[160px]" title={p.supplierName || ""}>
                    {p.supplierName || "—"}
                  </td>
                  <td className="p-2 text-right font-mono">{fmtMoney(p.unitPriceCents, p.currency)}</td>
                  <td className="p-2 text-right font-mono">{fmtMoney(p.unitPriceBrlCents, "BRL")}</td>
                  <td className="p-2 text-right font-mono">
                    {fmtMoney(p.nationalizedUnitCostBrlCents, "BRL")}
                  </td>
                  <td className="p-2 text-right">
                    {p.nationalizedMarkupPercent != null
                      ? `+${p.nationalizedMarkupPercent.toFixed(0)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default PriceHistoryView;
