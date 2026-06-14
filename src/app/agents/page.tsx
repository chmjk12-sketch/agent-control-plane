"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Plus, Search, Wifi, WifiOff, AlertTriangle, ArrowRight } from "lucide-react";
import { formatCost } from "@/lib/utils";

const statusConfig: Record<string, { icon: any; color: "success" | "destructive" | "warning"; label: string }> = {
  online: { icon: Wifi, color: "success", label: "在线" },
  offline: { icon: WifiOff, color: "destructive", label: "离线" },
  degraded: { icon: AlertTriangle, color: "warning", label: "降级" },
};

export default function AgentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    const qs = params.toString();
    fetch(`/api/agents${qs ? "?" + qs : ""}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">智能体</h1>
          <p className="text-sm text-muted-foreground mt-1">管理和监控您的 AI 智能体</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />新建智能体</Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜索智能体..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="全部状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="online">在线</SelectItem>
            <SelectItem value="offline">离线</SelectItem>
            <SelectItem value="degraded">降级</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter("")}>清除</Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[180px] rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.data?.map((agent: any) => {
            const status = statusConfig[agent.status] || statusConfig.offline;
            const StatusIcon = status.icon;
            return (
              <Link key={agent.id} href={`/agents/${agent.id}`}>
                <Card className="hover:border-primary/30 transition-all duration-200 cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-secondary/50"><Bot className="h-5 w-5 text-muted-foreground" /></div>
                        <div>
                          <h3 className="font-medium text-sm group-hover:text-primary transition-colors">{agent.name}</h3>
                          <p className="text-xs text-muted-foreground">{agent.model}</p>
                        </div>
                      </div>
                      <Badge variant={status.color} className="flex items-center gap-1">
                        <StatusIcon className="h-3 w-3" />{status.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-4 min-h-[32px]">{agent.description || "暂无描述"}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
                      <div className="flex gap-4">
                        <span>v{agent.currentVersion}</span>
                        <span>{agent.todayRequests} 请求</span>
                        <span>{formatCost(agent.todayCost)}</span>
                      </div>
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {data?.data?.length === 0 && (
        <div className="text-center py-12">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">未找到智能体</p>
        </div>
      )}
    </div>
  );
}
