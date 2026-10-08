import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  Send, Inbox, Mail, MessageSquare, Phone, 
  Clock, CheckCircle2, AlertCircle, Archive,
  Plus, Users, FileText, Copy, ExternalLink,
  Loader2, RefreshCw
} from "lucide-react";

export default function Messaging() {
  const [activeTab, setActiveTab] = useState("inbox");
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<string>("email");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [language, setLanguage] = useState<string>("en");

  // Queries
  const { data: inboundMessages, isLoading: loadingInbound, refetch: refetchInbound } = 
    trpc.messaging.inbound.list.useQuery({});
  const { data: outboundMessages, isLoading: loadingOutbound, refetch: refetchOutbound } = 
    trpc.messaging.outbound.list.useQuery({});
  const { data: stats } = trpc.messaging.stats.useQuery();
  const { data: industries } = trpc.industries.list.useQuery();
  const { data: unreadCount } = trpc.messaging.inbound.unreadCount.useQuery();

  // Mutations
  const sendMutation = trpc.messaging.outbound.send.useMutation({
    onSuccess: (data) => {
      toast.success("Mensagem enviada com sucesso!");
      setShowComposeDialog(false);
      resetForm();
      refetchOutbound();
      // Copiar link de resposta
      if (data.responseUrl) {
        navigator.clipboard.writeText(data.responseUrl);
        toast.info("Link de resposta copiado para a área de transferência");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const markReadMutation = trpc.messaging.inbound.markRead.useMutation({
    onSuccess: () => { refetchInbound(); },
  });

  const archiveMutation = trpc.messaging.inbound.archive.useMutation({
    onSuccess: () => { refetchInbound(); toast.success("Mensagem arquivada"); },
  });

  const generateTemplateMutation = trpc.messaging.outbound.generateTemplate.useMutation({
    onSuccess: (data) => {
      setSubject(data.subject);
      setBody(data.body);
      toast.success("Template gerado com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setSelectedIndustry("");
    setSelectedChannel("email");
    setRecipientAddress("");
    setSubject("");
    setBody("");
    setLanguage("en");
  }

  function handleSend() {
    if (!selectedIndustry || !recipientAddress || !body) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    sendMutation.mutate({
      industryId: parseInt(selectedIndustry),
      channel: selectedChannel as any,
      recipientAddress,
      subject: subject || undefined,
      body,
      language: language as any,
    });
  }

  function handleGenerateTemplate() {
    if (!selectedIndustry) {
      toast.error("Selecione uma indústria primeiro");
      return;
    }
    generateTemplateMutation.mutate({
      industryId: parseInt(selectedIndustry),
      language: language as any,
      products: [{ name: "Produto (edite conforme necessário)" }],
      incoterm: "FOB",
    });
  }

  function getChannelIcon(channel: string) {
    switch (channel) {
      case "email": return <Mail className="h-4 w-4" />;
      case "whatsapp": return <MessageSquare className="h-4 w-4" />;
      case "wechat": return <MessageSquare className="h-4 w-4" />;
      case "phone": return <Phone className="h-4 w-4" />;
      default: return <Mail className="h-4 w-4" />;
    }
  }

  function getStatusBadge(status: string) {
    const configs: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      sent: { label: "Enviada", variant: "default" },
      delivered: { label: "Entregue", variant: "default" },
      read: { label: "Lida", variant: "secondary" },
      responded: { label: "Respondida", variant: "default" },
      bounced: { label: "Falhou", variant: "destructive" },
      failed: { label: "Erro", variant: "destructive" },
      queued: { label: "Na fila", variant: "outline" },
      draft: { label: "Rascunho", variant: "outline" },
      unread: { label: "Não lida", variant: "default" },
      processed: { label: "Processada", variant: "secondary" },
      converted: { label: "Convertida", variant: "default" },
      archived: { label: "Arquivada", variant: "outline" },
    };
    const config = configs[status] || { label: status, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  }

  function formatDate(date: string | Date) {
    return new Date(date).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  }

  const unreadMessages = useMemo(() => 
    (inboundMessages || []).filter(m => m.status === "unread"),
    [inboundMessages]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mensagens</h1>
          <p className="text-muted-foreground">
            Central de comunicação multicanal com fornecedores
          </p>
        </div>
        <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Mensagem
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Enviar Cotação / Mensagem</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {/* Indústria */}
              <div className="space-y-2">
                <Label>Indústria / Fornecedor *</Label>
                <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a indústria" />
                  </SelectTrigger>
                  <SelectContent>
                    {(industries || []).map((ind: any) => (
                      <SelectItem key={ind.id} value={String(ind.id)}>
                        {ind.tradeName || ind.name} — {ind.country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Canal e Destinatário */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Canal *</Label>
                  <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="wechat">WeChat</SelectItem>
                      <SelectItem value="phone">Telefone</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Destinatário *</Label>
                  <Input 
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder={selectedChannel === "email" ? "email@factory.com" : "+86 138 0000 0000"}
                  />
                </div>
              </div>

              {/* Idioma */}
              <div className="space-y-2">
                <Label>Idioma</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="zh">中文 (Chinês)</SelectItem>
                    <SelectItem value="pt">Português</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Assunto */}
              <div className="space-y-2">
                <Label>Assunto</Label>
                <Input 
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Request for Quotation - [Produto]"
                />
              </div>

              {/* Corpo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Mensagem *</Label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleGenerateTemplate}
                    disabled={generateTemplateMutation.isPending}
                    className="gap-1"
                  >
                    {generateTemplateMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    Gerar Template IA
                  </Button>
                </div>
                <Textarea 
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Escreva a mensagem ou gere um template..."
                  rows={10}
                />
              </div>

              {/* Info sobre via dupla */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Via Dupla Ativada</p>
                <p>
                  Ao enviar, será gerado um link único para o fornecedor responder diretamente 
                  na plataforma. O link será incluído automaticamente na mensagem e copiado para 
                  sua área de transferência.
                </p>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowComposeDialog(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSend} 
                  disabled={sendMutation.isPending}
                  className="gap-2"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Send className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalSent || 0}</p>
                <p className="text-xs text-muted-foreground">Enviadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Inbox className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalReceived || 0}</p>
                <p className="text-xs text-muted-foreground">Recebidas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{unreadCount?.count || 0}</p>
                <p className="text-xs text-muted-foreground">Não lidas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <CheckCircle2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.responseRate || 0}%</p>
                <p className="text-xs text-muted-foreground">Taxa Resposta</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Inbox / Enviadas */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="inbox" className="gap-2">
              <Inbox className="h-4 w-4" />
              Inbox
              {(unreadCount?.count || 0) > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {unreadCount?.count}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent" className="gap-2">
              <Send className="h-4 w-4" />
              Enviadas
            </TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="sm" onClick={() => { refetchInbound(); refetchOutbound(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* INBOX */}
        <TabsContent value="inbox" className="mt-4">
          {loadingInbound ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !inboundMessages?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Inbox className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">Inbox vazio</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Quando fornecedores responderem suas cotações, as mensagens aparecerão aqui.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {inboundMessages.map((msg: any) => (
                <Card 
                  key={msg.id} 
                  className={`cursor-pointer transition-colors ${msg.status === "unread" ? "border-primary/50 bg-primary/5" : ""}`}
                  onClick={() => {
                    if (msg.status === "unread") markReadMutation.mutate({ id: msg.id });
                  }}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="p-2 rounded-full bg-muted">
                          {getChannelIcon(msg.channel)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {msg.senderName || msg.senderAddress || "Fornecedor"}
                            </span>
                            {getStatusBadge(msg.status)}
                          </div>
                          {msg.subject && (
                            <p className="text-sm font-medium mt-1 truncate">{msg.subject}</p>
                          )}
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {msg.body}
                          </p>
                          {msg.extractedPrices && (
                            <div className="mt-2 flex gap-2">
                              <Badge variant="outline" className="text-xs">
                                Preços extraídos por IA
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(msg.receivedAt)}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); archiveMutation.mutate({ id: msg.id }); }}
                        >
                          <Archive className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ENVIADAS */}
        <TabsContent value="sent" className="mt-4">
          {loadingOutbound ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !outboundMessages?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Send className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">Nenhuma mensagem enviada</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Envie cotações para fornecedores e acompanhe as respostas aqui.
                </p>
                <Button className="mt-4 gap-2" onClick={() => setShowComposeDialog(true)}>
                  <Plus className="h-4 w-4" />
                  Enviar Primeira Cotação
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {outboundMessages.map((msg: any) => (
                <Card key={msg.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="p-2 rounded-full bg-muted">
                          {getChannelIcon(msg.channel)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {msg.recipientAddress}
                            </span>
                            {getStatusBadge(msg.status)}
                            <Badge variant="outline" className="text-xs capitalize">
                              {msg.channel}
                            </Badge>
                          </div>
                          {msg.subject && (
                            <p className="text-sm font-medium mt-1 truncate">{msg.subject}</p>
                          )}
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {msg.body}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(msg.createdAt)}
                        </span>
                        {msg.responseUrl && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(msg.responseUrl);
                              toast.success("Link de resposta copiado!");
                            }}
                          >
                            <Copy className="h-3 w-3" />
                            <span className="text-xs">Link</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
