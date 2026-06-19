/**
 * CambioDoDia — card transversal de câmbio (COMANDO 8 da Fase 2).
 *
 * O câmbio deixou de ser uma ETAPA da operação (saiu da coluna do Kanban, virou
 * "Nacionalização / Entrega") e passa a ser uma CAMADA TRANSVERSAL: uma referência
 * de mercado sempre visível na Inteligência de Mercado, consultável a qualquer
 * momento, independente do estágio da operação.
 *
 * Consome trpc.exchange.getRate (BCB oficial > AwesomeAPI > cache), as mesmas
 * fontes usadas pelo motor de cálculo — uma única fonte de verdade de câmbio.
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, RefreshCw, Clock } from "lucide-react";

/** Moedas de origem mais usadas em importação (sempre cotadas contra o BRL). */
const PARES = [
  { from: "USD", label: "Dólar", symbol: "US$", flag: "🇺🇸" },
  { from: "EUR", label: "Euro", symbol: "€", flag: "🇪🇺" },
  { from: "CNY", label: "Yuan", symbol: "¥", flag: "🇨🇳" },
] as const;

function fmtBRL(rate: number) {
  return rate.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function fmtHora(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Uma linha de cotação (uma moeda → BRL). */
function CotacaoLinha({ from, label, symbol, flag }: (typeof PARES)[number]) {
  const { data, isLoading } = trpc.exchange.getRate.useQuery(
    { from, to: "BRL" },
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  );

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>{flag}</span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-700">{label}</p>
          <p className="text-[11px] text-slate-400">{symbol} → R$</p>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-5 w-20" />
      ) : (
        <span className="font-mono text-sm font-bold text-slate-900">
          {data ? fmtBRL(data.rate) : "—"}
        </span>
      )}
    </div>
  );
}

export default function CambioDoDia() {
  const utils = trpc.useUtils();

  // Usa a cotação do dólar como referência de fonte/horário do card.
  const { data: ref } = trpc.exchange.getRate.useQuery(
    { from: "USD", to: "BRL" },
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  );

  function handleRefresh() {
    utils.exchange.getRate.invalidate();
  }

  const fonte = ref?.source?.toUpperCase().includes("BCB")
    ? "BCB (oficial)"
    : ref?.source ?? "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          Câmbio do dia
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-8 px-2">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {PARES.map((p) => (
          <CotacaoLinha key={p.from} {...p} />
        ))}
        <div className="flex items-center justify-between pt-1">
          <Badge variant="outline" className="text-[10px] font-medium">
            {fonte}
          </Badge>
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <Clock className="h-3 w-3" />
            {fmtHora(ref?.timestamp)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
