"use client";
import { useState, useEffect } from "react";
import { use } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Bot, ArrowLeft, GitBranch, Tag, Cpu, Wrench, Rocket, Play } from "lucide-react";
import { formatCost, formatTokens, formatLatency, timeAgo, formatUptime, formatMemory } from "@/lib/utils";

const statusConfig: Record<string, { color: "success" | "destructive" | "warning"; label: string }> = {
  running: { color: "success", label: "运行中" },
  offline: { color: "destructive", label: "离线" },
  degraded: { color: "warning", label: "降级" },
};

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [agent, setAgent] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/agents/${id}`).then((r) => r.json()),
      fetch(`/api/agents/${id}/versions`).then((r) => r.json()),
    ])
      .then(([agentData, versionsData]) => {
        setAgent(agentData);
        setVersions(versionsData);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading || !agent) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  }

  const health = agent.health;
  const healthStatus = statusConfig[health?.status] || statusConfig.offline;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/agents"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary/50"><Bot className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{agent.name}</h1>
              <p className="text-sm text-muted-foreground">{agent.description}</p>
            </div>
          </div>
        </div>
        <Badge variant={healthStatus.color}>{healthStatus.label}</Badge>
      </div>

      {health && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">运行时间</p><p className="text-lg font-bold">{formatUptime(health.uptime)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">内存</p><p className="text-lg font-bold">{formatMemory(health.memoryMb)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">CPU</p><p className="text-lg font-bold">{health.cpuPercent.toFixed(1)}%</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">重启次数</p><p className="text-lg font-bold">{health.restartCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">最后心跳</p><p className="text-lg font-bold">{health.lastHeartbeat ? timeAgo(health.lastHeartbeat) : "N/A"}</p></CardContent></Card>
        </div>
      )}

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions"><Tag className="h-3.5 w-3.5 mr-1.5" />版本</TabsTrigger>
          <TabsTrigger value="deployments"><Rocket className="h-3.5 w-3.5 mr-1.5" />部署</TabsTrigger>
          <TabsTrigger value="executions"><Play className="h-3.5 w-3.5 mr-1.5" />执行记录</TabsTrigger>
          <TabsTrigger value="config"><Wrench className="h-3.5 w-3.5 mr-1.5" />配置</TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="space-y-3 mt-4">
          {versions.map((v: any) => (
            <Card key={v.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-secondary/50"><Tag className="h-4 w-4 text-primary" /></div>
                  <div>
                    <p className="font-medium text-sm">{v.versionTag}</p>
                    <p className="text-xs text-muted-foreground">{v.changelog || "暂无变更日志"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" />{v.gitCommit?.slice(0, 7) || "N/A"}</span>
                  <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{v.modelRef || "N/A"}</span>
                  <span>{v.imageTag?.split(":").pop() || "N/A"}</span>
                  <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
          {versions.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">暂无版本</p>}
        </TabsContent>

        <TabsContent value="deployments" className="space-y-3 mt-4">
          {agent.deployments?.map((d: any) => (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-secondary/50"><Rocket className="h-4 w-4" /></div>
                  <div>
                    <p className="font-medium text-sm">{d.version?.versionTag || "未知"}</p>
                    <p className="text-xs text-muted-foreground">{d.gitCommit?.slice(0, 7)} · {d.imageTag || "N/A"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={d.status === "success" ? "success" : d.status === "failed" ? "destructive" : "secondary"}>{d.status}</Badge>
                  <span className="text-xs text-muted-foreground">{d.deployedAt ? timeAgo(d.deployedAt) : ""}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="executions" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">请求 ID</th>
                    <th className="p-3 font-medium">Token</th>
                    <th className="p-3 font-medium">成本</th>
                    <th className="p-3 font-medium">延迟</th>
                    <th className="p-3 font-medium">状态</th>
                    <th className="p-3 font-medium">时间</th>
                  </tr></thead>
                  <tbody>
                    {agent.recentExecutions?.map((e: any) => (
                      <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                        <td className="p-3 font-mono text-xs">{e.requestId.slice(0, 20)}...</td>
                        <td className="p-3">{formatTokens(e.totalTokens)}</td>
                        <td className="p-3">{formatCost(e.cost)}</td>
                        <td className="p-3">{formatLatency(e.latencyMs)}</td>
                        <td className="p-3"><Badge variant={e.status === "success" ? "success" : "destructive"}>{e.status}</Badge></td>
                        <td className="p-3 text-muted-foreground">{timeAgo(e.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">智能体信息</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">模型</span><span>{agent.model}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">端点</span><span className="font-mono text-xs">{agent.endpoint || "N/A"}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">状态</span><Badge variant={healthStatus.color}>{healthStatus.label}</Badge></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">标签</span><div className="flex gap-1">{agent.tags?.map((t: string) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}</div></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">最新版本配置</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {versions[0] && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">代码引用</span><span className="font-mono text-xs">{versions[0].codeRef || "N/A"}</span></div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">提示词引用</span><span className="font-mono text-xs">{versions[0].promptRef?.slice(0, 16) || "N/A"}</span></div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">镜像</span><span className="font-mono text-xs">{versions[0].imageTag || "N/A"}</span></div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">Git 提交</span><span className="font-mono text-xs">{versions[0].gitCommit || "N/A"}</span></div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
