import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ParametrosPanel } from "@/pages/Parametros";
import { UsoIaPanel } from "@/pages/UsoIa";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  Sparkles,
  Bell,
  Mail,
  MessageSquare,
  TrendingUp,
  Zap,
  Wifi,
  WifiOff,
  Users,
  UserPlus,
  Activity,
  SlidersHorizontal,
  Lock,
  Crown,
  Trash2 as TrashIcon,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";

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

/* ============================================================
 * USUÁRIOS — cadastro e gestão (apenas administrador)
 * ============================================================ */
function UsuariosTab() {
  const utils = trpc.useUtils();
  const { user: me } = useAuth();
  const { data: users = [], isLoading } = trpc.users.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" as "user" | "admin" });

  const createMut = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado com sucesso!");
      utils.users.list.invalidate();
      setForm({ name: "", email: "", password: "", role: "user" });
      setShowForm(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.users.remove.useMutation({
    onSuccess: () => { toast.success("Usuário removido"); utils.users.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const roleMut = trpc.users.updateRole.useMutation({
    onSuccess: () => { toast.success("Papel atualizado"); utils.users.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const resetPwdMut = trpc.users.resetPassword.useMutation({
    onSuccess: () => toast.success("Senha redefinida com sucesso!"),
    onError: (e) => toast.error(e.message),
  });

  const handleResetPassword = (id: number, email: string) => {
    const newPassword = window.prompt(`Nova senha provisória para ${email} (mín. 8 caracteres):`);
    if (!newPassword) return;
    if (newPassword.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres");
    resetPwdMut.mutate({ id, newPassword });
  };

  const submit = () => {
    if (form.name.trim().length < 2) return toast.error("Informe o nome");
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(form.email)) return toast.error("Email inválido");
    if (form.password.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres");
    createMut.mutate({ name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password, role: form.role });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Usuários
          </CardTitle>
          <CardDescription>
            Somente o administrador cadastra e gerencia usuários. Novos usuários acessam todos
            os ambientes, mas não editam parâmetros de cálculo nem cadastram outros usuários.
          </CardDescription>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="btn-turquesa gap-2 shrink-0">
          <UserPlus className="h-4 w-4" /> Novo usuário
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {showForm && (
          <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="usuario@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Senha provisória</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="mín. 8 caracteres" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Papel</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "user" | "admin" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário — acesso operacional</SelectItem>
                  <SelectItem value="admin">Administrador — acesso total</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={createMut.isPending} className="gap-2">
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Criar usuário
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Usuário</th>
                  <th className="px-4 py-2.5">Papel</th>
                  <th className="px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === me?.id;
                  const isOwner = (u.email ?? "").toLowerCase() === "jean@suppley.com.br";
                  return (
                    <tr key={u.id} className="border-t border-border/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{u.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {u.role === "admin" ? (
                          <Badge className="gap-1 bg-purple-100 text-purple-700 hover:bg-purple-100"><Crown className="h-3 w-3" /> Administrador</Badge>
                        ) : (
                          <Badge variant="secondary">Usuário</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!isSelf && !isOwner && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={roleMut.isPending}
                                onClick={() => roleMut.mutate({ id: u.id, role: u.role === "admin" ? "user" : "admin" })}
                              >
                                {u.role === "admin" ? "Tornar usuário" : "Tornar admin"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resetPwdMut.isPending}
                                onClick={() => handleResetPassword(u.id, u.email ?? "")}
                              >
                                Redefinir senha
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={removeMut.isPending}
                                onClick={() => { if (confirm(`Remover ${u.email}?`)) removeMut.mutate({ id: u.id }); }}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {(isSelf || isOwner) && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * TROCAR SENHA — disponível a todos os usuários
 * ============================================================ */
function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const mut = trpc.auth.changePassword.useMutation({
    onSuccess: () => { toast.success("Senha alterada com sucesso!"); setCurrent(""); setNext(""); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card className="card-modern">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" /> Segurança</CardTitle>
        <CardDescription>Altere sua senha de acesso</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 sm:max-w-xl">
          <div className="space-y-1.5">
            <Label className="text-sm">Senha atual</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Nova senha</Label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="mín. 8 caracteres" />
          </div>
          <div className="sm:col-span-2">
            <Button
              onClick={() => { if (next.length < 8) return toast.error("A nova senha deve ter pelo menos 8 caracteres"); mut.mutate({ currentPassword: current, newPassword: next }); }}
              disabled={mut.isPending || !current || !next}
              className="gap-2"
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Alterar senha
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin";

  const ADMIN_TABS = ["parametros", "usuarios", "uso"];
  const [tab, setTab] = useState("parametros");

  // Usuário não-admin nunca deve pousar numa aba restrita.
  useEffect(() => {
    if (me && !isAdmin && ADMIN_TABS.includes(tab)) setTab("notificacoes");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, isAdmin]);

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? "Parâmetros de cálculo, uso da IA, usuários e preferências"
              : "Suas preferências de notificação e conta"}
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            {isAdmin && <TabsTrigger value="parametros"><SlidersHorizontal className="mr-1.5 h-4 w-4" /> Parâmetros de cálculo</TabsTrigger>}
            {isAdmin && <TabsTrigger value="usuarios"><Users className="mr-1.5 h-4 w-4" /> Usuários</TabsTrigger>}
            {isAdmin && <TabsTrigger value="uso"><Activity className="mr-1.5 h-4 w-4" /> Uso da IA</TabsTrigger>}
            <TabsTrigger value="notificacoes"><Bell className="mr-1.5 h-4 w-4" /> Notificações & Integrações</TabsTrigger>
            <TabsTrigger value="preferencias"><SettingsIcon className="mr-1.5 h-4 w-4" /> Preferências</TabsTrigger>
          </TabsList>

          {/* ===== PARÂMETROS DE CÁLCULO (admin) ===== */}
          {isAdmin && (
            <TabsContent value="parametros" className="mt-6">
              <ParametrosPanel />
            </TabsContent>
          )}

          {/* ===== USUÁRIOS (admin) ===== */}
          {isAdmin && (
            <TabsContent value="usuarios" className="mt-6">
              <UsuariosTab />
            </TabsContent>
          )}

          {/* ===== USO DA IA (admin) — medição de custo + configuração do provedor ===== */}
          {isAdmin && (
            <TabsContent value="uso" className="mt-6 space-y-6">
              <UsoIaPanel />
            </TabsContent>
          )}

          {/* ===== NOTIFICAÇÕES & INTEGRAÇÕES (todos) ===== */}
          <TabsContent value="notificacoes" className="mt-6">
            <NotificationPreferencesSection />
          </TabsContent>

          {/* ===== PREFERÊNCIAS (todos) — senha ===== */}
          <TabsContent value="preferencias" className="mt-6 space-y-6">
            <ChangePasswordSection />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
