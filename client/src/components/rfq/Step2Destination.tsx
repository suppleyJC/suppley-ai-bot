/**
 * RFQ Step 2 - Destino & Logística
 * Seleção de países, incoterm, estado, porto, urgência e orçamento
 */
import { UseFormReturn } from "react-hook-form";
import { Globe, Ship, MapPin, Clock, DollarSign } from "lucide-react";
import { RfqFormData, COUNTRIES, STATES, PORTS } from "./constants";

interface Step2DestinationProps {
  form: UseFormReturn<RfqFormData, any, RfqFormData>;
  selectedCountries: string[];
  setSelectedCountries: (countries: string[]) => void;
}

export function Step2Destination({
  form,
  selectedCountries,
  setSelectedCountries,
}: Step2DestinationProps) {
  return (
    <div className="space-y-6">
      {/* Países de origem */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
        <label className="block text-sm font-medium text-slate-300 mb-3">
          <Globe className="w-4 h-4 inline mr-2 text-emerald-400" />
          Países de Origem Preferidos
        </label>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {COUNTRIES.map(country => (
            <label
              key={country.code}
              className={`
                flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all text-sm
                ${selectedCountries.includes(country.code)
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900/30 hover:border-slate-600"
                }
              `}
            >
              <input
                type="checkbox"
                checked={selectedCountries.includes(country.code)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedCountries([...selectedCountries, country.code]);
                  } else {
                    setSelectedCountries(selectedCountries.filter(c => c !== country.code));
                  }
                }}
                className="sr-only"
              />
              <span>{country.flag}</span>
              <span className="text-slate-300">{country.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Incoterm */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
        <label className="block text-sm font-medium text-slate-300 mb-3">
          <Ship className="w-4 h-4 inline mr-2 text-emerald-400" />
          Incoterm Preferido
        </label>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {["EXW", "FOB", "CFR", "CIF", "DAP", "DDP"].map(term => (
            <label
              key={term}
              className={`
                flex flex-col items-center p-3 rounded-xl border cursor-pointer transition-all
                ${form.watch("preferredIncoterm") === term
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900/30 hover:border-slate-600"
                }
              `}
            >
              <input
                type="radio"
                value={term}
                {...form.register("preferredIncoterm")}
                className="sr-only"
              />
              <span className="text-white font-bold">{term}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Estado + Porto */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            <MapPin className="w-4 h-4 inline mr-2 text-emerald-400" />
            Estado de Destino
          </label>
          <select
            {...form.register("destinationState")}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-all"
          >
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <p className="text-xs text-slate-500 mt-2">
            A Excambia vai calcular o melhor porto automaticamente
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            <Ship className="w-4 h-4 inline mr-2 text-emerald-400" />
            Porto Preferido (opcional)
          </label>
          <select
            {...form.register("destinationPort")}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-all"
          >
            <option value="">Excambia vai otimizar automaticamente</option>
            {PORTS.map(p => <option key={p.name} value={p.name}>{p.name} ({p.state})</option>)}
          </select>
        </div>
      </div>

      {/* Urgência */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
        <label className="block text-sm font-medium text-slate-300 mb-3">
          <Clock className="w-4 h-4 inline mr-2 text-emerald-400" />
          Urgência
        </label>
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: "standard", label: "Padrão", desc: "60-90 dias", color: "emerald" },
            { value: "fast", label: "Rápido", desc: "30-45 dias", color: "amber" },
            { value: "urgent", label: "Urgente", desc: "ASAP", color: "red" },
          ].map(option => (
            <label
              key={option.value}
              className={`
                flex flex-col items-center p-4 rounded-xl border cursor-pointer transition-all
                ${form.watch("urgency") === option.value
                  ? `border-${option.color}-500 bg-${option.color}-500/10`
                  : "border-slate-700 bg-slate-900/30 hover:border-slate-600"
                }
              `}
            >
              <input
                type="radio"
                value={option.value}
                {...form.register("urgency")}
                className="sr-only"
              />
              <span className="text-white font-semibold">{option.label}</span>
              <span className="text-xs text-slate-400 mt-1">{option.desc}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Orçamento */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          <DollarSign className="w-4 h-4 inline mr-2 text-emerald-400" />
          Orçamento Máximo (opcional)
        </label>
        <div className="flex gap-3">
          <select
            {...form.register("currency")}
            className="w-24 bg-slate-900/50 border border-slate-600 rounded-xl px-3 py-3 text-white focus:border-emerald-500 transition-all"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="BRL">BRL</option>
            <option value="CNY">CNY</option>
          </select>
          <input
            type="number"
            {...form.register("budgetMaxCents", { valueAsNumber: true })}
            placeholder="Valor máximo total"
            className="flex-1 bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
          />
        </div>
      </div>
    </div>
  );
}
