import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ship } from "lucide-react";
import { formatCurrency } from "./types";

interface PortSelectorProps {
  stateCode: string;
  selectedPort: string;
  onPortChange: (portCode: string, portCosts?: { thc: number; storage: number; liberation: number }) => void;
  freight: number;
  onAfrmmChange: (afrmm: number) => void;
}

export function PortSelector({ stateCode, selectedPort, onPortChange, freight, onAfrmmChange }: PortSelectorProps) {
  const { data: ports } = trpc.ports.getPortsByState.useQuery(
    { stateCode },
    { enabled: !!stateCode }
  );
  const { data: allPorts } = trpc.ports.getAllPorts.useQuery();
  const { data: fixedCosts } = trpc.ports.getFixedCosts.useQuery();

  const availablePorts = ports && ports.length > 0 ? ports : allPorts?.filter(p => p.stateCode === stateCode) || [];
  const hasPortsInState = availablePorts.length > 0;

  // Calculate AFRMM when freight changes - use ref to prevent infinite loop
  const prevFreightRef = useRef<number | null>(null);
  useEffect(() => {
    if (fixedCosts && freight !== prevFreightRef.current) {
      prevFreightRef.current = freight;
      const afrmm = freight * fixedCosts.afrmmRate;
      onAfrmmChange(afrmm);
    }
  }, [freight, fixedCosts]);

  const handlePortChange = (portCode: string) => {
    const port = availablePorts.find(p => p.code === portCode);
    if (port) {
      onPortChange(portCode, {
        thc: port.thcCost,
        storage: port.storageCostPercent * 100,
        liberation: port.liberationCost,
      });
    } else {
      onPortChange(portCode);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 mt-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Ship className="h-4 w-4" />
          Porto de Destino
        </Label>
        {hasPortsInState ? (
          <Select value={selectedPort} onValueChange={handlePortChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o porto" />
            </SelectTrigger>
            <SelectContent>
              {availablePorts.map((port) => (
                <SelectItem key={port.code} value={port.code}>
                  {port.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
            Nenhum porto marítimo disponível para este estado. Os custos serão estimados.
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Custos Portuários Estimados</Label>
        <div className="text-sm space-y-1 p-2 bg-muted/50 rounded-md">
          <div className="flex justify-between">
            <span>THC (Terminal Handling):</span>
            <span className="font-medium">{formatCurrency(selectedPort ? (availablePorts.find(p => p.code === selectedPort)?.thcCost || 1200) : 1200)}</span>
          </div>
          <div className="flex justify-between">
            <span>Liberação:</span>
            <span className="font-medium">{formatCurrency(selectedPort ? (availablePorts.find(p => p.code === selectedPort)?.liberationCost || 400) : 400)}</span>
          </div>
          <div className="flex justify-between">
            <span>AFRMM (25% do frete):</span>
            <span className="font-medium">{formatCurrency(freight * 0.25)}</span>
          </div>
          <div className="flex justify-between">
            <span>Siscomex:</span>
            <span className="font-medium">{formatCurrency(fixedCosts?.siscomexBase || 214.50)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
