import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Calculator, 
  TrendingUp, 
  Package, 
  Building2, 
  ArrowRight,
  Clock,
  FileText,
  CheckCircle2,
  Truck,
  Ship,
  FileCheck,
  Plus,
  Globe,
  Zap,
  ClipboardList
} from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  draft: { label: "Rascunho", color: "text-gray-600", bgColor: "bg-gray-100", icon: FileText },
  analyzing: { label: "Analisando", color: "text-blue-600", bgColor: "bg-blue-50", icon: Calculator },
  viable: { label: "Viável", color: "text-emerald-600", bgColor: "bg-emerald-50", icon: CheckCircle2 },
  not_viable: { label: "Inviável", color: "text-red-600", bgColor: "bg-red-50", icon: FileText },
  negotiating: { label: "Negociando", color: "text-amber-600", bgColor: "bg-amber-50", icon: Building2 },
  approved: { label: "Aprovada", color: "text-green-600", bgColor: "bg-green-50", icon: CheckCircle2 },
  ordered: { label: "Pedido Feito", color: "text-purple-600", bgColor: "bg-purple-50", icon: FileCheck },
  shipped: { label: "Embarcado", color: "text-indigo-600", bgColor: "bg-indigo-50", icon: Ship },
  customs: { label: "Desembaraço", color: "text-orange-600", bgColor: "bg-orange-50", icon: FileCheck },
  nationalized: { label: "Nacionalizado", color: "text-teal-600", bgColor: "bg-teal-50", icon: CheckCircle2 },
  completed: { label: "Concluído", color: "text-emerald-700", bgColor: "bg-emerald-100", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", color: "text-gray-500", bgColor: "bg-gray-100", icon: FileText },
};

function AnimatedCounter({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    let animationFrame: number;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * value));
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);
  
  return <>{count}</>;
}

