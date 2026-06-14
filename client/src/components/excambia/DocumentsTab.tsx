import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import {
  Loader2, Upload, FileText, Lightbulb, Globe, DollarSign,
} from "lucide-react";

interface DocumentsTabProps {
  uploadingFile: boolean;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onNavigateToChat: (message: string) => void;
}

export function DocumentsTab({ uploadingFile, onFileUpload, onNavigateToChat }: DocumentsTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <TabsContent value="documents" className="flex-1 overflow-auto m-0 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Análise de Documentos</h2>
            <p className="text-sm text-muted-foreground">
              Envie cotações, invoices e documentos para análise automática
            </p>
          </div>
        </div>

        {/* Upload Area */}
        <Card className="border-2 border-dashed border-purple-300 dark:border-purple-700 hover:border-purple-500 transition-colors">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="p-4 rounded-full bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 mb-4">
                <Upload className="h-10 w-10 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Arraste arquivos ou clique para enviar</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Suporta PDF, JPEG, PNG e WebP (máx. 16MB)
              </p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={onFileUpload}
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="bg-gradient-to-r from-[#311260] to-[#682ABA] hover:opacity-90"
              >
                {uploadingFile ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Selecionar Arquivo
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Document Types */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onNavigateToChat('Preciso analisar uma cotação de fornecedor')}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium">Cotações</h4>
                <p className="text-xs text-muted-foreground">Propostas de fornecedores</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onNavigateToChat('Preciso analisar uma invoice/fatura')}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h4 className="font-medium">Invoices</h4>
                <p className="text-xs text-muted-foreground">Faturas comerciais</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onNavigateToChat('Preciso analisar um documento de importação')}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Globe className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h4 className="font-medium">Documentos</h4>
                <p className="text-xs text-muted-foreground">BL, AWB, Certificados</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tips */}
        <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-purple-600 mt-0.5" />
              <div>
                <h4 className="font-medium mb-1">Dica da Excambia</h4>
                <p className="text-sm text-muted-foreground">
                  Ao enviar uma cotação, extraio automaticamente os produtos, preços, NCMs e condições comerciais.
                  Você pode me pedir para comparar com cotações anteriores ou calcular a viabilidade de cada item.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
