/**
 * ConversationPanel — o painel de conversas da Excambia (estilo Claude).
 *
 * Dois grupos: "Operações" (conversas vinculadas a operação) e "Conversas" (avulsas).
 * Recolhível. Busca. Ações por item (renomear/arquivar/excluir).
 *
 * Dados: consome trpc.conversas.list / create / rename / archive / remove.
 * Estilo: Tailwind com tokens da marca (roxo #682ABA, turquesa #28E7C5).
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Plus, Search, MoreHorizontal, ChevronLeft, Clock } from "lucide-react";

interface Props {
  activeId?: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// cor da bolinha por estágio (coeso com o Painel de Operações)
const STAGE_DOT: Record<string, string> = {
  demand: "#9d6ff0", source: "#5a8fe6", analyze: "#28E7C5",
  execute: "#f0a93b", finance: "#1aa885",
};

export default function ConversationPanel({
  activeId, onSelect, onNew, collapsed, onToggleCollapse,
}: Props) {
  const [q, setQ] = useState("");
  const { data, isLoading } = trpc.conversas.list.useQuery();
  const utils = trpc.useUtils();

  const rename = trpc.conversas.rename.useMutation({ onSuccess: () => utils.conversas.list.invalidate() });
  const archive = trpc.conversas.archive.useMutation({ onSuccess: () => utils.conversas.list.invalidate() });
  const remove = trpc.conversas.remove.useMutation({ onSuccess: () => utils.conversas.list.invalidate() });

  if (collapsed) {
    return (
      <div className="flex w-12 flex-shrink-0 flex-col items-center border-r border-slate-200 bg-white py-4">
        <button onClick={onToggleCollapse} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Abrir conversas">
          <Search className="h-5 w-5" />
        </button>
        <button onClick={onNew} className="mt-2 rounded-lg p-2 text-violet-600 hover:bg-violet-50" title="Nova conversa">
          <Plus className="h-5 w-5" />
        </button>
      </div>
    );
  }

  const filtra = (arr: any[] = []) =>
    arr.filter((c) => c.titulo.toLowerCase().includes(q.toLowerCase()));

  const operacoes = filtra(data?.operacoes);
  const avulsas = filtra(data?.avulsas);

  function itemMenu(id: number, titulo: string) {
    const novo = window.prompt("Renomear conversa:", titulo);
    if (novo && novo !== titulo) rename.mutate({ id, titulo: novo });
  }

  return (
    <div className="flex w-[268px] flex-shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* header */}
      <div className="flex items-center gap-2 p-4 pb-2.5">
        <button onClick={onNew}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">
          <Plus className="h-4 w-4" /> Nova conversa
        </button>
        <button onClick={onToggleCollapse}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Recolher">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* busca */}
      <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <Search className="h-4 w-4 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversa…"
          className="w-full bg-transparent text-sm text-slate-600 outline-none placeholder:text-slate-400" />
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-4">
        {isLoading && <p className="px-2 py-4 text-sm text-slate-400">Carregando…</p>}

        {/* GRUPO OPERAÇÕES */}
        {operacoes.length > 0 && (
          <>
            <div className="flex items-center px-2 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Operações
              <span className="ml-auto rounded-md bg-slate-100 px-1.5 text-[10px] text-slate-500">
                {operacoes.length} ativas
              </span>
            </div>
            {operacoes.map((c) => (
              <ConvItem key={c.id} c={c} active={c.id === activeId}
                dot={STAGE_DOT[c.estagioAtual ?? "demand"] ?? "#cbd5e1"}
                onSelect={() => onSelect(c.id)}
                onMenu={() => itemMenu(c.id, c.titulo)}
                onArchive={() => archive.mutate({ id: c.id })}
                onRemove={() => { if (confirm("Excluir esta conversa?")) remove.mutate({ id: c.id }); }} />
            ))}
          </>
        )}

        {/* GRUPO CONVERSAS AVULSAS */}
        {avulsas.length > 0 && (
          <>
            <div className="px-2 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Conversas
            </div>
            {avulsas.map((c) => (
              <ConvItem key={c.id} c={c} active={c.id === activeId} dot="#d8d2e6" avulsa
                onSelect={() => onSelect(c.id)}
                onMenu={() => itemMenu(c.id, c.titulo)}
                onArchive={() => archive.mutate({ id: c.id })}
                onRemove={() => { if (confirm("Excluir esta conversa?")) remove.mutate({ id: c.id }); }} />
            ))}
          </>
        )}

        {!isLoading && operacoes.length === 0 && avulsas.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-slate-400">
            Nenhuma conversa ainda.<br />Comece uma nova.
          </p>
        )}
      </div>
    </div>
  );
}

function ConvItem({ c, active, dot, avulsa, onSelect, onMenu, onArchive, onRemove }: any) {
  return (
    <div onClick={onSelect}
      className={`group relative flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 ${active ? "bg-violet-50" : "hover:bg-slate-50"}`}>
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: dot }} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[12.5px] text-slate-800 ${avulsa ? "font-medium" : "font-semibold"}`}>
          {c.titulo}
        </div>
        <div className="truncate text-[10.5px] text-slate-400">
          {c.operacaoId ? `OP-${String(c.operacaoId).padStart(4, "0")}` : "consulta"}
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onMenu(); }}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500">
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}
