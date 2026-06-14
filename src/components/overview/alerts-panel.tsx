"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, WifiOff } from "lucide-react";

interface UnhealthyAgent {
  id: string; status: string;
  agent: { id: string; name: string; slug: string };
}

export function AlertsPanel({ alerts }: { alerts: UnhealthyAgent[] }) {
  return (
    <Card className={alerts.length > 0 ? "border-red-500/20" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">告警</CardTitle>
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length === 0 ? (
          <p className="text-sm text-emerald-400 text-center py-4">所有系统运行正常</p>
        ) : (
          alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                {a.status === "offline" ? <WifiOff className="h-4 w-4 text-red-400" /> : <AlertCircle className="h-4 w-4 text-amber-400" />}
                <div>
                  <p className="text-sm font-medium">{a.agent.name}</p>
                  <p className="text-xs text-muted-foreground">{a.status === "offline" ? "智能体离线" : "性能下降"}</p>
                </div>
              </div>
              <Badge variant={a.status === "offline" ? "destructive" : "warning"} className="text-[10px]">{a.status}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
