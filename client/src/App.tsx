import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";

// Auth Pages — login é eager (primeira pintura); o resto entra sob demanda.
import Login from "./pages/Login";
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));

// Dashboard Pages — code-splitting por rota: cada página vira um chunk próprio,
// e o renderizador pesado (markdown/shiki/mermaid/katex) só baixa onde é usado.
const NotFound = lazy(() => import("@/pages/NotFound"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Calculate = lazy(() => import("./pages/Calculate"));
const CalculateMultiple = lazy(() => import("./pages/CalculateMultiple"));
const Calculations = lazy(() => import("./pages/Calculations"));
const Quotations = lazy(() => import("./pages/Quotations"));
const QuotationDetail = lazy(() => import("./pages/QuotationDetail"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const Products = lazy(() => import("./pages/Products"));
const Settings = lazy(() => import("./pages/Settings"));

const ExcambiaChat = lazy(() => import("./pages/ExcambiaChat"));
const ExcambiaMarket = lazy(() => import("./pages/ExcambiaMarket"));
const ReformDashboard = lazy(() => import("./pages/ReformDashboard"));
const RfqDashboard = lazy(() => import("./pages/RfqDashboard"));
const RfqCreate = lazy(() => import("./pages/RfqCreate"));
const RfqDetail = lazy(() => import("./pages/RfqDetail"));
const IndustryDetail = lazy(() => import("./pages/IndustryDetail"));
const Messaging = lazy(() => import("./pages/Messaging"));
const Operacoes = lazy(() => import("./pages/Operacoes"));
const OperacaoDetail = lazy(() => import("./pages/OperacaoDetail"));
const Proformas = lazy(() => import("./pages/Proformas"));
const Parametros = lazy(() => import("./pages/Parametros"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));

/** Fallback discreto enquanto o chunk da página carrega. */
function RouteFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
    </div>
  );
}

function AuthenticatedRoutes() {
  return (
    <DashboardLayout>
      <Suspense fallback={<RouteFallback />}>
      <Switch>
        {/* Excambia é a porta de entrada (cérebro do sistema) */}
        <Route path="/" component={ExcambiaChat} />
        <Route path="/calculate" component={CalculateMultiple} />
        <Route path="/calculate-single" component={Calculate} />
        <Route path="/calculations" component={Calculations} />
        <Route path="/calculations/:id" component={QuotationDetail} />
        <Route path="/quotations" component={Quotations} />
        <Route path="/quotations/:id" component={QuotationDetail} />
        <Route path="/suppliers" component={Marketplace} />
        <Route path="/products" component={Products} />
        <Route path="/settings" component={Settings} />
        <Route path="/excambia" component={ExcambiaChat} />
        <Route path="/excambia/market" component={ExcambiaMarket} />
        <Route path="/industries" component={Marketplace} />
        <Route path="/industries/:id">{(params: any) => <IndustryDetail id={params.id} />}</Route>
        <Route path="/rfq" component={RfqDashboard} />
        <Route path="/rfq/new" component={RfqCreate} />
        <Route path="/rfq/:id" component={RfqDetail} />
        <Route path="/messaging" component={Messaging} />
        <Route path="/operacoes" component={Operacoes} />
        <Route path="/operacao/:id" component={OperacaoDetail} />
        <Route path="/proformas" component={Proformas} />
        <Route path="/parametros" component={Parametros} />
        <Route path="/reform" component={ReformDashboard} />
        <Route path="/diagnostics" component={Diagnostics} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
      </Suspense>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Switch>
      {/* Public auth routes */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />

      {/* Protected routes - DashboardLayout handles auth */}
      <Route>
        <AuthenticatedRoutes />
      </Route>
    </Switch>
    </Suspense>
  );
}

function App() {
  // Apply watermark hiding preference on app load
  useEffect(() => {
    const hideWatermark = localStorage.getItem('hideWatermark') === 'true';
    if (hideWatermark) {
      const styleId = 'watermark-hide-style';
      let styleEl = document.getElementById(styleId) as HTMLStyleElement;
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
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
