import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Sparkles, TrendingUp, AlertTriangle,
  Bell, CheckCircle, RefreshCw,
} from "lucide-react";

interface AlertsTabProps {
  alerts: any[] | undefined;
  unreadAlerts: any[] | undefined;
  loadingAlerts: boolean;
  onCheckExchange: () => void;
  isCheckingExchange: boolean;
  onMarkRead: (alertId: number) => void;
  onMarkAllRead: () => void;
  onDismiss: (alertId: number) => void;
}

function getAlertIcon(type: string) {
  switch (type) {
    case "exchange_rate_favorable": return <TrendingUp className="h-4 w-4 text-green-500" />;
    case "exchange_rate_unfavorable": return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case "recommendation": return <Sparkles className="h-4 w-4 text-purple-500" />;
    case "market_opportunity": return <TrendingUp className="h-4 w-4 text-blue-500" />;
    default: return <Bell className="h-4 w-4 text-gray-500" />;
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "critical": return "bg-red-500";
    case "high": return "bg-orange-500";
    case "medium": return "bg-yellow-500";
    case "low": return "bg-blue-500";
    default: return "bg-gray-500";
  }
}

export function AlertsTab({
  alerts,
  unreadAlerts,
  loadingAlerts,
  onCheckExchange,
  isCheckingExchange,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
}: AlertsTabProps) {
  return (
    <TabsContent value="alerts" className="flex-1 overflow-auto m-0 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Alertas Inteligentes</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCheckExchange}
              disabled={isCheckingExchange}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isCheckingExchange ? "animate-spin" : ""}`} />
              Verificar Câmbio
            </Button>
            {(unreadAlerts?.length || 0) > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={onMarkAllRead}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Marcar Todos Lidos
              </Button>
            )}
          </div>
        </div>

        {loadingAlerts ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        ) : alerts && alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map((alert: any) => (
              <Card
                key={alert.id}
                className={`transition-all ${!alert.isRead ? "border-l-4 border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${getPriorityColor(alert.priority)}`}>
                      {getAlertIcon(alert.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{alert.title}</h4>
                        {!alert.isRead && (
                          <Badge variant="secondary" className="text-xs">Novo</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.message}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(alert.createdAt).toLocaleString("pt-BR")}
                        </span>
                        <div className="flex gap-2">
                          {!alert.isRead && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onMarkRead(alert.id)}
                            >
                              Marcar como lido
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDismiss(alert.id)}
                          >
                            Dispensar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Bell className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum Alerta</h3>
              <p className="text-sm text-muted-foreground text-center">
                Você está em dia! Novos alertas aparecerão aqui quando houver oportunidades ou riscos.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </TabsContent>
  );
}
