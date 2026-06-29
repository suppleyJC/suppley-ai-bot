/**
 * Parâmetros de Cálculo — central de tributos, taxas, custos portuários,
 * ex-tarifário e benefícios fiscais que alimentam o motor.
 *
 * Consome trpc.parametros.* (Fase 1/2). Edições de tributo criam NOVA versão
 * (vigência por data); o motor sempre usa a versão vigente.
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { SlidersHorizontal, Anchor, FileMinus2, Gift, Plus, History } from "lucide-react";

/* ---------- helpers de formato ---------- */
const pctFromBp = (bp?: number | null) => (bp == null ? "—" : `${(bp / 100).toFixed(2)}%`);
const brlFromCents = (c?: number | null) =>
  c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const CATEGORY_LABEL: Record<string, string> = {
  tributo_federal: "Tributo federal",
  taxa_fixa: "Taxa fixa",
  despesa: "Despesa",
};

export default function Parametros() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="h-6 w-6 text-violet-600" />
          <h1 className="text-xl font-bold text-slate-900">Parâmetros de cálculo</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Tributos, taxas, custos portuários, ex-tarifário e benefícios fiscais que
          alimentam o motor. Alíquotas e taxas têm <strong>vigência por data</strong> —
          o motor usa sempre a versão vigente.
        </p>
      </header>

      <Tabs defaultValue="tributos">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="tributos"><SlidersHorizontal className="mr-1.5 h-4 w-4" /> Tributos & taxas</TabsTrigger>
          <TabsTrigger value="portos"><Anchor className="mr-1.5 h-4 w-4" /> Custos portuários</TabsTrigger>
          <TabsTrigger value="ex"><FileMinus2 className="mr-1.5 h-4 w-4" /> Ex-tarifário</TabsTrigger>
          <TabsTrigger value="beneficios"><Gift className="mr-1.5 h-4 w-4" /> Benefícios</TabsTrigger>
        </TabsList>

        <TabsContent value="tributos"><TributosTab /></TabsContent>
        <TabsContent value="portos"><PortosTab /></TabsContent>
        <TabsContent value="ex"><ExTarifarioTab /></TabsContent>
        <TabsContent value="beneficios"><BeneficiosTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================
 * TRIBUTOS & TAXAS
 * ============================================================ */
function TributosTab() {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.parametros.taxParams.list.useQuery();
  const [editing, setEditing] = useState<null | { paramKey: string; label: string; category: string; unit: string }>(null);

  // Linha vigente por chave (a mais recente).
  const latestByKey = new Map<string, any>();
  for (const r of rows) {
    const cur = latestByKey.get(r.paramKey);
    if (!cur || new Date(r.effectiveDate) > new Date(cur.effectiveDate)) latestByKey.set(r.paramKey, r);
  }
  const current = Array.from(latestByKey.values()).sort((a, b) => a.category.localeCompare(b.category));

  if (isLoading) return <Placeholder text="Carregando parâmetros…" />;

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <tr>
              <Th>Parâmetro</Th><Th>Categoria</Th><Th>Valor vigente</Th>
              <Th>Vigência</Th><Th>Base legal</Th><Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {current.map((r) => (
              <tr key={r.paramKey} className="border-t border-slate-100">
                <Td className="font-medium text-slate-800">{r.label}<div className="font-mono text-[11px] text-slate-400">{r.paramKey}</div></Td>
                <Td><Badge variant="secondary">{CATEGORY_LABEL[r.category] ?? r.category}</Badge></Td>
                <Td className="font-semibold">{r.unit === "bp" ? pctFromBp(r.valueBp) : brlFromCents(r.valueCents)}</Td>
                <Td className="text-slate-500">{fmtDate(r.effectiveDate)}</Td>
                <Td className="max-w-[220px] truncate text-slate-500" >{r.legalBasis ?? "—"}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ paramKey: r.paramKey, label: r.label, category: r.category, unit: r.unit })}>
                    <History className="mr-1.5 h-3.5 w-3.5" /> Nova versão
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <NovaVersaoDialog
          base={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { utils.parametros.taxParams.list.invalidate(); utils.parametros.taxParams.active.invalidate(); setEditing(null); }}
        />
      )}
    </Card>
  );
}

