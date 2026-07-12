/**
 * ConversationPanel — o painel de conversas da Excambia (estilo Claude).
 *
 * Dois grupos: "Operações" (conversas vinculadas a operação) e "Conversas" (avulsas).
 * Recolhível. Busca. Menu de ações por item (Fixar / Mudar o nome / Arquivar / Apagar).
 *
 * Dados: consome trpc.conversas.list / create / rename / setPinned / archive / remove.
 * Estilo: Tailwind com tokens da marca (roxo #682ABA, turquesa #28E7C5).
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Plus, Search, MoreHorizontal, PanelLeftOpen, PanelLeftClose, Pin, PinOff, Pencil, Archive, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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

  const invalidate = () => utils.conversas.list.invalidate();
  const rename = trpc.conversas.rename.useMutation({ onSuccess: invalidate });
  const setPinned = trpc.conversas.setPinned.useMutation({ onSuccess: invalidate });
  const archive = trpc.conversas.archive.useMutation({ onSuccess: invalidate });
  const remove = trpc.conversas.remove.useMutation({ onSuccess: invalidate });

  if (collapsed) {
    return (
      <div className="flex h-full w-14 flex-shrink-0 flex-col items-center border-r border-(--hair) bg-(--paper) py-4 gap-3">
        {/* expandir — círculo destacado */}
        <button
          onClick={onToggleCollapse}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-600 shadow-[0_2px_8px_rgba(104,42,186,0.18)] ring-1 ring-violet-200 transition hover:scale-110 hover:bg-violet-200"
          title="Abrir conversas"
        >
          <PanelLeftOpen className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={onNew}
          className="flex h-9 w-9 items-center justify-center rounded-full text-violet-600 transition hover:bg-violet-50"
          title="Nova conversa"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    );
  }

  const filtra = (arr: any[] = []) =>
    arr.filter((c) => c.titulo.toLowerCase().includes(q.toLowerCase()));

  const operacoes = filtra(data?.operacoes);
  const avulsas = filtra(data?.avulsas);

  // Renomear via prompt simples (UX leve; o menu chama isto).
  function pedirNovoNome(id: number, titulo: string) {
    const novo = window.prompt("Renomear conversa:", titulo);
    if (novo && novo.trim() && novo !== titulo) rename.mutate({ id, titulo: novo.trim() });
  }

  const acoes = {
    pin: (id: number, fixada: boolean) => setPinned.mutate({ id, fixada: !fixada }),
    rename: pedirNovoNome,
    archive: (id: number) => archive.mutate({ id }),
    remove: (id: number) => { if (confirm("Apagar esta conversa? Ela sairá da lista.")) remove.mutate({ id }); },
  };

  return (
    <>
      {/* backdrop só no mobile (fecha o drawer ao tocar fora) */}
      <div
        onClick={onToggleCollapse}
        className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-[1px] sm:hidden"
      />
      <div className="flex h-full w-64 md:w-80 flex-shrink-0 flex-col border-r border-(--hair) bg-(--paper) max-sm:absolute max-sm:inset-y-0 max-sm:left-0 max-sm:z-40 max-sm:w-[82vw] max-sm:max-w-[18rem] max-sm:shadow-2xl">
      {/* header */}
      <div className="flex items-center gap-2 p-3 sm:p-4 pb-2 sm:pb-2.5 flex-shrink-0">
        <button onClick={onNew}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-violet-700">
          <Plus className="h-4 w-4" /> Nova conversa
        </button>
        {/* recolher — círculo destacado */}
        <button onClick={onToggleCollapse}
          className="flex h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 shadow-[0_2px_8px_rgba(104,42,186,0.18)] ring-1 ring-violet-200 transition hover:scale-110 hover:bg-violet-200" title="Recolher">
          <PanelLeftClose className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* busca */}
      <div className="mx-3 sm:mx-4 mb-2 flex items-center gap-2 rounded-lg border border-(--hair) bg-(--paper) px-2.5 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">
        <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-(--ink-2)" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
          className="w-full bg-transparent text-base sm:text-sm text-(--ink) outline-none placeholder:text-(--ink-2)" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
        {isLoading && <p className="px-2 py-4 text-sm text-(--ink-2)">Carregando…</p>}

        {/* GRUPO OPERAÇÕES */}
        {operacoes.length > 0 && (
          <>
            <div className="sticky top-0 z-10 flex items-center bg-(--paper) px-2 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wide text-(--ink-2)">
              Operações
              <span className="ml-auto rounded-md bg-(--hair) px-1.5 text-[10px] text-(--ink-2)">
                {operacoes.length} ativas
              </span>
            </div>
            {operacoes.map((c) => (
              <ConvItem key={c.id} c={c} active={c.id === activeId}
                dot={STAGE_DOT[c.estagio ?? "demand"] ?? "#cbd5e1"}
                onSelect={() => onSelect(c.id)} acoes={acoes} />
            ))}
          </>
        )}

        {/* GRUPO CONVERSAS AVULSAS */}
        {avulsas.length > 0 && (
          <>
            <div className="sticky top-0 z-10 bg-(--paper) px-2 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-wide text-(--ink-2)">
              Conversas
            </div>
            {avulsas.map((c) => (
              <ConvItem key={c.id} c={c} active={c.id === activeId} dot="#d8d2e6" avulsa
                onSelect={() => onSelect(c.id)} acoes={acoes} />
            ))}
          </>
        )}

        {!isLoading && operacoes.length === 0 && avulsas.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-(--ink-2)">
            Nenhuma conversa ainda.<br />Comece uma nova.
          </p>
        )}
      </div>
      </div>
    </>
  );
}

interface AcoesConv {
  pin: (id: number, fixada: boolean) => void;
  rename: (id: number, titulo: string) => void;
  archive: (id: number) => void;
  remove: (id: number) => void;
}

function ConvItem({ c, active, dot, avulsa, onSelect, acoes }: {
  c: any; active: boolean; dot: string; avulsa?: boolean;
  onSelect: () => void; acoes: AcoesConv;
}) {
  return (
    <div onClick={onSelect}
      className={`group relative flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 ${active ? "bg-violet-50" : "hover:bg-(--paper)"}`}>
      {c.fixada
        ? <Pin className="h-3 w-3 flex-shrink-0 text-violet-500" fill="currentColor" />
        : <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: dot }} />}
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[12.5px] text-(--ink) ${avulsa ? "font-medium" : "font-semibold"}`}>
          {c.titulo}
        </div>
        <div className="truncate text-[10.5px] text-(--ink-2)">
          {c.operacaoId ? `OP-${String(c.operacaoId).padStart(4, "0")}` : "consulta"}
          {/* visão de admin: identifica de quem é a conversa */}
          {c.donoNome ? <span className="text-violet-500"> · {c.donoNome}</span> : null}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button onClick={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 text-(--idle) hover:text-(--ink) rounded p-0.5">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => acoes.pin(c.id, !!c.fixada)}>
            {c.fixada ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
            {c.fixada ? "Desafixar" : "Fixar"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => acoes.rename(c.id, c.titulo)}>
            <Pencil className="mr-2 h-4 w-4" />
            Mudar o nome
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => acoes.archive(c.id)}>
            <Archive className="mr-2 h-4 w-4" />
            Arquivar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => acoes.remove(c.id)}
            className="text-red-600 focus:text-red-600 focus:bg-red-50">
            <Trash2 className="mr-2 h-4 w-4" />
            Apagar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
