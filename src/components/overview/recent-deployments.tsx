"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket, CheckCircle2, XCircle, Clock } from "lucide-react";
import { timeAgo } from "@/lib/utils";

const statusIcons: Record<string, any> = { success: CheckCircle2, failed: XCircle, pending: Clock, deploying: Clock, rolled_back: XCircle };
const statusColors: Record<string, "success" | "destructive" | "warning" | "secondary"> = { success: "success", failed: "destructive", pending: "warning", deploying: "secondary", rolled_back: "destructive" };

interface Deployment {
  id: string; status: string; gitCommit?: string; imageTag?: string; deployedAt?: string;
  agent: { name: string; slug: string }; version?: { versionTag: string };
}

export function RecentDeployments({ deployments }: { deployments: Deployment[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">最近部署</CardTitle>
        <Rocket className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {deployments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">暂无最近部署</p>
        ) : (
          deployments.map((d) => {
            const Icon = statusIcons[d.status] || Clock;
            return (
              <div key={d.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={d.status === "success" ? "h-4 w-4 shrink-0 text-emerald-400" : d.status === "failed" ? "h-4 w-4 shrink-0 text-red-400" : "h-4 w-4 shrink-0 text-amber-400"} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.agent.name}</p>
                    <p className="text-xs text-muted-foreground">{d.version?.versionTag || "N/A"} · {d.gitCommit?.slice(0, 7) || "N/A"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={statusColors[d.status] || "secondary"} className="text-[10px]">{d.status}</Badge>
                  <span className="text-xs text-muted-foreground">{d.deployedAt ? timeAgo(d.deployedAt) : ""}</span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
