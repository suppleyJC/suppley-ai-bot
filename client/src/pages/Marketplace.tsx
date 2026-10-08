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

/**
 * Feature flag — aba "Compradores nacionais / Setores".
 *
 * Oculta por enquanto: hoje o ambiente reaproveita o formulário de fornecedor e
 * não está ligado ao resto do sistema. Será reativado num segundo momento com
 * propósito próprio: entender a DEMANDA dos importadores que usam a plataforma
 * (segmento, perfil de demanda, volume, sensibilidade a preço, potencial).
 *
 * Para reativar: troque para `true` e adapte o formulário/stats em Industries.tsx
 * para os campos de comprador (Fase 5 já previstos no schema).
 */
const SHOW_COMPRADORES = false;

export default function Marketplace() {
  const [location] = useLocation();
  // permite /suppliers?tab=compradores ou navegar para /industries (legado)
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const initialTab =
    SHOW_COMPRADORES &&
    (params.get("tab") === "compradores" || location.startsWith("/industries"))
      ? "compradores"
      : "fornecedores";

  // Aba de compradores oculta: renderiza só o ambiente de fornecedores, sem o
  // cabeçalho/abas externos (o componente Industries já traz o próprio título).
  if (!SHOW_COMPRADORES) {
    return <Industries tipoEntidade="fornecedor" />;
  }

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
