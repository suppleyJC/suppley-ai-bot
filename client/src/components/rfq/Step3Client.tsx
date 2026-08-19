/**
 * RFQ Step 3 - Cliente
 * Seleção de tipo de solicitante e dados do cliente
 */
import { UseFormReturn } from "react-hook-form";
import { Building2, User } from "lucide-react";
import { RfqFormData, STATES } from "./constants";

interface Step3ClientProps {
  form: UseFormReturn<RfqFormData, any, RfqFormData>;
  watchRequesterType: string;
}

export function Step3Client({ form, watchRequesterType }: Step3ClientProps) {
  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
        <label className="block text-sm font-medium text-muted-foreground/60 mb-3">
          Quem está solicitando?
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className={`
            flex flex-col items-center p-6 rounded-xl border cursor-pointer transition-all
            ${watchRequesterType === "self"
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-slate-700 bg-slate-900/30 hover:border-slate-600"
            }
          `}>
            <input type="radio" value="self" {...form.register("requesterType")} className="sr-only" />
            <Building2 className="w-8 h-8 text-emerald-400 mb-2" />
            <span className="text-white font-semibold">Minha Empresa</span>
            <span className="text-xs text-muted-foreground mt-1">Importação própria</span>
          </label>
          <label className={`
            flex flex-col items-center p-6 rounded-xl border cursor-pointer transition-all
            ${watchRequesterType === "client"
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-slate-700 bg-slate-900/30 hover:border-slate-600"
            }
          `}>
            <input type="radio" value="client" {...form.register("requesterType")} className="sr-only" />
            <User className="w-8 h-8 text-cyan-400 mb-2" />
            <span className="text-white font-semibold">Para um Cliente</span>
            <span className="text-xs text-muted-foreground mt-1">Cotação para terceiro</span>
          </label>
        </div>
      </div>

      {watchRequesterType === "client" && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground/60">Dados do Cliente</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nome *</label>
              <input
                {...form.register("clientName")}
                placeholder="Nome do cliente"
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Empresa</label>
              <input
                {...form.register("clientCompany")}
                placeholder="Nome da empresa"
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Email</label>
              <input
                type="email"
                {...form.register("clientEmail")}
                placeholder="email@empresa.com"
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Telefone</label>
              <input
                {...form.register("clientPhone")}
                placeholder="(00) 00000-0000"
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">CNPJ</label>
              <input
                {...form.register("clientCnpj")}
                placeholder="00.000.000/0000-00"
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Estado (UF)</label>
              <select
                {...form.register("clientState")}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-all"
              >
                <option value="">Selecione</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Notas */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
        <label className="block text-sm font-medium text-muted-foreground/60 mb-2">
          Observações Adicionais
        </label>
        <textarea
          {...form.register("notes")}
          placeholder="Qualquer informação adicional relevante para a cotação..."
          rows={4}
          className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all resize-none"
        />
      </div>
    </div>
  );
}
