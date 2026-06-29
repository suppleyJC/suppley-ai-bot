/**
 * Memória da Excambia — o usuário vê, edita e remove os aprendizados persistentes
 * que a IA usa no contexto (excambia_learning_context). A própria Excambia também
 * grava aqui via a ferramenta registrar_memoria.
 *
 * Consome trpc.excambia.getLearningContext / saveLearningContext /
 * updateLearningContext / deleteLearningContext.
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Brain, Plus, Pencil, Trash2 } from "lucide-react";

const TYPES = [
  "preference", "business_rule", "supplier_info", "product_insight",
  "market_trend", "calculation_pattern", "feedback",
] as const;
type CtxType = (typeof TYPES)[number];

const TYPE_LABEL: Record<string, string> = {
  preference: "Preferência",
  business_rule: "Regra de negócio",
  supplier_info: "Fornecedor",
  product_insight: "Produto",
  market_trend: "Mercado",
  calculation_pattern: "Padrão de cálculo",
  feedback: "Feedback",
};
const TYPE_CLS: Record<string, string> = {
  preference: "bg-violet-50 text-violet-700",
  business_rule: "bg-blue-50 text-blue-700",
  supplier_info: "bg-teal-50 text-teal-700",
  product_insight: "bg-amber-50 text-amber-700",
  market_trend: "bg-emerald-50 text-emerald-700",
  calculation_pattern: "bg-slate-100 text-slate-600",
  feedback: "bg-rose-50 text-rose-700",
};

type Memoria = {
  id: number; contextType: string; key: string; value: string;
  importance: number; source?: string | null; updatedAt?: string | Date;
};

export default function MemoriaExcambia() {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.excambia.getLearningContext.useQuery();
  const [editing, setEditing] = useState<Memoria | null | "new">(null);
  const [toDelete, setToDelete] = useState<Memoria | null>(null);

  const del = trpc.excambia.deleteLearningContext.useMutation({
    onSuccess: () => { toast.success("Memória removida"); utils.excambia.getLearningContext.invalidate(); setToDelete(null); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const refresh = () => { utils.excambia.getLearningContext.invalidate(); setEditing(null); };

  // Agrupa por tipo, mantendo a ordem por importância que vem do backend.
  const grupos = new Map<string, Memoria[]>();
  for (const r of rows as Memoria[]) {
    if (!grupos.has(r.contextType)) grupos.set(r.contextType, []);
    grupos.get(r.contextType)!.push(r);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Brain className="h-6 w-6 text-violet-600" />
            <h1 className="text-xl font-bold text-slate-900">Memória da Excambia</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Aprendizados persistentes que a Excambia usa no contexto das conversas
            (preferências, regras, padrões). A IA grava aqui sozinha — e você pode
            ajustar ou remover a qualquer momento.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" /> Adicionar</Button>
      </header>

      {isLoading ? (
        <Placeholder text="Carregando memória…" />
      ) : rows.length === 0 ? (
        <Placeholder text="Nenhuma memória ainda. Conforme você conversa com a Excambia, ela registra aprendizados aqui — ou adicione manualmente." />
      ) : (
        <div className="space-y-6">
          {Array.from(grupos.entries()).map(([tipo, itens]) => (
            <section key={tipo}>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                {TYPE_LABEL[tipo] ?? tipo} <span className="text-slate-300">({itens.length})</span>
              </h2>
              <div className="space-y-2">
                {itens.map((m) => (
                  <div key={m.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{m.key}</span>
                        <Badge className={TYPE_CLS[m.contextType] ?? "bg-slate-100 text-slate-600"}>{TYPE_LABEL[m.contextType] ?? m.contextType}</Badge>
                        <span className="text-[11px] text-slate-400">importância {m.importance}</span>
                        {m.source === "excambia" && <span className="text-[11px] text-violet-400">• registrado pela IA</span>}
                      </div>
                      <p className="mt-1 break-words text-sm text-slate-600">{m.value}</p>
                    </div>
                    <div className="flex flex-shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(m)} aria-label="Editar">
                        <Pencil className="h-4 w-4 text-slate-500" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setToDelete(m)} aria-label="Excluir">
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <MemoriaDialog memoria={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta memória?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.key}” deixará de ser usada pela Excambia. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && del.mutate({ id: toDelete.id })}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MemoriaDialog({ memoria, onClose, onSaved }: {
  memoria: Memoria | null; onClose: () => void; onSaved: () => void;
}) {
  const [contextType, setContextType] = useState<CtxType>((memoria?.contextType as CtxType) ?? "preference");
  const [key, setKey] = useState(memoria?.key ?? "");
  const [value, setValue] = useState(memoria?.value ?? "");
  const [importance, setImportance] = useState<number>(memoria?.importance ?? 60);

  const save = trpc.excambia.saveLearningContext.useMutation({
    onSuccess: () => { toast.success("Memória adicionada"); onSaved(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  const update = trpc.excambia.updateLearningContext.useMutation({
    onSuccess: () => { toast.success("Memória atualizada"); onSaved(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  function submit() {
    if (!key.trim() || !value.trim()) { toast.error("Preencha rótulo e conteúdo"); return; }
    if (memoria) {
      update.mutate({ id: memoria.id, contextType, key: key.trim(), value: value.trim(), importance });
    } else {
      save.mutate({ contextType, key: key.trim(), value: value.trim(), importance, source: "manual" });
    }
  }

  const pending = save.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{memoria ? "Editar memória" : "Nova memória"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Tipo">
            <select value={contextType} onChange={(e) => setContextType(e.target.value as CtxType)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Rótulo"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ex: estado_importacao_padrao" /></Field>
          <Field label="Conteúdo"><Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="ex: Importa sempre por Santa Catarina (TTD 409)" rows={3} /></Field>
          <Field label={`Importância: ${importance}`}>
            <input type="range" min={0} max={100} value={importance} onChange={(e) => setImportance(Number(e.target.value))} className="w-full accent-violet-600" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={pending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</Label>
      {children}
    </div>
  );
}
function Placeholder({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">{text}</div>;
}
