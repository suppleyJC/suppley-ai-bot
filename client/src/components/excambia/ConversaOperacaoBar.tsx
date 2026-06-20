/**
 * ConversaOperacaoBar — sincronização chat ↔ Painel (Fase 3).
 *
 * Mostra, no topo do chat, a Operação vinculada à conversa atual: código,
 * título, estágio e status. Permite vincular/desvincular e abrir a operação no
 * Painel. Uma vez vinculada, a Excambia passa a operar SOBRE essa operação
 * (as tools gravam eventos na timeline com autor="excambia" — a mesma timeline
 * do Painel, garantindo coesão).
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link2, Link2Off, ExternalLink, ChevronDown, Workflow } from "lucide-react";
import { STAGE_META, type Estagio } from "@/lib/stageLabels";
import { toast } from "sonner";

interface Props {
  conversaId: number;
  operacaoId: number | null;
  onChanged: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  ativa: "Ativa", go: "GO", no_go: "NO-GO",
  concluida: "Concluída", perdida: "Perdida", pausada: "Pausada",
};

export function ConversaOperacaoBar({ conversaId, operacaoId, onChanged }: Props) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: operacoes } = trpc.operations.list.useQuery();
  const { data: detail } = trpc.operations.get.useQuery(
    { id: operacaoId ?? 0 },
    { enabled: !!operacaoId },
  );

  const link = trpc.excambia.linkConversaOperacao.useMutation({
    onSuccess: () => {
      utils.excambia.getConversa.invalidate({ conversaId });
      utils.excambia.listConversas.invalidate();
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleLink(opId: number, estagio?: Estagio) {
    link.mutate({ conversaId, operacaoId: opId, estagio });
  }
  function handleUnlink() {
    link.mutate({ conversaId, operacaoId: null });
    toast.success("Conversa desvinculada da operação");
  }

  const op = detail?.operacao;
  const lista = operacoes ?? [];

  // Sem vínculo: oferece vincular a uma operação existente.
  if (!operacaoId || !op) {
    return (
      <div className="flex items-center justify-between gap-2 border-b bg-slate-50/80 px-3 py-1.5 dark:bg-slate-900/50">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Workflow className="h-3.5 w-3.5" />
          Conversa sem operação vinculada
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Link2 className="h-3.5 w-3.5" /> Vincular operação
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Vincular a uma operação</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {lista.length === 0 ? (
              <DropdownMenuItem disabled>Nenhuma operação ainda</DropdownMenuItem>
            ) : (
              lista.map((o: any) => (
                <DropdownMenuItem key={o.id} onClick={() => handleLink(o.id, o.estagioAtual)}>
                  <span className="font-mono text-[10px] text-muted-foreground mr-2">{o.codigo}</span>
                  <span className="truncate">{o.titulo}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Com vínculo: mostra o estado da operação + ações.
  // STAGE_META cobre só os 5 estágios operacionais; closed/lost caem no fallback.
  const stage = STAGE_META[op.estagioAtual as keyof typeof STAGE_META];
  const StageIcon = stage?.Icon ?? Workflow;
  return (
    <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-1.5 dark:from-purple-950/30 dark:to-indigo-950/30">
      <div className="flex min-w-0 items-center gap-2">
        <StageIcon className="h-4 w-4 shrink-0 text-violet-600" />
        <span className="font-mono text-[10px] text-violet-500">{op.codigo}</span>
        <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{op.titulo}</span>
        {stage && (
          <Badge variant="outline" className="h-5 shrink-0 text-[10px]">{stage.label}</Badge>
        )}
        <Badge variant="secondary" className="h-5 shrink-0 text-[10px]">
          {STATUS_LABEL[op.status] ?? op.status}
        </Badge>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost" size="sm" className="h-7 gap-1 text-xs"
          onClick={() => navigate(`/operacao/${op.id}`)}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir no Painel
        </Button>
        <Button
          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
          onClick={handleUnlink} title="Desvincular"
        >
          <Link2Off className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
