import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Trash2,
  AlertCircle,
  FileSearch,
  Sparkles,
  Wand2,
  Loader2,
} from "lucide-react";
import { ProductItem, UNITS, formatCurrency, generateId } from "./types";

interface ProductListProps {
  products: ProductItem[];
  setProducts: React.Dispatch<React.SetStateAction<ProductItem[]>>;
  currency: string;
  taxRegime: string;
  simplesFaixa: number;
  onTaxRegimeChange: (regime: string) => void;
  onSimplesFaixaChange: (faixa: number) => void;
  hasResults: boolean;
  onRecalculate: () => void;
  isCalculating: boolean;
}

export function ProductList({
  products,
  setProducts,
  currency,
  taxRegime,
  simplesFaixa,
  onTaxRegimeChange,
  onSimplesFaixaChange,
  hasResults,
  onRecalculate,
  isCalculating,
}: ProductListProps) {
  const [suggestingNcmFor, setSuggestingNcmFor] = useState<string | null>(null);
  const trpcUtils = trpc.useUtils();

  const totalFob = products.reduce((sum, p) => sum + p.totalPrice, 0);

  const addProduct = () => {
    const newProduct: ProductItem = {
      id: generateId(),
      productName: "",
      ncmCode: "",
      ncmConfirmed: false,
      quantity: 1,
      unit: "UN",
      unitPrice: 0,
      totalPrice: 0,
      extractedFromPdf: false,
    };
    setProducts([...products, newProduct]);
  };

  const updateProduct = (id: string, updates: Partial<ProductItem>) => {
    setProducts(products.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, ...updates };
      if (updates.quantity !== undefined || updates.unitPrice !== undefined) {
        updated.totalPrice = updated.quantity * updated.unitPrice;
      }
      return updated;
    }));
  };

  const removeProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  const suggestNcmForProduct = async (productId: string, productName: string) => {
    if (!productName || productName.length < 2) {
      toast.error("Nome do produto muito curto para sugerir NCM");
      return;
    }
    setSuggestingNcmFor(productId);
    toast.info(`Excambia analisando: "${productName}"...`);
    try {
      const result = await trpcUtils.ncm.suggestWithAI.fetch({
        productName,
        productDescription: ""
      });
      if (result?.suggestedNCM?.ncmCode) {
        const ncmCode = result.suggestedNCM.ncmCode;
        const confidence = result.suggestedNCM.confidence || 0;
        const description = result.suggestedNCM.description || '';
        updateProduct(productId, {
          ncmCode: ncmCode.replace(/\D/g, "").slice(0, 8),
          ncmConfirmed: true
        });
        toast.success(
          `NCM sugerido: ${ncmCode} (${confidence}% confiança)\n${description.substring(0, 50)}...`,
          { duration: 5000 }
        );
        if (result.alternatives && result.alternatives.length > 0) {
          const bestAlt = result.alternatives.find((a: any) => a.taxSavingsPotential && a.taxSavingsPotential > 0);
          if (bestAlt && bestAlt.taxSavingsPotential) {
            toast.info(
              `Dica de otimização: NCM ${bestAlt.ncmCode} pode economizar ${(bestAlt.taxSavingsPotential / 100).toFixed(2)}% em impostos`,
              { duration: 8000 }
            );
          }
        }
      } else {
        toast.warning("Não foi possível sugerir uma NCM. Preencha manualmente.");
      }
    } catch (error) {
      console.error('Erro ao sugerir NCM:', error);
      toast.error("Erro ao obter sugestão de NCM. Tente novamente.");
    } finally {
      setSuggestingNcmFor(null);
    }
  };

  const suggestNcmForAllPending = async () => {
    const pendingProducts = products.filter(p => !p.ncmCode || p.ncmCode === "00000000");
    if (pendingProducts.length === 0) {
      toast.info("Todos os produtos já possuem NCM");
      return;
    }
    toast.info(`Analisando ${pendingProducts.length} produto(s) com NCM pendente...`);
    for (const product of pendingProducts) {
      await suggestNcmForProduct(product.id, product.productName);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    toast.success("Análise de NCMs concluída!");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                Produtos da Cotação
              </CardTitle>
              <CardDescription>
                {products.length > 0
                  ? `${products.length} produto(s) • Total FOB: ${formatCurrency(totalFob, currency)}`
                  : "Adicione produtos manualmente ou importe do PDF"
                }
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {products.some(p => !p.ncmCode || p.ncmCode === "00000000") && (
                <Button
                  onClick={suggestNcmForAllPending}
                  variant="outline"
                  size="sm"
                  className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                  disabled={suggestingNcmFor !== null}
                >
                  {suggestingNcmFor ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Sugerir NCMs
                </Button>
              )}
              <Button onClick={addProduct} variant="outline" size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Produto
              </Button>
            </div>
          </div>

          {/* Tax Regime Selector */}
          {products.length > 0 && (
            <div className="p-4 bg-gradient-to-r from-purple-50 to-turquesa-50 dark:from-purple-950/30 dark:to-turquesa-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-sm font-medium text-purple-700 dark:text-purple-300">Regime Tributário (aplicar a todos)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Selecione o regime para calcular impostos sobre venda</p>
                </div>
                <Select
                  value={taxRegime || "lucro_presumido"}
                  onValueChange={onTaxRegimeChange}
                >
                  <SelectTrigger className="w-[220px] bg-card dark:bg-gray-900">
                    <SelectValue placeholder="Selecione o regime" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                    <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                    <SelectItem value="lucro_real">Lucro Real</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {taxRegime === 'simples_nacional' && (
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
                  <div className="flex-1">
                    <Label className="text-sm font-medium text-orange-700 dark:text-orange-300">Faixa do Simples Nacional</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Selecione a faixa conforme faturamento anual</p>
                  </div>
                  <Select
                    value={String(simplesFaixa || 1)}
                    onValueChange={(v) => onSimplesFaixaChange(parseInt(v))}
                  >
                    <SelectTrigger className="w-[280px] bg-card dark:bg-gray-900">
                      <SelectValue placeholder="Selecione a faixa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1ª Faixa - Até R$ 180 mil (4%)</SelectItem>
                      <SelectItem value="2">2ª Faixa - Até R$ 360 mil (7,3%)</SelectItem>
                      <SelectItem value="3">3ª Faixa - Até R$ 720 mil (9,5%)</SelectItem>
                      <SelectItem value="4">4ª Faixa - Até R$ 1,8 mi (10,7%)</SelectItem>
                      <SelectItem value="5">5ª Faixa - Até R$ 3,6 mi (14,3%)</SelectItem>
                      <SelectItem value="6">6ª Faixa - Até R$ 4,8 mi (19%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {hasResults && (
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
                  <div className="flex-1">
                    <p className="text-sm text-green-700 dark:text-green-300 font-medium">Regime alterado? Recalcule para atualizar os valores</p>
                  </div>
                  <Button
                    variant="outline"
                    className="gap-2 border-green-500 text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                    onClick={onRecalculate}
                    disabled={isCalculating}
                  >
                    {isCalculating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Package className="h-4 w-4" />
                    )}
                    Recalcular
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum produto adicionado</p>
            <p className="text-sm">Importe um PDF ou adicione manualmente</p>
          </div>
        ) : (
          <div className="space-y-4">
            {products.map((product, index) => (
              <div
                key={product.id}
                className={`p-4 rounded-lg border ${!product.ncmCode ? 'border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20' : 'border-border'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                      {product.extractedFromPdf && (
                        <Badge variant="secondary" className="text-xs">
                          <FileSearch className="h-3 w-3 mr-1" />
                          Extraído do PDF
                        </Badge>
                      )}
                      {!product.ncmCode && (
                        <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          NCM Pendente
                        </Badge>
                      )}
                    </div>

                    {/* Row 1: Product identification */}
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="sm:col-span-2 space-y-2">
                        <Label className="text-xs font-medium text-foreground">Nome do Produto *</Label>
                        <Input
                          value={product.productName}
                          onChange={(e) => updateProduct(product.id, { productName: e.target.value })}
                          placeholder="Nome do produto"
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-foreground">SKU / Código</Label>
                        <Input
                          value={product.sku || ""}
                          onChange={(e) => updateProduct(product.id, { sku: e.target.value })}
                          placeholder="Código interno"
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-foreground flex items-center gap-1">
                          NCM *
                          {!product.ncmCode && <AlertCircle className="h-3 w-3 text-yellow-500" />}
                        </Label>
                        <div className="flex gap-1">
                          <Input
                            value={product.ncmCode}
                            onChange={(e) => updateProduct(product.id, {
                              ncmCode: e.target.value.replace(/\D/g, "").slice(0, 8),
                              ncmConfirmed: true
                            })}
                            placeholder="00000000"
                            className={`h-10 flex-1 ${!product.ncmCode ? "border-yellow-500 bg-yellow-50/50" : ""}`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => suggestNcmForProduct(product.id, product.productName)}
                            disabled={suggestingNcmFor === product.id || !product.productName}
                            title="Excambia: Sugerir NCM automaticamente"
                          >
                            {suggestingNcmFor === product.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 text-purple-500" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Quantities and Prices */}
                    <div className="grid grid-cols-5 gap-2 pt-4">
                      <div className="space-y-1">
                        <Label className="text-[9px] font-semibold text-muted-foreground uppercase">QTD *</Label>
                        <Input
                          type="number"
                          min="1"
                          value={product.quantity}
                          onChange={(e) => updateProduct(product.id, { quantity: parseInt(e.target.value) || 1 })}
                          className="h-9 text-sm w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] font-semibold text-muted-foreground uppercase">UNID</Label>
                        <Select
                          value={product.unit}
                          onValueChange={(v) => updateProduct(product.id, { unit: v })}
                        >
                          <SelectTrigger className="h-9 text-sm w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNITS.map((u) => (
                              <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] font-semibold text-muted-foreground uppercase">P.UNIT</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={product.unitPrice}
                          onChange={(e) => updateProduct(product.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                          className="h-9 text-sm w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] font-semibold text-muted-foreground uppercase">TOTAL</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={product.totalPrice}
                          onChange={(e) => updateProduct(product.id, {
                            totalPrice: parseFloat(e.target.value) || 0,
                            unitPrice: product.quantity > 0 ? (parseFloat(e.target.value) || 0) / product.quantity : 0
                          })}
                          className="h-9 text-sm w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] font-semibold text-purple-600 uppercase">ALVO</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Preço"
                          value={product.targetPrice || ""}
                          onChange={(e) => updateProduct(product.id, { targetPrice: parseFloat(e.target.value) || undefined })}
                          className="h-9 text-sm w-full border-purple-300 focus:border-purple-500 bg-purple-50/50"
                        />
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeProduct(product.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