function StatCard({ 
  title, 
  value, 
  description, 
  icon: Icon,
  iconVariant = "purple",
  loading = false,
  index = 0,
}: { 
  title: string; 
  value: string | number; 
  description?: string;
  icon: React.ElementType;
  iconVariant?: "purple" | "turquesa";
  loading?: boolean;
  index?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), index * 100);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div 
      className={`stat-card transform transition-all duration-500 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className={`stat-icon ${iconVariant === "turquesa" ? "stat-icon-turquesa" : "stat-icon-purple"}`}>
        <Icon className="h-6 w-6" />
      </div>
      {loading ? (
        <Skeleton className="h-10 w-28 mb-1" />
      ) : (
        <div className="stat-value">
          {typeof value === "number" ? <AnimatedCounter value={value} /> : value}
        </div>
      )}
      <div className="stat-label">{title}</div>
      {description && (
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
      )}
    </div>
  );
}

function RecentQuotations() {
  const { data: quotations, isLoading } = trpc.quotations.list.useQuery({ limit: 5 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!quotations || quotations.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#682ABA]/20 to-[#28E7C5]/20 flex items-center justify-center mx-auto mb-4 float-animation">
          <Calculator className="h-10 w-10 text-[#682ABA]" />
        </div>
        <h3 className="font-semibold text-lg mb-2" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          NENHUMA OPORTUNIDADE AINDA
        </h3>
        <p className="text-muted-foreground mb-6">Comece calculando sua primeira importação</p>
        <Link href="/calculate">
          <Button className="btn-suppley gap-2">
            <Plus className="h-4 w-4" />
            Criar primeira oportunidade
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {quotations.map((quotation, index) => {
        const status = statusConfig[quotation.status] || statusConfig.draft;
        const StatusIcon = status.icon;
        
        return (
          <Link key={quotation.id} href={`/quotations/${quotation.id}`}>
            <div 
              className="flex items-center justify-between p-4 rounded-xl border border-border/50 hover:border-[#28E7C5]/50 hover:shadow-lg transition-all duration-300 cursor-pointer group bg-card"
              style={{ 
                animationDelay: `${index * 80}ms`,
                animation: "fadeInUp 0.5s ease forwards",
                opacity: 0,
                transform: "translateY(10px)"
              }}
            >
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl ${status.bgColor} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                  <StatusIcon className={`h-6 w-6 ${status.color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold group-hover:text-[#682ABA] transition-colors">
                      {quotation.supplierName || "Cotação"} 
                      {quotation.quotationNumber && ` #${quotation.quotationNumber}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={`${status.bgColor} ${status.color} border-0 text-xs font-medium`}>
                      {status.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {quotation.supplierCountry || quotation.originCountry || "Origem não definida"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                  {formatCurrency(quotation.totalCostCents)}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(quotation.createdAt).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-[#28E7C5] group-hover:translate-x-1 transition-all ml-2" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ExchangeRateWidget() {
  const { data: usdRate, isLoading: loadingUsd } = trpc.exchange.getRate.useQuery({ from: "USD", to: "BRL" });
  const { data: eurRate, isLoading: loadingEur } = trpc.exchange.getRate.useQuery({ from: "EUR", to: "BRL" });
  const { data: cnyRate, isLoading: loadingCny } = trpc.exchange.getRate.useQuery({ from: "CNY", to: "BRL" });

  return (
    <div className="card-glass">
      <div className="flex items-center gap-3 mb-6">
        <div className="stat-icon-turquesa w-12 h-12 rounded-xl flex items-center justify-center">
          <Globe className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-semibold text-lg" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.05em" }}>
            CÂMBIO DO DIA
          </h3>
          <p className="text-xs text-muted-foreground">Cotações PTAX (BCB)</p>
        </div>
      </div>
      
      <div className="space-y-3">
        {[
          { flag: "🇺🇸", pair: "USD/BRL", rate: usdRate?.rate, loading: loadingUsd },
          { flag: "🇪🇺", pair: "EUR/BRL", rate: eurRate?.rate, loading: loadingEur },
          { flag: "🇨🇳", pair: "CNY/BRL", rate: cnyRate?.rate, loading: loadingCny },
        ].map((item, index) => (
          <div 
            key={item.pair}
            className="flex justify-between items-center p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all duration-300 group"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl group-hover:scale-110 transition-transform">{item.flag}</span>
              <span className="font-medium">{item.pair}</span>
            </div>
            {item.loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <span className="font-bold text-xl" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                R$ {item.rate?.toFixed(4)}
              </span>
            )}
          </div>
        ))}
      </div>
      
      {usdRate && (
        <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/50">
          Fonte: {usdRate.source} • {new Date(usdRate.timestamp).toLocaleTimeString("pt-BR")}
        </p>
      )}
    </div>
  );
}

function PipelineWidget() {
  const { data: stats, isLoading } = trpc.quotations.stats.useQuery();

  if (isLoading) {
    return (
      <div className="card-glass">
        <Skeleton className="h-6 w-40 mb-4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const pipelineItems = [
    { label: "Viáveis", value: stats?.viableCount || 0, color: "from-emerald-400 to-emerald-600", textColor: "text-emerald-600" },
    { label: "Em Trânsito", value: stats?.inProgressCount || 0, color: "from-blue-400 to-blue-600", textColor: "text-blue-600" },
    { label: "Concluídas", value: stats?.completedCount || 0, color: "from-purple-400 to-purple-600", textColor: "text-purple-600" },
  ];

  return (
    <div className="card-glass">
      <div className="flex items-center gap-3 mb-6">
        <div className="stat-icon-purple w-12 h-12 rounded-xl flex items-center justify-center">
          <Truck className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-semibold text-lg" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.05em" }}>
            PIPELINE
          </h3>
          <p className="text-xs text-muted-foreground">Status das cotações</p>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        {pipelineItems.map((item, index) => (
          <div 
            key={item.label}
            className="text-center p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all duration-300 group cursor-default"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className={`text-3xl font-bold ${item.textColor} group-hover:scale-110 transition-transform`} style={{ fontFamily: "'Rajdhani', sans-serif" }}>
              <AnimatedCounter value={item.value} />
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-1 uppercase tracking-wide">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickActions() {
  const actions = [
    { icon: Calculator, label: "Novo Cálculo", path: "/calculate", primary: true },
    { icon: ClipboardList, label: "Nova RFQ", path: "/rfq/new", primary: false },
    { icon: Building2, label: "Novo Fornecedor", path: "/suppliers/new", primary: false },
    { icon: Package, label: "Novo Produto", path: "/products/new", primary: false },
  ];

  return (
    <div className="card-glass">
      <div className="flex items-center gap-3 mb-6">
        <div className="stat-icon-purple w-12 h-12 rounded-xl flex items-center justify-center">
          <Zap className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-semibold text-lg" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.05em" }}>
            AÇÕES RÁPIDAS
          </h3>
          <p className="text-xs text-muted-foreground">Acesso direto</p>
        </div>
      </div>
      
      <div className="space-y-3">
        {actions.map((action, index) => (
          <Link key={action.path} href={action.path}>
            <Button 
              variant={action.primary ? "default" : "outline"} 
              className={`w-full justify-start gap-3 h-12 transition-all duration-300 hover:translate-x-1 ${
                action.primary 
                  ? "btn-suppley" 
                  : "hover:border-[#28E7C5]/50 hover:bg-[#28E7C5]/5"
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <action.icon className="h-5 w-5" />
              <span style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.03em" }}>
                {action.label.toUpperCase()}
              </span>
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: quotationStats, isLoading: loadingQuotationStats } = trpc.quotations.stats.useQuery();
  const { data: calcStats, isLoading: loadingCalcStats } = trpc.calculations.stats.useQuery();
  const { data: suppliers } = trpc.suppliers.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();

  const firstName = user?.name?.split(" ")[0] || "Usuário";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Hero Header with animated gradient */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl hero-gradient p-4 sm:p-6 md:p-10">
        {/* Animated orbit decoration - hidden on mobile */}
        <div className="absolute -right-20 -top-20 w-64 h-64 border-2 border-white/10 rounded-full orbit-decoration hidden sm:block" />
        <div className="absolute -right-10 -top-10 w-48 h-48 border-2 border-[#28E7C5]/20 rounded-full orbit-decoration hidden sm:block" style={{ animationDuration: "15s", animationDirection: "reverse" }} />
        
        <div className="relative z-10 flex flex-col gap-3 sm:gap-6">
          {/* Mobile: compact horizontal, Desktop: full layout */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
            <div className="flex items-center sm:flex-row gap-3 sm:gap-6 sm:text-left">
              <img 
                src="/logo-suppley.png" 
                alt="SUPPLEY" 
                className="h-12 w-12 sm:h-28 sm:w-28 md:h-40 md:w-40 lg:h-48 lg:w-48 object-contain float-animation brightness-0 invert shrink-0"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="min-w-0">
                <p className="text-white/70 text-[10px] sm:text-sm font-medium mb-0.5 sm:mb-2 uppercase tracking-wider">{greeting}, {firstName}</p>
                <h1 className="text-lg sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-0.5 sm:mb-3 truncate" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  SUPPLEY<span className="text-[#28E7C5]">CALC</span>
                </h1>
                <p className="text-white/80 text-xs sm:text-lg max-w-md hidden sm:block">
                  Gerencie suas importações de forma inteligente
                </p>
              </div>
            </div>
            
            <Link href="/calculate" className="w-full sm:w-auto">
              <Button size="lg" className="btn-suppley gap-2 text-xs sm:text-base h-10 sm:h-14 px-4 sm:px-8 shadow-xl hover:shadow-2xl w-full sm:w-auto">
                <Plus className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                <span style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.05em" }}>
                  NOVO CÁLCULO
                </span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid with staggered animation */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Oportunidades"
          value={quotationStats?.totalQuotations || calcStats?.totalCalculations || 0}
          description="Cotações analisadas"
          icon={Calculator}
          iconVariant="purple"
          loading={loadingQuotationStats || loadingCalcStats}
          index={0}
        />
        <StatCard
          title="Valor Total"
          value={formatCurrency(quotationStats?.totalValueBrl || calcStats?.totalValueBrl || 0)}
          description="Custo estimado"
          icon={TrendingUp}
          iconVariant="turquesa"
          loading={loadingQuotationStats || loadingCalcStats}
          index={1}
        />
        <StatCard
          title="Fornecedores"
          value={suppliers?.length || 0}
          description="Cadastrados"
          icon={Building2}
          iconVariant="purple"
          index={2}
        />
        <StatCard
          title="Produtos"
          value={products?.length || 0}
          description="Cadastrados"
          icon={Package}
          iconVariant="turquesa"
          index={3}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Quotations */}
        <div className="lg:col-span-2">
          <div className="card-glass">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.05em" }}>
                  OPORTUNIDADES RECENTES
                </h2>
                <p className="text-sm text-muted-foreground">Últimas cotações analisadas</p>
              </div>
              <Link href="/quotations">
                <Button variant="ghost" size="sm" className="gap-1 text-[#682ABA] hover:text-[#682ABA] hover:bg-[#682ABA]/10 transition-all">
                  Ver todas
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <RecentQuotations />
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-6">
          <ExchangeRateWidget />
          <PipelineWidget />
          <QuickActions />
        </div>
      </div>
      
      {/* CSS for animations */}
      <style>{`
        @keyframes fadeInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