function NovaVersaoDialog({ base, onClose, onSaved }: {
  base: { paramKey: string; label: string; category: string; unit: string };
  onClose: () => void; onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [legalBasis, setLegalBasis] = useState("");
  const save = trpc.parametros.taxParams.saveVersion.useMutation({
    onSuccess: () => { toast.success("Nova versão registrada"); onSaved(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  function submit() {
    const num = Number(value.replace(",", "."));
    if (!Number.isFinite(num)) { toast.error("Informe um valor numérico"); return; }
    save.mutate({
      paramKey: base.paramKey,
      label: base.label,
      category: base.category as any,
      unit: base.unit as any,
      valueBp: base.unit === "bp" ? Math.round(num * 100) : null,   // % → bp
      valueCents: base.unit === "cents" ? Math.round(num * 100) : null, // R$ → centavos
      effectiveDate: new Date(effectiveDate),
      legalBasis: legalBasis || null,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova versão — {base.label}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label={base.unit === "bp" ? "Valor (%)" : "Valor (R$)"}>
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={base.unit === "bp" ? "ex: 2,1" : "ex: 185,00"} />
          </Field>
          <Field label="Vigente a partir de">
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </Field>
          <Field label="Base legal (opcional)">
            <Input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} placeholder="ex: Lei 10.865/2004" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>Salvar versão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * CUSTOS PORTUÁRIOS
 * ============================================================ */
function PortosTab() {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.parametros.ports.list.useQuery();
  const [editing, setEditing] = useState<any | null>(null);
  if (isLoading) return <Placeholder text="Carregando portos…" />;

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <tr><Th>Porto</Th><Th>UF</Th><Th>THC</Th><Th>Armazenagem</Th><Th>Liberação</Th><Th className="text-right">Ações</Th></tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-slate-100">
                <Td className="font-medium text-slate-800">{r.portName}<div className="font-mono text-[11px] text-slate-400">{r.portCode}</div></Td>
                <Td>{r.stateCode}</Td>
                <Td>{brlFromCents(r.thcCents)}</Td>
                <Td>{pctFromBp(r.storageBp)} do CIF</Td>
                <Td>{brlFromCents(r.liberationCents)}</Td>
                <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setEditing(r)}>Editar</Button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <PortoDialog row={editing} onClose={() => setEditing(null)}
          onSaved={() => { utils.parametros.ports.list.invalidate(); setEditing(null); }} />
      )}
    </Card>
  );
}

function PortoDialog({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) {
  const [thc, setThc] = useState((row.thcCents / 100).toString());
  const [storage, setStorage] = useState((row.storageBp / 100).toString());
  const [liberation, setLiberation] = useState((row.liberationCents / 100).toString());
  const save = trpc.parametros.ports.save.useMutation({
    onSuccess: () => { toast.success("Porto atualizado"); onSaved(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  function submit() {
    save.mutate({
      portCode: row.portCode, portName: row.portName, stateCode: row.stateCode, modal: row.modal,
      thcCents: Math.round(Number(thc.replace(",", ".")) * 100),
      storageBp: Math.round(Number(storage.replace(",", ".")) * 100),
      liberationCents: Math.round(Number(liberation.replace(",", ".")) * 100),
      otherCents: row.otherCents ?? 0,
      effectiveDate: new Date(),
      isActive: true,
    });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row.portName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="THC (R$)"><Input value={thc} onChange={(e) => setThc(e.target.value)} /></Field>
          <Field label="Armazenagem (% do CIF)"><Input value={storage} onChange={(e) => setStorage(e.target.value)} /></Field>
          <Field label="Liberação (R$)"><Input value={liberation} onChange={(e) => setLiberation(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * EX-TARIFÁRIO
 * ============================================================ */
function ExTarifarioTab() {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.parametros.exTarifario.list.useQuery();
  const [editing, setEditing] = useState<any | null | "new">(null);
  if (isLoading) return <Placeholder text="Carregando ex-tarifários…" />;

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 p-3">
        <p className="text-sm text-slate-500">Reduções/suspensões de II/IPI por NCM (Resolução GECEX).</p>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" /> Novo</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <tr><Th>NCM</Th><Th>Ex</Th><Th>II reduzido</Th><Th>IPI reduzido</Th><Th>Base legal</Th><Th>Status</Th><Th className="text-right">Ações</Th></tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-slate-100">
                <Td className="font-mono">{r.ncmCode}</Td>
                <Td>{r.exCode ?? "—"}</Td>
                <Td>{pctFromBp(r.reducedIiRate)}</Td>
                <Td>{pctFromBp(r.reducedIpiRate)}</Td>
                <Td className="max-w-[200px] truncate text-slate-500">{r.legalBasis ?? "—"}</Td>
                <Td>{r.isActive ? <Badge className="bg-teal-50 text-teal-700">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</Td>
                <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setEditing(r)}>Editar</Button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <ExDialog row={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={() => { utils.parametros.exTarifario.list.invalidate(); setEditing(null); }} />
      )}
    </Card>
  );
}

function ExDialog({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const [ncmCode, setNcm] = useState(row?.ncmCode ?? "");
  const [exCode, setExCode] = useState(row?.exCode ?? "");
  const [ii, setIi] = useState(row?.reducedIiRate != null ? (row.reducedIiRate / 100).toString() : "0");
  const [ipi, setIpi] = useState(row?.reducedIpiRate != null ? (row.reducedIpiRate / 100).toString() : "");
  const [legalBasis, setLegalBasis] = useState(row?.legalBasis ?? "");
  const [isActive, setIsActive] = useState<boolean>(row?.isActive ?? true);
  const save = trpc.parametros.exTarifario.save.useMutation({
    onSuccess: () => { toast.success("Ex-tarifário salvo"); onSaved(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  function submit() {
    if (!ncmCode.trim()) { toast.error("Informe o NCM"); return; }
    save.mutate({
      ncmCode: ncmCode.trim(), exCode: exCode || null,
      reducedIiRate: ii === "" ? null : Math.round(Number(ii.replace(",", ".")) * 100),
      reducedIpiRate: ipi === "" ? null : Math.round(Number(ipi.replace(",", ".")) * 100),
      legalBasis: legalBasis || null, isActive,
    });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "Editar ex-tarifário" : "Novo ex-tarifário"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="NCM"><Input value={ncmCode} onChange={(e) => setNcm(e.target.value)} placeholder="8479.89.99" /></Field>
            <Field label="Nº do Ex"><Input value={exCode} onChange={(e) => setExCode(e.target.value)} placeholder="Ex 001" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="II reduzido (%)"><Input value={ii} onChange={(e) => setIi(e.target.value)} /></Field>
            <Field label="IPI reduzido (%) — opcional"><Input value={ipi} onChange={(e) => setIpi(e.target.value)} /></Field>
          </div>
          <Field label="Base legal"><Input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} placeholder="Resolução GECEX nº ..." /></Field>
          <label className="flex items-center gap-2 text-sm"><Switch checked={isActive} onCheckedChange={setIsActive} /> Ativo (aplica no cálculo)</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * BENEFÍCIOS
 * ============================================================ */
const BENEFIT_TYPES = [
  "ii_reduction", "ii_exemption", "ipi_reduction", "ipi_exemption",
  "icms_reduction", "icms_credit", "icms_deferral", "pis_cofins_suspension",
  "drawback", "recof",
] as const;
const BENEFIT_LABEL: Record<string, string> = {
  ii_reduction: "Redução II", ii_exemption: "Isenção II", ipi_reduction: "Redução IPI",
  ipi_exemption: "Isenção IPI", icms_reduction: "Redução ICMS", icms_credit: "Crédito ICMS",
  icms_deferral: "Diferimento ICMS", pis_cofins_suspension: "Suspensão PIS/COFINS",
  drawback: "Drawback", recof: "RECOF",
};

function BeneficiosTab() {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.parametros.benefits.list.useQuery();
  const [editing, setEditing] = useState<any | null | "new">(null);
  if (isLoading) return <Placeholder text="Carregando benefícios…" />;

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 p-3">
        <p className="text-sm text-slate-500">Benefícios nacionais e de bloco (Mercosul/ALADI), drawback, RECOF, etc.</p>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" /> Novo</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <tr><Th>Benefício</Th><Th>Tipo</Th><Th>Escopo</Th><Th>Base legal</Th><Th>Status</Th><Th className="text-right">Ações</Th></tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-slate-100">
                <Td className="font-medium text-slate-800">{r.name}{r.code && <div className="font-mono text-[11px] text-slate-400">{r.code}</div>}</Td>
                <Td><Badge variant="secondary">{BENEFIT_LABEL[r.benefitType] ?? r.benefitType}</Badge></Td>
                <Td className="text-slate-500">{r.stateCode ?? "Federal"}{r.ncmPattern ? ` · ${r.ncmPattern}` : ""}</Td>
                <Td className="max-w-[200px] truncate text-slate-500">{r.legalBasis ?? "—"}</Td>
                <Td>{r.isActive ? <Badge className="bg-teal-50 text-teal-700">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</Td>
                <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setEditing(r)}>Editar</Button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <BeneficioDialog row={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={() => { utils.parametros.benefits.list.invalidate(); setEditing(null); }} />
      )}
    </Card>
  );
}

function BeneficioDialog({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(row?.name ?? "");
  const [code, setCode] = useState(row?.code ?? "");
  const [benefitType, setBenefitType] = useState<string>(row?.benefitType ?? "ii_reduction");
  const [stateCode, setStateCode] = useState(row?.stateCode ?? "");
  const [legalBasis, setLegalBasis] = useState(row?.legalBasis ?? "");
  const [requirements, setRequirements] = useState(row?.requirements ?? "");
  const [isActive, setIsActive] = useState<boolean>(row?.isActive ?? true);
  const save = trpc.parametros.benefits.save.useMutation({
    onSuccess: () => { toast.success("Benefício salvo"); onSaved(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  function submit() {
    if (!name.trim()) { toast.error("Informe o nome"); return; }
    save.mutate({
      id: row?.id, name: name.trim(), code: code || null,
      benefitType: benefitType as any,
      stateCode: stateCode ? stateCode.toUpperCase().slice(0, 2) : null,
      legalBasis: legalBasis || null, requirements: requirements || null, isActive,
    });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "Editar benefício" : "Novo benefício"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MERCOSUL" /></Field>
            <Field label="UF (vazio = federal)"><Input value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="SC" maxLength={2} /></Field>
          </div>
          <Field label="Tipo">
            <select value={benefitType} onChange={(e) => setBenefitType(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              {BENEFIT_TYPES.map((t) => <option key={t} value={t}>{BENEFIT_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Requisitos"><Input value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="ex: Certificado de Origem" /></Field>
          <Field label="Base legal"><Input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><Switch checked={isActive} onCheckedChange={setIsActive} /> Ativo</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- primitivos visuais ---------- */
function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white">{children}</div>;
}
function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
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
