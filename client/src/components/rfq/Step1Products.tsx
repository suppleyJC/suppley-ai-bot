/**
 * RFQ Step 1 - Produtos
 * Formulário de seleção de produtos com sugestão automática de NCM
 */
import { UseFormReturn, UseFieldArrayReturn } from "react-hook-form";
import { Package, Plus, Trash2, Sparkles } from "lucide-react";
import { RfqFormData, UNITS } from "./constants";

interface Step1ProductsProps {
  form: UseFormReturn<RfqFormData, any, RfqFormData>;
  fields: UseFieldArrayReturn<RfqFormData, "items">["fields"];
  append: UseFieldArrayReturn<RfqFormData, "items">["append"];
  remove: UseFieldArrayReturn<RfqFormData, "items">["remove"];
  watchItems: RfqFormData["items"];
  onProductNameChange: (index: number, name: string) => void;
}

export function Step1Products({
  form,
  fields,
  append,
  remove,
  watchItems,
  onProductNameChange,
}: Step1ProductsProps) {
  return (
    <div className="space-y-6">
      {/* Título da RFQ */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
        <label className="block text-sm font-medium text-muted-foreground/60 mb-2">
          Título da Cotação
        </label>
        <input
          {...form.register("title")}
          placeholder="Ex: Pregos 17x27 para revenda em SC"
          className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
        />
        {form.formState.errors.title && (
          <p className="text-red-400 text-sm mt-1">{form.formState.errors.title.message}</p>
        )}
      </div>

      {/* Finalidade */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
        <label className="block text-sm font-medium text-muted-foreground/60 mb-3">
          Finalidade da Importação
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { value: "resale", label: "Revenda", icon: "🏪" },
            { value: "own_use", label: "Uso Próprio", icon: "🏭" },
            { value: "industrialization", label: "Industrialização", icon: "⚙️" },
            { value: "temporary", label: "Admissão Temporária", icon: "⏱️" },
          ].map(option => (
            <label
              key={option.value}
              className={`
                flex flex-col items-center p-4 rounded-xl border cursor-pointer transition-all
                ${form.watch("importPurpose") === option.value
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900/30 hover:border-slate-600"
                }
              `}
            >
              <input
                type="radio"
                value={option.value}
                {...form.register("importPurpose")}
                className="sr-only"
              />
              <span className="text-2xl mb-2">{option.icon}</span>
              <span className="text-sm text-muted-foreground/60">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Itens/Produtos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-400" />
            Produtos
          </h3>
          <button
            type="button"
            onClick={() => append({ productName: "", quantity: 1, unit: "UN", sampleRequired: false })}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 hover:bg-emerald-500/20 transition-all text-sm"
          >
            <Plus className="w-4 h-4" /> Adicionar Produto
          </button>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-emerald-400">Produto {index + 1}</span>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome do Produto */}
              <div className="md:col-span-2">
                <label className="block text-xs text-muted-foreground mb-1">Nome do Produto *</label>
                <div className="relative">
                  <input
                    {...form.register(`items.${index}.productName`)}
                    onChange={(e) => onProductNameChange(index, e.target.value)}
                    placeholder="Ex: Prego 17x27 cabeça chata"
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                  {watchItems[index]?.ncmSuggested && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span className="text-xs text-amber-400">
                        NCM: {watchItems[index].ncmSuggested}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* NCM */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  NCM
                  {watchItems[index]?.ncmConfidence && (
                    <span className="ml-2 text-emerald-400">
                      ({watchItems[index].ncmConfidence}% confiança)
                    </span>
                  )}
                </label>
                <input
                  {...form.register(`items.${index}.ncmCode`)}
                  placeholder="0000.00.00"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
                />
              </div>

              {/* Quantidade + Unidade */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-muted-foreground mb-1">Quantidade *</label>
                  <input
                    type="number"
                    {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                    placeholder="10000"
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs text-muted-foreground mb-1">Unidade</label>
                  <select
                    {...form.register(`items.${index}.unit`)}
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-3 py-3 text-white focus:border-emerald-500 transition-all"
                  >
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Descrição */}
              <div className="md:col-span-2">
                <label className="block text-xs text-muted-foreground mb-1">Descrição / Especificações</label>
                <textarea
                  {...form.register(`items.${index}.description`)}
                  placeholder="Material, dimensões, acabamento, norma técnica..."
                  rows={2}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all resize-none"
                />
              </div>

              {/* Preço alvo */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Preço Alvo (USD/un)</label>
                <input
                  type="number"
                  step="0.01"
                  {...form.register(`items.${index}.targetUnitPriceCents`, { valueAsNumber: true })}
                  placeholder="0.00"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
                />
              </div>

              {/* Peso */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Peso por unidade (kg)</label>
                <input
                  type="number"
                  step="0.001"
                  {...form.register(`items.${index}.weightKgPerUnit`, { valueAsNumber: true })}
                  placeholder="0.000"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
                />
              </div>

              {/* Amostra */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    {...form.register(`items.${index}.sampleRequired`)}
                    className="w-5 h-5 rounded border-slate-600 bg-slate-900/50 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-muted-foreground/60">Solicitar amostra antes do pedido</span>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
