/**
 * RFQ Create - Formulário inteligente de solicitação de cotação
 * 
 * Interface wizard (passo a passo) para criar uma RFQ.
 * A Excambia sugere NCM automaticamente, gera mensagens para fornecedores,
 * e otimiza o cenário de importação.
 * 
 * Excambia - A primeira plataforma agêntica de comércio exterior
 */

import { useState, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  ChevronRight,
  ChevronLeft,
  FileText,
  CheckCircle,
  Send,
  Loader2,
} from "lucide-react";

import {
  rfqFormSchema,
  RfqFormData,
  STEPS,
} from "@/components/rfq/constants";
import { Step1Products } from "@/components/rfq/Step1Products";
import { Step2Destination } from "@/components/rfq/Step2Destination";
import { Step3Client } from "@/components/rfq/Step3Client";
import { Step4Review } from "@/components/rfq/Step4Review";

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function RfqCreate() {
  const [, setLocation] = useLocation();
  const trpcUtils = trpc.useUtils();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["CN"]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RfqFormData, any, RfqFormData>({
    resolver: zodResolver(rfqFormSchema) as any,
    defaultValues: {
      title: "",
      importPurpose: "resale",
      requesterType: "self",
      items: [{ productName: "", quantity: 1, unit: "UN", sampleRequired: false }],
      preferredCountries: ["CN"],
      preferredIncoterm: "FOB",
      destinationState: "SC",
      urgency: "standard",
      currency: "USD",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchRequesterType = form.watch("requesterType");
  const watchItems = form.watch("items");

  // ---- NCM Auto-suggest via backend ----
  const handleProductNameChange = useCallback((index: number, name: string) => {
    form.setValue(`items.${index}.productName`, name);
    
    if (name.length > 3) {
      const timeout = setTimeout(async () => {
        try {
          const result = await trpcUtils.rfq.suggestNcm.fetch({
            productName: name,
            description: form.getValues(`items.${index}.description`) || undefined,
          });
          if (result && result.ncmCode) {
            form.setValue(`items.${index}.ncmSuggested`, result.ncmCode);
            form.setValue(`items.${index}.ncmConfidence`, result.confidence);
            if (!form.getValues(`items.${index}.ncmCode`)) {
              form.setValue(`items.${index}.ncmCode`, result.ncmCode);
            }
          }
        } catch (e) {
          // Silently fail - NCM suggestion is optional
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [form, trpcUtils]);

  // ---- NAVIGATION ----
  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  // ---- SUBMIT ----
  const createRfqMutation = trpc.rfq.create.useMutation({
    onSuccess: (result) => {
      toast.success(`RFQ ${result.rfqNumber} criada com sucesso!`);
      setLocation("/rfq");
    },
    onError: (error) => {
      toast.error(`Erro ao criar RFQ: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  const onSubmit = async (data: RfqFormData) => {
    setIsSubmitting(true);
    try {
      const payload = {
        title: data.title,
        importPurpose: data.importPurpose,
        requesterType: data.requesterType,
        clientInfo: data.requesterType === "client" ? {
          name: data.clientName || "",
          email: data.clientEmail || undefined,
          phone: data.clientPhone || undefined,
          company: data.clientCompany || undefined,
          cnpj: data.clientCnpj || undefined,
          state: data.clientState || undefined,
        } : undefined,
        items: data.items.map(item => ({
          productName: item.productName,
          productNameEn: item.productNameEn || undefined,
          description: item.description || undefined,
          ncmCode: item.ncmCode || undefined,
          qualityStandard: item.qualityStandard || undefined,
          quantity: item.quantity,
          unit: item.unit || "UN",
          targetUnitPriceCents: item.targetUnitPriceCents || undefined,
          weightKgPerUnit: item.weightKgPerUnit || undefined,
          certifications: undefined,
          sampleRequired: item.sampleRequired || false,
        })),
        preferences: {
          preferredCountries: selectedCountries.length > 0 ? selectedCountries : undefined,
          preferredIncoterm: (data.preferredIncoterm || "FOB") as any,
          destinationState: data.destinationState || "SC",
          destinationPort: data.destinationPort || undefined,
          urgency: data.urgency || "standard",
          budgetMaxCents: data.budgetMaxCents || undefined,
          currency: data.currency || "USD",
        },
        notes: data.notes || undefined,
      };
      createRfqMutation.mutate(payload);
    } catch (error: any) {
      toast.error(`Erro ao criar RFQ: ${error.message || "Erro desconhecido"}`);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Nova Solicitação de Cotação</h1>
              <p className="text-sm text-muted-foreground">A Excambia vai encontrar os melhores fornecedores e preços para você</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300
                    ${isActive ? "bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-lg shadow-emerald-500/25" : ""}
                    ${isCompleted ? "bg-emerald-500/20 border border-emerald-500/50" : ""}
                    ${!isActive && !isCompleted ? "bg-slate-800 border border-slate-700" : ""}
                  `}>
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <span className={`text-xs mt-2 font-medium ${isActive ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {step.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-4 mt-[-20px] ${isCompleted ? "bg-emerald-500/50" : "bg-slate-700"}`} />
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          {/* Step Content */}
          {currentStep === 1 && (
            <Step1Products
              form={form}
              fields={fields}
              append={append}
              remove={remove}
              watchItems={watchItems}
              onProductNameChange={handleProductNameChange}
            />
          )}

          {currentStep === 2 && (
            <Step2Destination
              form={form}
              selectedCountries={selectedCountries}
              setSelectedCountries={setSelectedCountries}
            />
          )}

          {currentStep === 3 && (
            <Step3Client
              form={form}
              watchRequesterType={watchRequesterType}
            />
          )}

          {currentStep === 4 && (
            <Step4Review
              form={form}
              watchItems={watchItems}
            />
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-2 px-6 py-3 bg-slate-800 border border-slate-700 rounded-xl text-muted-foreground/60 hover:bg-slate-700 transition-all"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            ) : (
              <div />
            )}
            {currentStep < STEPS.length ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-white font-semibold hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
              >
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-white font-semibold hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Enviar para Excambia
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
