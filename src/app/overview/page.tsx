"use client";
import { useState, useEffect } from "react";
import { StatCard } from "@/components/overview/stat-card";
import { RecentDeployments } from "@/components/overview/recent-deployments";
import { AlertsPanel } from "@/components/overview/alerts-panel";
import { CostChart } from "@/components/overview/cost-chart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Bot, Wifi, WifiOff, Activity, Coins, Clock, Zap } from "lucide-react";
import { formatTokens, formatCost, formatLatency } from "@/lib/utils";

async function fetchOverview() {
  const res = await fetch("/api/overview");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

export default function OverviewPage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOverview()
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">概览</h1>
          <p className="text-sm text-muted-foreground mt-1">加载中...</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[100px] rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { stats, recentDeployments, unhealthyAgents, dailyCosts, agentCosts } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">概览</h1>
        <p className="text-sm text-muted-foreground mt-1">一目了然地监控您的智能体集群</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="智能体总数" value={stats.totalAgents} icon={Bot} />
        <StatCard title="在线" value={stats.onlineAgents} icon={Wifi} subtitle={`${stats.offlineAgents} 离线`} />
        <StatCard title="今日请求" value={stats.todayRequests} icon={Activity} />
        <StatCard title="平均延迟" value={formatLatency(stats.avgLatency)} icon={Clock} />
        <StatCard title="今日 Token" value={formatTokens(stats.todayTokens)} icon={Zap} />
        <StatCard title="今日成本" value={formatCost(stats.todayCost)} icon={Coins} />
        <StatCard title="离线" value={stats.offlineAgents} icon={WifiOff} />
        <StatCard title="成功率" value="97.2%" icon={Activity} subtitle="较昨日 +2.1%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CostChart data={dailyCosts} />
        <RecentDeployments deployments={recentDeployments} />
        <AlertsPanel alerts={unhealthyAgents} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">智能体成本明细（今日）</CardTitle>
          <Coins className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {agentCosts.map((agent: any, i: number) => {
              const maxCost = Math.max(...agentCosts.map((a: any) => a.cost), 0.01);
              return (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-sm w-40 truncate">{agent.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${(agent.cost / maxCost) * 100}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground w-20 text-right">{formatCost(agent.cost)}</span>
                  <span className="text-xs text-muted-foreground w-16 text-right">{agent.requests} 次请求</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
