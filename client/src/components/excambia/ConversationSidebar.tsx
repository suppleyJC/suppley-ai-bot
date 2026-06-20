/**
 * ConversationSidebar — histórico de conversas da Excambia (Fase 3).
 *
 * Lista as conversas do usuário (mais recentes primeiro), permite criar uma
 * nova, retomar, renomear, arquivar e excluir. Quando uma conversa está ligada
 * a uma Operação, mostra um selo com o código — base da sincronização chat ↔ Painel.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MessageSquarePlus, MoreVertical, Pencil, Trash2, Archive, ArchiveRestore,
  MessageSquare, Link2, History,
} from "lucide-react";
import { toast } from "sonner";

interface ConversationSidebarProps {
  activeConversaId: number | null;
  onSelect: (conversaId: number | null) => void;
  onNew: () => void;
}

function tempo(iso?: string | Date | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const dias = Math.floor(h / 24);
  if (dias < 7) return `${dias}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ConversationSidebar({ activeConversaId, onSelect, onNew }: ConversationSidebarProps) {
  const utils = trpc.useUtils();
  const [showArchived, setShowArchived] = useState(false);
  const { data, isLoading } = trpc.excambia.listConversas.useQuery(
    showArchived ? { status: "arquivada" } : { status: "ativa" },
  );

  const [renameTarget, setRenameTarget] = useState<{ id: number; titulo: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; titulo: string } | null>(null);

  const invalidate = () => utils.excambia.listConversas.invalidate();

  const renameMut = trpc.excambia.renameConversa.useMutation({
    onSuccess: () => { invalidate(); setRenameTarget(null); toast.success("Conversa renomeada"); },
    onError: (e) => toast.error(e.message),
  });
  const archiveMut = trpc.excambia.archiveConversa.useMutation({
    onSuccess: () => { invalidate(); toast.success("Conversa atualizada"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.excambia.deleteConversa.useMutation({
    onSuccess: (_d, vars) => {
      invalidate();
      setDeleteTarget(null);
      if (vars.conversaId === activeConversaId) onNew();
      toast.success("Conversa excluída");
    },
    onError: (e) => toast.error(e.message),
  });

  const conversas = data?.conversas ?? [];
  const legacyCount = data?.legacyCount ?? 0;

  return (
    <div className="flex h-full flex-col border-r bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
      {/* Cabeçalho + nova conversa */}
      <div className="p-3 border-b">
        <Button
          onClick={onNew}
          className="w-full justify-start gap-2 bg-gradient-to-r from-[#311260] to-[#682ABA] hover:opacity-90"
          size="sm"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Nova conversa
        </Button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : conversas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              {showArchived ? "Nenhuma conversa arquivada" : "Nenhuma conversa ainda"}
            </p>
          </div>
        ) : (
          conversas.map((c) => {
            const active = c.id === activeConversaId;
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`group relative flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                  active
                    ? "bg-purple-100 dark:bg-purple-900/40"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <MessageSquare className={`h-4 w-4 mt-0.5 shrink-0 ${active ? "text-purple-600" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{c.titulo}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{tempo(c.ultimaMensagemEm ?? c.criadaEm)}</span>
                    {c.operacaoId && (
                      <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5">
                        <Link2 className="h-2.5 w-2.5" /> OP
                      </Badge>
                    )}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => setRenameTarget({ id: c.id, titulo: c.titulo })}>
                      <Pencil className="h-4 w-4 mr-2" /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => archiveMut.mutate({
                        conversaId: c.id,
                        status: c.status === "arquivada" ? "ativa" : "arquivada",
                      })}
                    >
                      {c.status === "arquivada" ? (
                        <><ArchiveRestore className="h-4 w-4 mr-2" /> Desarquivar</>
                      ) : (
                        <><Archive className="h-4 w-4 mr-2" /> Arquivar</>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onClick={() => setDeleteTarget({ id: c.id, titulo: c.titulo })}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}

        {/* Histórico legado (mensagens sem conversa, pré-Fase 3) */}
        {!showArchived && legacyCount > 0 && (
          <button
            onClick={() => onSelect(null)}
            className={`mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
              activeConversaId === null
                ? "bg-amber-100 dark:bg-amber-900/30"
                : "hover:bg-slate-100 dark:hover:bg-slate-800/60"
            }`}
          >
            <History className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">Histórico anterior</p>
              <span className="text-[10px] text-muted-foreground">{legacyCount} mensagens</span>
            </div>
          </button>
        )}
      </div>

      {/* Rodapé: alternar arquivadas */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => setShowArchived((v) => !v)}
        >
          <Archive className="h-4 w-4" />
          {showArchived ? "Ver conversas ativas" : "Ver arquivadas"}
        </Button>
      </div>

      {/* Dialog de renomear */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear conversa</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTarget?.titulo ?? ""}
            onChange={(e) => setRenameTarget((t) => (t ? { ...t, titulo: e.target.value } : t))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameTarget?.titulo.trim()) {
                renameMut.mutate({ conversaId: renameTarget.id, titulo: renameTarget.titulo });
              }
            }}
            placeholder="Título da conversa"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancelar</Button>
            <Button
              disabled={!renameTarget?.titulo.trim() || renameMut.isPending}
              onClick={() => renameTarget && renameMut.mutate({ conversaId: renameTarget.id, titulo: renameTarget.titulo })}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              A conversa <strong>{deleteTarget?.titulo}</strong> e todas as suas mensagens serão
              removidas permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMut.mutate({ conversaId: deleteTarget.id })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
