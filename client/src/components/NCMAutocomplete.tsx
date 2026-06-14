import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Search, 
  Sparkles, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2,
  Loader2,
  Info
} from "lucide-react";

interface NCMAutocompleteProps {
  value: string;
  onChange: (ncmCode: string) => void;
  productName?: string;
  productDescription?: string;
  placeholder?: string;
  disabled?: boolean;
}

interface NCMSuggestion {
  ncmCode: string;
  description: string;
  iiRate: number;
  ipiRate?: number;
  pisRate?: number;
  cofinsRate?: number;
  confidence?: number;
  reason?: string;
  taxSavingsPotential?: number;
  alternativeClassification?: string;
}

export function NCMAutocomplete({
  value,
  onChange,
  productName,
  productDescription,
  placeholder = "Digite o código NCM ou busque por descrição",
  disabled = false,
}: NCMAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAISuggestion, setShowAISuggestion] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search NCMs by code or description
  const { data: searchResults, isLoading: isSearching } = trpc.ncm.search.useQuery(
    { query: searchQuery, limit: 15 },
    { enabled: searchQuery.length >= 2 }
  );

  // Get AI suggestion when product name is provided
  const { 
    data: aiSuggestion, 
    isLoading: isLoadingAI,
    refetch: refetchAI 
  } = trpc.ncm.suggestWithAI.useQuery(
    { productName: productName || "", productDescription },
    { enabled: false } // Manual trigger
  );

  // Handle AI suggestion request
  const handleRequestAISuggestion = async () => {
    if (!productName || productName.length < 3) {
      toast.error("Digite o nome do produto primeiro (mínimo 3 caracteres)");
      return;
    }
    setShowAISuggestion(true);
    refetchAI();
  };

  // Select NCM from search results
  const handleSelectNCM = (ncmCode: string) => {
    onChange(ncmCode);
    setOpen(false);
    setSearchQuery("");
  };

  // Format rate for display
  const formatRate = (rate: number) => `${(rate / 100).toFixed(2)}%`;

  // Get risk level color
  const getRiskColor = (level: string) => {
    switch (level) {
      case "low": return "text-green-600 bg-green-100";
      case "medium": return "text-yellow-600 bg-yellow-100";
      case "high": return "text-red-600 bg-red-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={value}
                onChange={(e) => {
                  onChange(e.target.value);
                  setSearchQuery(e.target.value);
                  if (e.target.value.length >= 2) {
                    setOpen(true);
                  }
                }}
                onFocus={() => {
                  if (searchQuery.length >= 2 || value.length >= 2) {
                    setOpen(true);
                  }
                }}
                placeholder={placeholder}
                disabled={disabled}
                className="pr-10"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleRequestAISuggestion}
              disabled={!productName || productName.length < 3 || isLoadingAI}
              title="Sugestão inteligente de NCM pela Excambia"
            >
              {isLoadingAI ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 text-purple-500" />
              )}
            </Button>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[500px] p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Buscar NCM por código ou descrição..." 
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {isSearching ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <CommandGroup heading="Resultados da busca">
                  {searchResults.map((ncm: any) => (
                    <CommandItem
                      key={ncm.ncmCode}
                      value={ncm.ncmCode}
                      onSelect={() => handleSelectNCM(ncm.ncmCode)}
                      className="flex flex-col items-start gap-1 py-3"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span className="font-mono font-semibold">{ncm.ncmCode}</span>
                        <Badge variant="outline" className="text-xs">
                          II: {formatRate(ncm.iiRate)}
                        </Badge>
                        {ncm.ipiRate > 0 && (
                          <Badge variant="outline" className="text-xs">
                            IPI: {formatRate(ncm.ipiRate)}
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground line-clamp-2">
                        {ncm.description}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : searchQuery.length >= 2 ? (
                <CommandEmpty>
                  <div className="text-center py-6">
                    <p className="text-muted-foreground">Nenhum NCM encontrado</p>
                    <Button
                      variant="link"
                      className="mt-2 text-purple-600"
                      onClick={handleRequestAISuggestion}
                      disabled={!productName}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Pedir sugestão à Excambia
                    </Button>
                  </div>
                </CommandEmpty>
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  Digite pelo menos 2 caracteres para buscar
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* AI Suggestion Dialog */}
      <Dialog open={showAISuggestion} onOpenChange={setShowAISuggestion}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Sugestão Inteligente de NCM
            </DialogTitle>
            <DialogDescription>
              Análise de classificação fiscal para: <strong>{productName}</strong>
            </DialogDescription>
          </DialogHeader>

          {isLoadingAI ? (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              </div>
              <p className="text-center text-muted-foreground">
                Excambia está analisando a melhor classificação fiscal...
              </p>
            </div>
          ) : aiSuggestion ? (
            <div className="space-y-6">
              {/* Main Suggestion */}
              <div className="border rounded-lg p-4 bg-purple-50/50">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-lg">NCM Recomendado</h4>
                    <p className="text-sm text-muted-foreground">
                      Confiança: {aiSuggestion.suggestedNCM.confidence}%
                    </p>
                  </div>
                  <Badge className={getRiskColor(aiSuggestion.riskLevel)}>
                    Risco {aiSuggestion.riskLevel === "low" ? "Baixo" : aiSuggestion.riskLevel === "medium" ? "Médio" : "Alto"}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-xl font-bold text-purple-700">
                    {aiSuggestion.suggestedNCM.ncmCode}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      handleSelectNCM(aiSuggestion.suggestedNCM.ncmCode);
                      setShowAISuggestion(false);
                    }}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Usar este NCM
                  </Button>
                </div>

                <p className="text-sm mb-3">{aiSuggestion.suggestedNCM.description}</p>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">II: {formatRate(aiSuggestion.suggestedNCM.iiRate)}</Badge>
                  <Badge variant="outline">IPI: {formatRate(aiSuggestion.suggestedNCM.ipiRate || 0)}</Badge>
                  <Badge variant="outline">PIS: {formatRate(aiSuggestion.suggestedNCM.pisRate || 211)}</Badge>
                  <Badge variant="outline">COFINS: {formatRate(aiSuggestion.suggestedNCM.cofinsRate || 972)}</Badge>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  <Info className="inline h-4 w-4 mr-1" />
                  {aiSuggestion.suggestedNCM.reason}
                </p>
              </div>

              {/* Alternative Classifications */}
              {aiSuggestion.alternatives && aiSuggestion.alternatives.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-green-600" />
                    Classificações Alternativas (Otimização Tributária)
                  </h4>
                  <div className="space-y-3">
                    {aiSuggestion.alternatives.map((alt: NCMSuggestion, index: number) => (
                      <div 
                        key={index} 
                        className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-semibold">{alt.ncmCode}</span>
                              {alt.taxSavingsPotential && alt.taxSavingsPotential > 0 && (
                                <Badge variant="secondary" className="bg-green-100 text-green-700">
                                  Economia: {formatRate(alt.taxSavingsPotential)}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              {alt.description}
                            </p>
                            {alt.alternativeClassification && (
                              <p className="text-xs text-purple-600">
                                Classificar como: "{alt.alternativeClassification}"
                              </p>
                            )}
                            <div className="flex gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                II: {formatRate(alt.iiRate)}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              handleSelectNCM(alt.ncmCode);
                              setShowAISuggestion(false);
                            }}
                          >
                            Usar
                          </Button>
                        </div>
                        {alt.reason && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {alt.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optimization Tips */}
              {aiSuggestion.optimizationTips && aiSuggestion.optimizationTips.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold mb-2 flex items-center gap-2 text-yellow-800">
                    <AlertTriangle className="h-4 w-4" />
                    Dicas de Otimização
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-yellow-900">
                    {aiSuggestion.optimizationTips.map((tip: string, index: number) => (
                      <li key={index}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Legal Basis */}
              {aiSuggestion.legalBasis && aiSuggestion.legalBasis.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <h4 className="font-medium mb-1">Base Legal:</h4>
                  <ul className="list-disc list-inside">
                    {aiSuggestion.legalBasis.map((basis: string, index: number) => (
                      <li key={index}>{basis}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <p>Não foi possível obter sugestão. Tente novamente.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
