/**
 * RFQ Step 4 - Revisão
 * Resumo da solicitação e confirmação de envio
 */
import { UseFormReturn } from "react-hook-form";
import { Sparkles } from "lucide-react";
import { RfqFormData } from "./constants";

interface Step4ReviewProps {
  form: UseFormReturn<RfqFormData, any, RfqFormData>;
  watchItems: RfqFormData["items"];
}

export function Step4Review({ form, watchItems }: Step4ReviewProps) {
  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 rounded-2xl border border-emerald-500/30 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-6 h-6 text-emerald-400" />
          <h3 className="text-lg font-semibold text-white">Resumo da Solicitação</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900/50 rounded-xl p-4">
            <span className="text-xs text-muted-foreground">Produtos</span>
            <p className="text-2xl font-bold text-white">{watchItems.length}</p>
          </div>
          <div className="bg-slate-900/50 rounded-xl p-4">
            <span className="text-xs text-muted-foreground">Destino</span>
            <p className="text-2xl font-bold text-white">{form.watch("destinationState")}</p>
          </div>
          <div className="bg-slate-900/50 rounded-xl p-4">
            <span className="text-xs text-muted-foreground">Incoterm</span>
            <p className="text-2xl font-bold text-white">{form.watch("preferredIncoterm")}</p>
          </div>
          <div className="bg-slate-900/50 rounded-xl p-4">
            <span className="text-xs text-muted-foreground">Urgência</span>
            <p className="text-2xl font-bold text-white capitalize">{form.watch("urgency")}</p>
          </div>
        </div>

        {/* Lista de produtos */}
        <div className="space-y-3">
          {watchItems.map((item, i) => (
            <div key={i} className="bg-slate-900/50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{item.productName || "Produto sem nome"}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity?.toLocaleString()} {item.unit}
                  {item.ncmCode && ` · NCM: ${item.ncmCode}`}
                </p>
              </div>
              {item.ncmSuggested && (
                <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-400/10 px-3 py-1 rounded-full">
                  <Sparkles className="w-3 h-3" /> NCM sugerido
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* O que a Excambia vai fazer */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
        <h3 className="text-sm font-medium text-muted-foreground/60 mb-4">O que a Excambia vai fazer:</h3>
        <div className="space-y-3">
          {[
            "Confirmar classificação NCM dos produtos",
            "Buscar fornecedores qualificados nos países selecionados",
            "Gerar e enviar solicitações de cotação em inglês e chinês",
            "Analisar respostas e comparar preços",
            "Calcular custo nacionalizado completo (impostos + frete + operacional)",
            "Otimizar porto e estado para menor custo tributário",
            "Projetar impacto da reforma tributária (2026-2033)",
            "Gerar cotação consolidada com veredicto GO/NO-GO",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs text-emerald-400 font-bold">{i + 1}</span>
              </div>
              <span className="text-sm text-muted-foreground/60">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
