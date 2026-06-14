"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, AlertTriangle, Clock } from "lucide-react";
import { formatUptime, formatMemory, timeAgo } from "@/lib/utils";

const statusConfig: Record<string, { icon: any; color: "success" | "destructive" | "warning"; label: string }> = {
  running: { icon: Wifi, color: "success", label: "运行中" },
  offline: { icon: WifiOff, color: "destructive", label: "离线" },
  degraded: { icon: AlertTriangle, color: "warning", label: "性能下降" },
};

export default function HealthPage() {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">健康监控</h1>
        <p className="text-sm text-muted-foreground mt-1">所有智能体的实时健康监控</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><Wifi className="h-5 w-5 text-emerald-400" /></div>
            <div>
              <p className="text-2xl font-bold">{data.filter((h: any) => h.status === "running").length}</p>
              <p className="text-xs text-muted-foreground">运行中</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><AlertTriangle className="h-5 w-5 text-amber-400" /></div>
            <div>
              <p className="text-2xl font-bold">{data.filter((h: any) => h.status === "degraded").length}</p>
              <p className="text-xs text-muted-foreground">性能下降</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10"><WifiOff className="h-5 w-5 text-red-400" /></div>
            <div>
              <p className="text-2xl font-bold">{data.filter((h: any) => h.status === "offline").length}</p>
              <p className="text-xs text-muted-foreground">离线</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[200px] rounded-xl bg-card border border-border animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((h: any) => {
            const status = statusConfig[h.status] || statusConfig.offline;
            const StatusIcon = status.icon;
            return (
              <Link key={h.id} href={`/agents/${h.agentId}`}>
                <Card className={`hover:border-primary/20 transition-colors ${h.status === "offline" ? "border-red-500/20" : h.status === "degraded" ? "border-amber-500/20" : ""}`}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <StatusIcon className={`h-4 w-4 ${h.status === "running" ? "text-emerald-400" : h.status === "offline" ? "text-red-400" : "text-amber-400"}`} />
                      {h.agent?.name || "未知"}
                    </CardTitle>
                    <Badge variant={status.color}>{status.label}</Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><p className="text-xs text-muted-foreground">运行时间</p><p className="text-sm font-medium">{formatUptime(h.uptime)}</p></div>
                      <div className="space-y-1"><p className="text-xs text-muted-foreground">内存</p><p className="text-sm font-medium">{formatMemory(h.memoryMb)}</p></div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">CPU 使用率</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                            <div className={`h-full rounded-full ${h.cpuPercent > 80 ? "bg-red-400" : h.cpuPercent > 50 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(h.cpuPercent, 100)}%` }} />
                          </div>
                          <span className="text-xs">{h.cpuPercent.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="space-y-1"><p className="text-xs text-muted-foreground">重启次数</p><p className="text-sm font-medium">{h.restartCount}</p></div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />上次心跳：{h.lastHeartbeat ? timeAgo(h.lastHeartbeat) : "从未"}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
