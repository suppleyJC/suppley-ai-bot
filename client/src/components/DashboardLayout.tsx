import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, PanelLeft, Calculator, Building2, Package, Settings, History, FileText, ChevronRight, Sparkles, Scale, ClipboardList, Factory, MessageSquare } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';


const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/", section: "principal" },
  { icon: Calculator, label: "Novo Cálculo", path: "/calculate", section: "principal" },
  { icon: FileText, label: "Análise das Oportunidades", path: "/quotations", section: "principal" },
  { icon: History, label: "Histórico de Cálculos", path: "/calculations", section: "gestao" },
  { icon: Sparkles, label: "Excambia", path: "/excambia", section: "gestao" },
  { icon: Scale, label: "Reforma Tributária", path: "/reform", section: "gestao" },
  { icon: MessageSquare, label: "Mensagens", path: "/messaging", section: "gestao" },
  { icon: Factory, label: "Indústrias", path: "/industries", section: "cadastros" },
  { icon: Building2, label: "Fornecedores", path: "/suppliers", section: "cadastros" },
  { icon: Package, label: "Produtos", path: "/products", section: "cadastros" },
  { icon: ClipboardList, label: "RFQ", path: "/rfq", section: "cadastros" },
  { icon: Settings, label: "Configurações", path: "/settings", section: "sistema" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    // Redirect to login page
    window.location.href = "/login";
    return <DashboardLayoutSkeleton />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          {/* Logo Header - Destaque */}
          <SidebarHeader className="h-20 justify-center border-b border-sidebar-border/50">
            <div className="flex items-center gap-3 px-3 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-10 w-10 flex items-center justify-center hover:bg-sidebar-accent rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-5 w-5 text-sidebar-foreground/70" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center min-w-0 gap-2">
                  <img 
                    src="/logo-suppley.png" 
                    alt="SUPPLEY" 
                    className="h-10 w-auto brightness-0 invert"
                  />
                  <div className="flex flex-col">
                    <span className="logo-text-white text-lg leading-tight">SUPPLEY</span>
                    <span className="text-[10px] text-sidebar-foreground/60 font-medium tracking-wider uppercase">Calc</span>
                  </div>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 pt-4">
            {/* Menu Principal */}
            <div className="px-4 mb-2">
              {!isCollapsed && (
                <span className="text-[10px] font-semibold text-[#28E7C5] uppercase tracking-wider">
                  Principal
                </span>
              )}
            </div>
            <SidebarMenu className="px-2 py-1">
              {menuItems.filter(i => i.section === "principal").map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-11 transition-all font-medium rounded-xl ${
                        isActive 
                          ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                          : "hover:bg-sidebar-accent/50"
                      }`}
                    >
                      <item.icon
                        className={`h-5 w-5 ${isActive ? "text-[#28E7C5]" : "text-sidebar-foreground/70"}`}
                      />
                      <span>{item.label}</span>
                      {isActive && !isCollapsed && (
                        <ChevronRight className="ml-auto h-4 w-4 text-[#28E7C5]" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {/* Gestão */}
            <div className="px-4 mt-6 mb-2">
              {!isCollapsed && (
                <span className="text-[10px] font-semibold text-[#28E7C5] uppercase tracking-wider">
                  Gestão
                </span>
              )}
            </div>
            <SidebarMenu className="px-2 py-1">
              {menuItems.filter(i => i.section === "gestao").map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-11 transition-all font-medium rounded-xl ${
                        isActive 
                          ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                          : "hover:bg-sidebar-accent/50"
                      }`}
                    >
                      <item.icon
                        className={`h-5 w-5 ${isActive ? "text-[#28E7C5]" : "text-sidebar-foreground/70"}`}
                      />
                      <span>{item.label}</span>
                      {isActive && !isCollapsed && (
                        <ChevronRight className="ml-auto h-4 w-4 text-[#28E7C5]" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {/* Cadastros */}
            <div className="px-4 mt-6 mb-2">
              {!isCollapsed && (
                <span className="text-[10px] font-semibold text-[#28E7C5] uppercase tracking-wider">
                  Cadastros
                </span>
              )}
            </div>
            <SidebarMenu className="px-2 py-1">
              {menuItems.filter(i => i.section === "cadastros").map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-11 transition-all font-medium rounded-xl ${
                        isActive 
                          ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                          : "hover:bg-sidebar-accent/50"
                      }`}
                    >
                      <item.icon
                        className={`h-5 w-5 ${isActive ? "text-[#28E7C5]" : "text-sidebar-foreground/70"}`}
                      />
                      <span>{item.label}</span>
                      {isActive && !isCollapsed && (
                        <ChevronRight className="ml-auto h-4 w-4 text-[#28E7C5]" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {/* Sistema */}
            <div className="px-4 mt-6 mb-2">
              {!isCollapsed && (
                <span className="text-[10px] font-semibold text-[#28E7C5] uppercase tracking-wider">
                  Sistema
                </span>
              )}
            </div>
            <SidebarMenu className="px-2 py-1">
              {menuItems.filter(i => i.section === "sistema").map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-11 transition-all font-medium rounded-xl ${
                        isActive 
                          ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                          : "hover:bg-sidebar-accent/50"
                      }`}
                    >
                      <item.icon
                        className={`h-5 w-5 ${isActive ? "text-[#28E7C5]" : "text-sidebar-foreground/70"}`}
                      />
                      <span>{item.label}</span>
                      {isActive && !isCollapsed && (
                        <ChevronRight className="ml-auto h-4 w-4 text-[#28E7C5]" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-sidebar-border/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-sidebar-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-10 w-10 border-2 border-[#28E7C5]/30 shrink-0">
                    <AvatarFallback className="text-sm font-semibold bg-gradient-to-br from-[#682ABA] to-[#28E7C5] text-white">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-semibold truncate leading-none text-sidebar-foreground">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-sidebar-foreground/60 truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#28E7C5]/30 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="bg-background">
        {isMobile && (
          <div className="flex border-b h-16 items-center justify-between bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-10 w-10 rounded-xl bg-muted" />
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {activeMenuItem?.label ?? "Menu"}
                </span>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto p-6 md:p-8">{children}</div>
        </main>
      </SidebarInset>
    </>
  );
}
