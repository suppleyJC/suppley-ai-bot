/**
 * Marketplace — ambiente unificado da Base Operacional.
 *
 * Junta num só lugar (com abas) as duas bases que antes eram páginas separadas:
 *   - Fornecedores / Fabricantes (antiga /suppliers)
 *   - Compradores nacionais / Setores (antiga /industries)
 *
 * Reaproveita os componentes de página existentes dentro de cada aba, de modo
 * que TODAS as funções (cadastro, filtros, edição, rating etc.) seguem intactas.
 * A aba inicial vem da query string (?tab=compradores) para deep-link a partir
 * de outros pontos do app.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Factory } from "lucide-react";
import { useLocation } from "wouter";
import Suppliers from "./Suppliers";
import Industries from "./Industries";

export default function Marketplace() {
  const [location] = useLocation();
  // permite /suppliers?tab=compradores ou navegar para /industries (legado)
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const initialTab =
    params.get("tab") === "compradores" || location.startsWith("/industries")
      ? "compradores"
      : "fornecedores";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fornecedores &amp; Compradores</h1>
        <p className="text-muted-foreground">
          Fornecedores/fabricantes e compradores nacionais/setores num único ambiente
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList>
          <TabsTrigger value="fornecedores" className="gap-2">
            <Building2 className="h-4 w-4" />
            Fornecedores / Fabricantes
          </TabsTrigger>
          <TabsTrigger value="compradores" className="gap-2">
            <Factory className="h-4 w-4" />
            Compradores nacionais / Setores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fornecedores" className="mt-6">
          <Suppliers />
        </TabsContent>
        <TabsContent value="compradores" className="mt-6">
          <Industries />
        </TabsContent>
      </Tabs>
    </div>
  );
}
