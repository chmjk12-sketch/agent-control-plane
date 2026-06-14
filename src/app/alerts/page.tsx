"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  AlertTriangle,
  ShieldAlert,
  Info,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";

const severityConfig: Record<
  string,
  { icon: any; color: "destructive" | "warning" | "secondary"; label: string }
> = {
  critical: {
    icon: ShieldAlert,
    color: "destructive",
    label: "严重",
  },
  warning: {
    icon: AlertTriangle,
    color: "warning",
    label: "警告",
  },
  info: {
    icon: Info,
    color: "secondary",
    label: "信息",
  },
};

const typeConfig: Record<string, string> = {
  health: "健康",
  deployment: "部署",
  cost: "成本",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [resolving, setResolving] = useState<string[]>([]);

  const fetchAlerts = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set("type", typeFilter);
    if (severityFilter) params.set("severity", severityFilter);
    params.set("unresolved", "true");
    const qs = params.toString();
    fetch(`/api/alerts${qs ? "?" + qs : ""}`)
      .then((r) => r.json())
      .then((data) => setAlerts(data.data || []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [typeFilter, severityFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleResolve = async (alertIds: string[]) => {
    setResolving((prev) => [...prev, ...alertIds]);
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertIds }),
      });
      if (res.ok) {
        fetchAlerts();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setResolving((prev) => prev.filter((id) => !alertIds.includes(id)));
    }
  };

  const unresolvedAlerts = alerts.filter((a) => !a.resolved);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">告警中心</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看和管理智能体告警事件
          </p>
        </div>
        {unresolvedAlerts.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              handleResolve(unresolvedAlerts.map((a) => a.id))
            }
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            全部解决
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="告警类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="health">健康</SelectItem>
            <SelectItem value="deployment">部署</SelectItem>
            <SelectItem value="cost">成本</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="严重程度" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="critical">严重</SelectItem>
            <SelectItem value="warning">警告</SelectItem>
            <SelectItem value="info">信息</SelectItem>
          </SelectContent>
        </Select>
        {(typeFilter || severityFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTypeFilter("");
              setSeverityFilter("");
            }}
          >
            清除筛选
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[72px] rounded-xl bg-card border border-border animate-pulse"
            />
          ))}
        </div>
      ) : unresolvedAlerts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="font-medium mb-1">暂无未解决告警</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              所有告警已处理完毕。系统将持续监控智能体健康状态。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {unresolvedAlerts.map((alert) => {
            const severity =
              severityConfig[alert.severity] || severityConfig.info;
            const SeverityIcon = severity.icon;
            return (
              <Card key={alert.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-secondary/50">
                      <SeverityIcon
                        className={`h-4 w-4 text-${severity.color}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{alert.message}</p>
                        <Badge variant={severity.color} className="text-[10px]">
                          {severity.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {typeConfig[alert.type] || alert.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {alert.agent?.name || "未知智能体"} ·{" "}
                        {timeAgo(alert.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResolve([alert.id])}
                    disabled={resolving.includes(alert.id)}
                  >
                    {resolving.includes(alert.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
