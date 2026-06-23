/**
 * Marketplace — ambiente unificado da Base Operacional.
 *
 * Junta num só lugar (com abas) as duas faces da base unificada, AMBAS na tabela
 * `industries`, discriminadas pelo campo tipoEntidade:
 *   - Fornecedores / Fabricantes  (tipoEntidade = "fornecedor")
 *   - Compradores nacionais / Setores (tipoEntidade = "comprador")
 *
 * SPRINT 2 (Pilar 1): a tabela legada `suppliers` foi unificada em `industries`.
 * Ambas as abas agora renderizam o mesmo componente Industries, parametrizado
 * por tipoEntidade — cadastro, filtros, edição e rating ficam idênticos.
 * A aba inicial vem da query string (?tab=compradores) para deep-link.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Factory } from "lucide-react";
import { useLocation } from "wouter";
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
        <h1 className="text-3xl font-bold">Indústrias &amp; Fornecedores</h1>
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
          <Industries tipoEntidade="fornecedor" />
        </TabsContent>
        <TabsContent value="compradores" className="mt-6">
          <Industries tipoEntidade="comprador" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
