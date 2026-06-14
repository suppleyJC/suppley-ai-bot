import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Settings as SettingsIcon, 
  Building2, 
  MapPin, 
  Percent,
  DollarSign,
  Save,
  Loader2,
  Receipt,
  HelpCircle,
  CheckCircle2,
  Info,
  Key,
  Sparkles,
  Trash2,
  Eye,
  EyeOff,
  Shield,
  Bell,
  Mail,
  MessageSquare,
  TrendingUp,
  Zap,
  Wifi,
  WifiOff
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const BRAZILIAN_STATES = [
  { value: "AC", label: "Acre" },
  { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" },
  { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" },
  { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" },
  { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" },
  { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" },
  { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" },
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
];

const TAX_REGIMES = [
  { 
    value: "simples_nacional", 
    label: "Simples Nacional",
    description: "Para empresas com faturamento até R$ 4,8 milhões/ano",
    color: "bg-emerald-50 border-emerald-200 text-emerald-700"
  },
  { 
    value: "lucro_presumido", 
    label: "Lucro Presumido",
    description: "Para empresas com faturamento até R$ 78 milhões/ano",
    color: "bg-blue-50 border-blue-200 text-blue-700"
  },
  { 
    value: "lucro_real", 
    label: "Lucro Real",
    description: "Obrigatório para empresas com faturamento acima de R$ 78 milhões/ano",
    color: "bg-purple-50 border-purple-200 text-purple-700"
  },
];

const SIMPLES_FAIXAS = [
  { faixa: 1, limite: "Até R$ 180.000", aliquota: 4.0 },
  { faixa: 2, limite: "De R$ 180.000 a R$ 360.000", aliquota: 7.3 },
  { faixa: 3, limite: "De R$ 360.000 a R$ 720.000", aliquota: 9.5 },
  { faixa: 4, limite: "De R$ 720.000 a R$ 1.800.000", aliquota: 10.7 },
  { faixa: 5, limite: "De R$ 1.800.000 a R$ 3.600.000", aliquota: 14.3 },
  { faixa: 6, limite: "De R$ 3.600.000 a R$ 4.800.000", aliquota: 19.0 },
];

// Componente para gerenciar API key da Excambia
function ExcambiaApiKeySection() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const { data: hasApiKey, refetch } = trpc.excambia.hasApiKey.useQuery();
  
  const saveApiKeyMutation = trpc.excambia.saveApiKey.useMutation({
    onSuccess: () => {
      toast.success("API key salva com sucesso!");
      setApiKey("");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });
  
  const removeApiKeyMutation = trpc.excambia.removeApiKey.useMutation({
    onSuccess: () => {
      toast.success("API key removida!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao remover: ${error.message}`);
    },
  });
  
  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      toast.error("Digite uma API key válida");
      return;
    }
    saveApiKeyMutation.mutate({ apiKey: apiKey.trim() });
  };
  
  return (
    <Card className="border-purple-200 dark:border-purple-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          Excambia - API OpenAI Dedicada
        </CardTitle>
        <CardDescription>
          Configure sua própria API key da OpenAI para usar a Excambia de forma independente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasApiKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-green-700 dark:text-green-400 font-medium">
                API key configurada - Excambia usará sua conta OpenAI
              </span>
            </div>
            <Button
              variant="destructive"
              onClick={() => removeApiKeyMutation.mutate()}
              disabled={removeApiKeyMutation.isPending}
            >
              {removeApiKeyMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remover API Key
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800">
              <Key className="h-5 w-5 text-orange-600" />
              <span className="text-orange-700 dark:text-orange-400">
                Sem API key configurada - Excambia usará a IA integrada do sistema
              </span>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="openaiApiKey">OpenAI API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="openaiApiKey"
                    type={showKey ? "text" : "password"}
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  onClick={handleSaveApiKey}
                  disabled={saveApiKeyMutation.isPending || !apiKey.trim()}
                >
                  {saveApiKeyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Obtenha sua API key em{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  platform.openai.com/api-keys
                </a>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NotificationPreferencesSection() {
  const { data: prefs, isLoading: loadingPrefs } = trpc.agent.getPreferences.useQuery();
  const { data: integrationStatus, isLoading: loadingIntegrations } = trpc.messaging.integrationStatus.useQuery();
  const utils = trpc.useUtils();

  const [notifPrefs, setNotifPrefs] = useState({
    enableExchangeAlerts: false,
    usdTargetRate: 5.0,
    eurTargetRate: 5.5,
    enableEmailNotifications: false,
    enablePushNotifications: false,
    autoAnalyzeNewCalculations: true,
    preferredAnalysisDepth: "standard" as "basic" | "standard" | "detailed",
  });

  useEffect(() => {
    if (prefs) {
      setNotifPrefs({
        enableExchangeAlerts: prefs.enableExchangeAlerts ?? false,
        usdTargetRate: prefs.usdTargetRate ? prefs.usdTargetRate / 1000000 : 5.0,
        eurTargetRate: prefs.eurTargetRate ? prefs.eurTargetRate / 1000000 : 5.5,
        enableEmailNotifications: prefs.enableEmailNotifications ?? false,
        enablePushNotifications: prefs.enablePushNotifications ?? false,
        autoAnalyzeNewCalculations: prefs.autoAnalyzeNewCalculations ?? true,
        preferredAnalysisDepth: (prefs.preferredAnalysisDepth as any) || "standard",
      });
    }
  }, [prefs]);

  const updateMutation = trpc.agent.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success("Preferências de notificação salvas!");
      utils.agent.getPreferences.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  const handleSave = () => {
    updateMutation.mutate(notifPrefs);
  };

  if (loadingPrefs || loadingIntegrations) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Notificações e Integrações
        </CardTitle>
        <CardDescription>
          Configure alertas, canais de comunicação e análise automática
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Integration Status */}
        <div className="rounded-xl border border-border/50 p-4 space-y-3">
          <h4 className="font-medium text-sm uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Status das Integrações
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={`flex items-center gap-3 p-3 rounded-lg ${integrationStatus?.email?.configured ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-muted/50'}`}>
              <Mail className={`h-5 w-5 ${integrationStatus?.email?.configured ? 'text-emerald-600' : 'text-muted-foreground'}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Email {integrationStatus?.email?.configured ? '(Ativo)' : '(Não configurado)'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {integrationStatus?.email?.configured 
                    ? `${integrationStatus.email.provider} - ${integrationStatus.email.fromAddress}`
                    : 'Configure SendGrid ou SMTP nas variáveis de ambiente'
                  }
                </p>
              </div>
              {integrationStatus?.email?.configured 
                ? <Wifi className="h-4 w-4 text-emerald-600 shrink-0" />
                : <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
              }
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-lg ${integrationStatus?.whatsapp?.configured ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-muted/50'}`}>
              <MessageSquare className={`h-5 w-5 ${integrationStatus?.whatsapp?.configured ? 'text-emerald-600' : 'text-muted-foreground'}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  WhatsApp {integrationStatus?.whatsapp?.configured ? '(Ativo)' : '(Não configurado)'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {integrationStatus?.whatsapp?.configured 
                    ? `Twilio - ${integrationStatus.whatsapp.fromNumber}`
                    : 'Configure Twilio nas variáveis de ambiente'
                  }
                </p>
              </div>
              {integrationStatus?.whatsapp?.configured 
                ? <Wifi className="h-4 w-4 text-emerald-600 shrink-0" />
                : <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
              }
            </div>
          </div>
        </div>

        {/* Exchange Rate Alerts */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Label htmlFor="exchange-alerts" className="font-medium cursor-pointer">
                  Alertas de Câmbio
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receba alertas quando o câmbio atingir suas metas
                </p>
              </div>
            </div>
            <Switch
              id="exchange-alerts"
              checked={notifPrefs.enableExchangeAlerts}
              onCheckedChange={(checked) => setNotifPrefs({ ...notifPrefs, enableExchangeAlerts: checked })}
            />
          </div>

          {notifPrefs.enableExchangeAlerts && (
            <div className="grid gap-4 sm:grid-cols-2 pl-14">
              <div className="space-y-2">
                <Label className="text-sm">Meta USD/BRL</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={notifPrefs.usdTargetRate}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, usdTargetRate: parseFloat(e.target.value) || 0 })}
                  className="h-10"
                  placeholder="Ex: 4.80"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Meta EUR/BRL</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={notifPrefs.eurTargetRate}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, eurTargetRate: parseFloat(e.target.value) || 0 })}
                  className="h-10"
                  placeholder="Ex: 5.20"
                />
              </div>
            </div>
          )}
        </div>

        {/* Email Notifications */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <Label htmlFor="email-notif" className="font-medium cursor-pointer">
                Notificações por Email
              </Label>
              <p className="text-sm text-muted-foreground">
                Receba resumos e alertas no seu email
              </p>
            </div>
          </div>
          <Switch
            id="email-notif"
            checked={notifPrefs.enableEmailNotifications}
            onCheckedChange={(checked) => setNotifPrefs({ ...notifPrefs, enableEmailNotifications: checked })}
          />
        </div>

        {/* Push Notifications */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <Label htmlFor="push-notif" className="font-medium cursor-pointer">
                Notificações Push
              </Label>
              <p className="text-sm text-muted-foreground">
                Alertas em tempo real no navegador
              </p>
            </div>
          </div>
          <Switch
            id="push-notif"
            checked={notifPrefs.enablePushNotifications}
            onCheckedChange={(checked) => setNotifPrefs({ ...notifPrefs, enablePushNotifications: checked })}
          />
        </div>

        {/* Auto Analysis */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Label htmlFor="auto-analysis" className="font-medium cursor-pointer">
                  Análise Automática
                </Label>
                <p className="text-sm text-muted-foreground">
                  Analisar automaticamente novos cálculos com IA
                </p>
              </div>
            </div>
            <Switch
              id="auto-analysis"
              checked={notifPrefs.autoAnalyzeNewCalculations}
              onCheckedChange={(checked) => setNotifPrefs({ ...notifPrefs, autoAnalyzeNewCalculations: checked })}
            />
          </div>

          {notifPrefs.autoAnalyzeNewCalculations && (
            <div className="pl-14">
              <Label className="text-sm mb-2 block">Profundidade da Análise</Label>
              <Select
                value={notifPrefs.preferredAnalysisDepth}
                onValueChange={(v) => setNotifPrefs({ ...notifPrefs, preferredAnalysisDepth: v as any })}
              >
                <SelectTrigger className="h-10 w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Básica - Resumo rápido</SelectItem>
                  <SelectItem value="standard">Padrão - Análise completa</SelectItem>
                  <SelectItem value="detailed">Detalhada - Relatório aprofundado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="btn-turquesa gap-2"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Preferências
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();

  const [formData, setFormData] = useState({
    companyName: "",
    cnpj: "",
    stateCode: "SC",
    taxRegime: "lucro_presumido" as "simples_nacional" | "lucro_presumido" | "lucro_real",
    simplesAliquota: 10,
    simplesFaixa: 1,
    defaultMarkupPercent: 30,
    defaultCustomsBrokerBrl: 1500,
    defaultStorageBrl: 500,
  });
  
  const [hideWatermark, setHideWatermark] = useState(false);
  
  // Load watermark preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('hideWatermark');
    if (saved === 'true') {
      setHideWatermark(true);
      applyWatermarkHiding(true);
    }
  }, []);
  
  // Function to apply/remove watermark hiding CSS
  const applyWatermarkHiding = (hide: boolean) => {
    const styleId = 'watermark-hide-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    
    if (hide) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `
        /* Hide Manus watermark/badge */
        [class*="manus"], [id*="manus"],
        [class*="watermark"], [id*="watermark"],
        [class*="badge"][class*="made"],
        div[style*="Made with"],
        a[href*="manus.im"],
        .manus-badge, .manus-watermark,
        [data-manus], [data-watermark] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
    } else if (styleEl) {
      styleEl.remove();
    }
  };
  
  const handleWatermarkToggle = (checked: boolean) => {
    setHideWatermark(checked);
    localStorage.setItem('hideWatermark', String(checked));
    applyWatermarkHiding(checked);
    toast.success(checked ? 'Marca d\'água será ocultada' : 'Marca d\'água será exibida');
  };

  useEffect(() => {
    if (settings) {
      setFormData({
        companyName: settings.companyName || "",
        cnpj: settings.cnpj || "",
        stateCode: settings.stateCode || "SC",
        taxRegime: (settings.taxRegime as any) || "lucro_presumido",
        simplesAliquota: (settings.simplesAliquota || 1000) / 100,
        simplesFaixa: settings.simplesFaixa || 1,
        defaultMarkupPercent: (settings.defaultMarkupPercent || 3000) / 100,
        defaultCustomsBrokerBrl: (settings.defaultCustomsBrokerCents || 150000) / 100,
        defaultStorageBrl: (settings.defaultStorageCents || 50000) / 100,
      });
    }
  }, [settings]);

  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas com sucesso!");
      utils.settings.get.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      companyName: formData.companyName || undefined,
      cnpj: formData.cnpj || undefined,
      stateCode: formData.stateCode,
      taxRegime: formData.taxRegime,
      simplesAliquota: Math.round(formData.simplesAliquota * 100),
      simplesFaixa: formData.simplesFaixa,
      defaultMarkupPercent: Math.round(formData.defaultMarkupPercent * 100),
      defaultCustomsBrokerCents: Math.round(formData.defaultCustomsBrokerBrl * 100),
      defaultStorageCents: Math.round(formData.defaultStorageBrl * 100),
    });
  };

  const handleFaixaChange = (faixa: number) => {
    const faixaData = SIMPLES_FAIXAS.find(f => f.faixa === faixa);
    setFormData({
      ...formData,
      simplesFaixa: faixa,
      simplesAliquota: faixaData?.aliquota || 10,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-8 max-w-5xl mx-auto">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Configurações</h1>
            <p className="text-muted-foreground mt-1">
              Configure os parâmetros padrão para seus cálculos de importação
            </p>
          </div>
          <Button 
            onClick={handleSubmit} 
            size="lg" 
            disabled={updateMutation.isPending}
            className="btn-turquesa gap-2"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            Salvar Configurações
          </Button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Company Info */}
            <div className="form-section">
              <h2 className="form-section-title">
                <Building2 className="h-5 w-5 text-primary" />
                Dados da Empresa
              </h2>
              
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="companyName" className="text-sm font-medium">
                    Nome da Empresa
                  </Label>
                  <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="Ex: Excambia Importação"
                    className="h-12"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="cnpj" className="text-sm font-medium">CNPJ</Label>
                  <Input
                    id="cnpj"
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                    placeholder="Ex: 00.000.000/0001-00"
                    className="h-12"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="stateCode" className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Estado
                  </Label>
                  <Select 
                    value={formData.stateCode} 
                    onValueChange={(v) => setFormData({ ...formData, stateCode: v })}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BRAZILIAN_STATES.map((state) => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label} ({state.value})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    O estado determina a alíquota de ICMS aplicável
                  </p>
                </div>
              </div>
            </div>

            {/* Tax Regime */}
            <div className="form-section">
              <h2 className="form-section-title">
                <Receipt className="h-5 w-5 text-primary" />
                Regime Tributário
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>O regime tributário afeta o cálculo de impostos sobre a venda dos produtos importados.</p>
                  </TooltipContent>
                </Tooltip>
              </h2>
              
              <div className="space-y-5">
                {/* Regime Selection Cards */}
                <div className="space-y-3">
                  {TAX_REGIMES.map((regime) => (
                    <button
                      key={regime.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, taxRegime: regime.value as any })}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        formData.taxRegime === regime.value
                          ? `${regime.color} border-current`
                          : "border-border hover:border-primary/30 bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{regime.label}</p>
                          <p className="text-sm opacity-80 mt-0.5">{regime.description}</p>
                        </div>
                        {formData.taxRegime === regime.value && (
                          <CheckCircle2 className="h-5 w-5 shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {formData.taxRegime === "simples_nacional" && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="simplesFaixa" className="text-sm font-medium">
                        Faixa do Simples Nacional
                      </Label>
                      <Select 
                        value={formData.simplesFaixa.toString()} 
                        onValueChange={(v) => handleFaixaChange(parseInt(v))}
                      >
                        <SelectTrigger className="h-12">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SIMPLES_FAIXAS.map((faixa) => (
                            <SelectItem key={faixa.faixa} value={faixa.faixa.toString()}>
                              Faixa {faixa.faixa} - {faixa.limite} ({faixa.aliquota}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="simplesAliquota" className="text-sm font-medium flex items-center gap-2">
                        <Percent className="h-4 w-4 text-muted-foreground" />
                        Alíquota Efetiva (%)
                      </Label>
                      <Input
                        id="simplesAliquota"
                        type="number"
                        step="0.01"
                        min="0"
                        max="33"
                        value={formData.simplesAliquota}
                        onChange={(e) => setFormData({ ...formData, simplesAliquota: parseFloat(e.target.value) || 0 })}
                        className="h-12"
                      />
                    </div>
                  </div>
                )}

                {formData.taxRegime !== "simples_nacional" && (
                  <div className="rounded-xl bg-muted/50 p-4 text-sm space-y-2">
                    <p className="font-semibold flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Alíquotas do {formData.taxRegime === "lucro_presumido" ? "Lucro Presumido" : "Lucro Real"}:
                    </p>
                    {formData.taxRegime === "lucro_presumido" ? (
                      <ul className="space-y-1 text-muted-foreground ml-6">
                        <li>• PIS: 0,65% (cumulativo)</li>
                        <li>• COFINS: 3% (cumulativo)</li>
                        <li>• IRPJ: 15% sobre base presumida (8%)</li>
                        <li>• CSLL: 9% sobre base presumida (12%)</li>
                      </ul>
                    ) : (
                      <ul className="space-y-1 text-muted-foreground ml-6">
                        <li>• PIS: 1,65% (não-cumulativo, com crédito)</li>
                        <li>• COFINS: 7,6% (não-cumulativo, com crédito)</li>
                        <li>• IRPJ: 15% sobre lucro real + 10% adicional</li>
                        <li>• CSLL: 9% sobre lucro real</li>
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Default Values */}
            <div className="form-section">
              <h2 className="form-section-title">
                <SettingsIcon className="h-5 w-5 text-primary" />
                Valores Padrão
              </h2>
              
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="markup" className="text-sm font-medium flex items-center gap-2">
                    <Percent className="h-4 w-4 text-muted-foreground" />
                    Markup Padrão (%)
                  </Label>
                  <Input
                    id="markup"
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.defaultMarkupPercent}
                    onChange={(e) => setFormData({ ...formData, defaultMarkupPercent: parseFloat(e.target.value) || 0 })}
                    className="h-12"
                  />
                  <p className="text-sm text-muted-foreground">
                    Margem de lucro padrão sobre o custo total
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="customsBroker" className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    Despachante Aduaneiro (R$)
                  </Label>
                  <Input
                    id="customsBroker"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.defaultCustomsBrokerBrl}
                    onChange={(e) => setFormData({ ...formData, defaultCustomsBrokerBrl: parseFloat(e.target.value) || 0 })}
                    className="h-12"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="storage" className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    Armazenagem (R$)
                  </Label>
                  <Input
                    id="storage"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.defaultStorageBrl}
                    onChange={(e) => setFormData({ ...formData, defaultStorageBrl: parseFloat(e.target.value) || 0 })}
                    className="h-12"
                  />
                </div>
              </div>
            </div>

            {/* Comparison Table */}
            <div className="form-section">
              <h2 className="form-section-title">
                <Receipt className="h-5 w-5 text-primary" />
                Comparativo de Regimes
              </h2>
              
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="rounded-tl-lg">Imposto</th>
                      <th className="text-center">Simples</th>
                      <th className="text-center">Presumido</th>
                      <th className="text-center rounded-tr-lg">Real</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="font-medium">PIS</td>
                      <td className="text-center text-emerald-600">Incluso</td>
                      <td className="text-center">0,65%</td>
                      <td className="text-center">1,65%*</td>
                    </tr>
                    <tr>
                      <td className="font-medium">COFINS</td>
                      <td className="text-center text-emerald-600">Incluso</td>
                      <td className="text-center">3%</td>
                      <td className="text-center">7,6%*</td>
                    </tr>
                    <tr>
                      <td className="font-medium">IRPJ</td>
                      <td className="text-center text-emerald-600">Incluso</td>
                      <td className="text-center">1,2%**</td>
                      <td className="text-center">15%***</td>
                    </tr>
                    <tr>
                      <td className="font-medium">CSLL</td>
                      <td className="text-center text-emerald-600">Incluso</td>
                      <td className="text-center">1,08%**</td>
                      <td className="text-center">9%***</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-xs text-muted-foreground space-y-1">
                <p>* Não-cumulativo (gera crédito sobre compras)</p>
                <p>** Sobre receita bruta (base presumida)</p>
                <p>*** Sobre lucro real</p>
              </div>
            </div>
          </div>
        </form>

        {/* Excambia API Key Section */}
        <ExcambiaApiKeySection />

        {/* Watermark Section */}
        <Card className="card-modern">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Personalização Visual
            </CardTitle>
            <CardDescription>
              Configure a aparência do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <EyeOff className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Label htmlFor="watermark-toggle" className="font-medium cursor-pointer">
                    Remover marca d'água
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Oculta badges e marcas d'água do sistema
                  </p>
                </div>
              </div>
              <Switch
                id="watermark-toggle"
                checked={hideWatermark}
                onCheckedChange={handleWatermarkToggle}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences & Integration Status */}
        <NotificationPreferencesSection />

        {/* Info Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card-modern">
            <div className="flex items-start gap-4">
              <div className="stat-icon-purple w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                <MapPin className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Sobre o ICMS</h3>
                <p className="text-sm text-muted-foreground">
                  O ICMS é um imposto estadual que incide sobre a importação de produtos. 
                  A alíquota varia de acordo com o estado de destino. Santa Catarina oferece 
                  benefícios fiscais através do TTD (Tratamento Tributário Diferenciado).
                </p>
              </div>
            </div>
          </div>

          <div className="card-modern">
            <div className="flex items-start gap-4">
              <div className="stat-icon-turquesa w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                <Info className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Sobre o Mercosul</h3>
                <p className="text-sm text-muted-foreground">
                  Produtos originários de países do Mercosul (Argentina, Paraguai, Uruguai) 
                  podem ter isenção do Imposto de Importação (II). É necessário apresentar 
                  o Certificado de Origem junto à documentação.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
