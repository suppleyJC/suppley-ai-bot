/**
 * OperacaoTracking — rastreio de embarque da operação (preenchimento manual).
 *
 * Campos: contêiner, BL, armador, navio, ETA e status. Salva no blur via
 * operations.update. A integração com API de tracking (SeaRates/ShipsGo/AIS)
 * fica como pendência — o serviço/colunas já estão prontos para recebê-la.
 */
import React from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Ship, Anchor, Info } from "lucide-react";

interface TrackingOp {
  id: number;
  trackingContainer?: string | null;
  trackingBl?: string | null;
  trackingArmador?: string | null;
  trackingNavio?: string | null;
  trackingEta?: string | Date | null;
  trackingStatus?: string | null;
}

export default function OperacaoTracking({
  operacao, onChange,
}: {
  operacao: TrackingOp;
  onChange: () => void;
}) {
  const update = trpc.operations.update.useMutation({
    onSuccess: onChange,
    onError: (e) => toast.error(e.message || "Erro ao salvar rastreio"),
  });

  function saveText(field: keyof TrackingOp, value: string, current: string) {
    const v = value.trim();
    if (v === (current ?? "")) return;
    update.mutate({ operacaoId: operacao.id, [field]: v || null } as any);
  }

  function saveEta(value: string) {
    const cur = operacao.trackingEta ? new Date(operacao.trackingEta).toISOString().slice(0, 10) : "";
    if (value === cur) return;
    update.mutate({ operacaoId: operacao.id, trackingEta: value ? new Date(value) : null });
  }

  const field = (
    label: string,
    fieldName: keyof TrackingOp,
    current: string,
    placeholder: string,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type="text"
        defaultValue={current}
        onBlur={(e) => saveText(fieldName, e.target.value, current)}
        disabled={update.isPending}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
      />
    </label>
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <Ship className="h-3.5 w-3.5" /> Rastreio do embarque
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("Contêiner", "trackingContainer", operacao.trackingContainer ?? "", "Ex.: MSKU1234567")}
        {field("BL / Conhecimento", "trackingBl", operacao.trackingBl ?? "", "Ex.: HLCU... ")}
        {field("Armador", "trackingArmador", operacao.trackingArmador ?? "", "Ex.: Maersk, MSC, Hapag")}
        {field("Navio", "trackingNavio", operacao.trackingNavio ?? "", "Ex.: Ever Given")}

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <Anchor className="mr-1 inline h-3 w-3" /> ETA (chegada prevista)
          </span>
          <input
            type="date"
            defaultValue={operacao.trackingEta ? new Date(operacao.trackingEta).toISOString().slice(0, 10) : ""}
            onBlur={(e) => saveEta(e.target.value)}
            disabled={update.isPending}
            className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>

        {field("Status", "trackingStatus", operacao.trackingStatus ?? "", "Ex.: Em trânsito, atracado…")}
      </div>

      <p className="mt-3 inline-flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
        Rastreio automático por contêiner/BL será habilitado quando a API de tracking for conectada.
      </p>
    </section>
  );
}
