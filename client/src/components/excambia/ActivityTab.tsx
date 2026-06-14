import { Card, CardContent } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Activity } from "lucide-react";

interface ActivityTabProps {
  actions: any[] | undefined;
  loadingActions: boolean;
}

export function ActivityTab({ actions, loadingActions }: ActivityTabProps) {
  return (
    <TabsContent value="activity" className="flex-1 overflow-auto m-0 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <h2 className="text-xl font-bold">Histórico de Atividades</h2>

        {loadingActions ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        ) : actions && actions.length > 0 ? (
          <div className="space-y-3">
            {actions.map((action: any) => (
              <Card key={action.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900">
                      <Activity className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{action.action}</h4>
                      <p className="text-sm text-muted-foreground">{action.result}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(action.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Activity className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma Atividade</h3>
              <p className="text-sm text-muted-foreground text-center">
                O histórico de ações da Excambia aparecerá aqui.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </TabsContent>
  );
}
