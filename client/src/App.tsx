import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";

// Auth Pages
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";

// Dashboard Pages
import Dashboard from "./pages/Dashboard";
import Calculate from "./pages/Calculate";
import CalculateMultiple from "./pages/CalculateMultiple";
import Calculations from "./pages/Calculations";
import Quotations from "./pages/Quotations";
import QuotationDetail from "./pages/QuotationDetail";
import Marketplace from "./pages/Marketplace";
import Products from "./pages/Products";
import Settings from "./pages/Settings";

import ExcambiaChat from "./pages/ExcambiaChat";
import ExcambiaMarket from "./pages/ExcambiaMarket";
import ReformDashboard from "./pages/ReformDashboard";
import RfqDashboard from "./pages/RfqDashboard";
import RfqCreate from "./pages/RfqCreate";
import RfqDetail from "./pages/RfqDetail";
import IndustryDetail from "./pages/IndustryDetail";
import Messaging from "./pages/Messaging";
import Operacoes from "./pages/Operacoes";
import OperacaoDetail from "./pages/OperacaoDetail";
import Diagnostics from "./pages/Diagnostics";

function AuthenticatedRoutes() {
  return (
    <DashboardLayout>
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
        <Route path="/reform" component={ReformDashboard} />
        <Route path="/diagnostics" component={Diagnostics} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
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
