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
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/executions", label: "Executions", icon: Play },
  { href: "/deployments", label: "Deployments", icon: Rocket },
];

const secondaryNav = [
  { href: "/health", label: "Health", icon: Heart },
  { href: "/costs", label: "Costs", icon: DollarSign },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

const reservedNav = [
  { href: "/evaluations", label: "Evaluations", icon: TestTube },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/workflows", label: "Workflows", icon: GitBranch },
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

    if (disabled) return <div key={href}>{content}</div>;

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
              <span className="font-semibold text-sm tracking-tight">Control Plane</span>
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
            {!sidebarCollapsed && <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50 mb-2">Main</p>}
            {mainNav.map((item) => <NavItem key={item.href} {...item} />)}
          </div>
          <div className="space-y-1">
            {!sidebarCollapsed && <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50 mb-2">Monitoring</p>}
            {secondaryNav.map((item) => <NavItem key={item.href} {...item} />)}
          </div>
          <div className="space-y-1">
            {!sidebarCollapsed && <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50 mb-2">Advanced</p>}
            {reservedNav.map((item) => <NavItem key={item.href} {...item} disabled />)}
          </div>
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <NavItem href="/settings" label="Settings" icon={Settings} />
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
