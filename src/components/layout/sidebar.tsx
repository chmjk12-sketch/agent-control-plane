"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import {
  LayoutDashboard, Bot, Play, Rocket, DollarSign, Heart, Bell,
  FlaskConical, GitBranch, Settings, ChevronLeft, ChevronRight, Box,
  Activity, TestTube,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const mainNav = [
  { href: "/overview", label: "概览", icon: LayoutDashboard },
  { href: "/agents", label: "智能体", icon: Bot },
  { href: "/executions", label: "执行记录", icon: Play },
  { href: "/test", label: "测试", icon: FlaskConical },
  { href: "/deployments", label: "部署管理", icon: Rocket },
];

const secondaryNav = [
  { href: "/health", label: "健康监控", icon: Heart },
  { href: "/costs", label: "Token 监控", icon: DollarSign },
  { href: "/alerts", label: "告警中心", icon: Bell },
];

const reservedNav = [
  { href: "/evaluations", label: "评估中心", icon: TestTube },
  { href: "/experiments", label: "实验中心", icon: FlaskConical },
  { href: "/workflows", label: "工作流", icon: GitBranch },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

  const NavItem = ({ href, label, icon: Icon, disabled }: { href: string; label: string; icon: any; disabled?: boolean }) => {
    const isActive = pathname === href || (href !== "/overview" && pathname.startsWith(href + "/"));
    const content = (
      <div className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
        disabled && "opacity-40 cursor-not-allowed",
        !disabled && isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        !disabled && !isActive && "text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50",
        sidebarCollapsed && "justify-center px-2"
      )}>
        <Icon className="h-4 w-4 shrink-0" />
        {!sidebarCollapsed && <span>{label}</span>}
        {isActive && !sidebarCollapsed && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
      </div>
    );

    if (disabled) return (
      <Tooltip key={href}>
        <TooltipTrigger asChild>
          <div key={href}>{content}</div>
        </TooltipTrigger>
        <TooltipContent side="right">即将上线</TooltipContent>
      </Tooltip>
    );

    const link = (
      <Link href={href} key={href}>
        {content}
      </Link>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip key={href}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return <div key={href}>{link}</div>;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300",
        sidebarCollapsed ? "w-[60px]" : "w-[220px]"
      )}>
        <div className={cn("flex items-center h-14 border-b border-sidebar-border px-4", sidebarCollapsed && "justify-center px-2")}>
          {!sidebarCollapsed ? (
            <Link href="/overview" className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <Box className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm tracking-tight">智能体控制台</span>
            </Link>
          ) : (
            <Link href="/overview" className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Box className="h-4 w-4 text-primary-foreground" />
            </Link>
          )}
          {!sidebarCollapsed && (
            <button onClick={toggleSidebar} className="ml-auto p-1 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          <div className="space-y-1">
            {!sidebarCollapsed && <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50 mb-2">主导航</p>}
            {mainNav.map((item) => <NavItem key={item.href} {...item} />)}
          </div>
          <div className="space-y-1">
            {!sidebarCollapsed && <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50 mb-2">监控中心</p>}
            {secondaryNav.map((item) => <NavItem key={item.href} {...item} />)}
          </div>
          <div className="space-y-1">
            {!sidebarCollapsed && <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50 mb-2">高级功能</p>}
            {reservedNav.map((item) => <NavItem key={item.href} {...item} disabled />)}
          </div>
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <NavItem href="/settings" label="系统设置" icon={Settings} />
        </div>

        {sidebarCollapsed && (
          <button onClick={toggleSidebar} className="absolute -right-3 top-16 h-6 w-6 rounded-full border border-border bg-card flex items-center justify-center hover:bg-accent transition-colors">
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </aside>
    </TooltipProvider>
  );
}
